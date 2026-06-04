<?php
declare(strict_types=1);

require_once __DIR__ . '/src/bootstrap.php';

$pdo = db();
$action = strtolower((string)($_GET['action'] ?? $_POST['action'] ?? ''));

if ($action === 'settings') {
    $row = settings($pdo);
    $row['has_access_token'] = !empty($row['access_token']);
    unset($row['access_token']);
    $row['webhook_url'] = '/webhook.php';
    ok($row);
}

if ($action === 'overview') {
    $summary = [
        'open_conversations' => (int)$pdo->query("SELECT COUNT(*) FROM conversations WHERE status = 'open'")->fetchColumn(),
        'unassigned' => (int)$pdo->query("SELECT COUNT(*) FROM conversations WHERE assigned_to IS NULL OR assigned_to = ''")->fetchColumn(),
        'unread' => (int)$pdo->query('SELECT COALESCE(SUM(unread_count), 0) FROM conversations')->fetchColumn(),
        'active_tenants' => (int)$pdo->query("SELECT COUNT(*) FROM tenants WHERE status = 'active'")->fetchColumn(),
        'trial_tenants' => (int)$pdo->query("SELECT COUNT(*) FROM tenants WHERE status = 'trial'")->fetchColumn(),
        'campaign_replies' => (int)$pdo->query('SELECT COALESCE(AVG(reply_rate), 0) FROM campaigns')->fetchColumn(),
    ];

    $latest = $pdo->query("
        SELECT c.*, ct.name, ct.phone
        FROM conversations c
        JOIN contacts ct ON ct.id = c.contact_id
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
        LIMIT 5
    ")->fetchAll();

    ok(['summary' => $summary, 'latest' => $latest]);
}

if ($action === 'workspace') {
    $tables = [
        'agents' => 'SELECT * FROM agents ORDER BY active_chats DESC, name ASC',
        'deals' => 'SELECT d.*, ct.name AS contact_name, ct.phone AS contact_phone FROM crm_deals d LEFT JOIN contacts ct ON ct.id = d.contact_id ORDER BY d.id DESC',
        'campaigns' => 'SELECT * FROM campaigns ORDER BY id DESC',
        'automations' => 'SELECT * FROM automations ORDER BY id DESC',
        'plans' => 'SELECT * FROM plans ORDER BY price ASC',
        'tenants' => 'SELECT * FROM tenants ORDER BY id DESC',
        'trial_requests' => 'SELECT * FROM trial_requests ORDER BY id DESC LIMIT 100',
    ];
    $payload = [];
    foreach ($tables as $key => $sql) {
        $payload[$key] = $pdo->query($sql)->fetchAll();
    }
    ok($payload);
}

if ($action === 'submit_trial') {
    $company = trim((string)($_POST['company_name'] ?? ''));
    $contact = trim((string)($_POST['contact_name'] ?? ''));
    $email = trim((string)($_POST['email'] ?? ''));
    $phone = trim((string)($_POST['phone'] ?? ''));
    $plan = trim((string)($_POST['plan_name'] ?? 'Growth'));
    $intent = trim((string)($_POST['intent'] ?? 'trial')) ?: 'trial';
    $provider = trim((string)($_POST['auth_provider'] ?? 'form')) ?: 'form';
    $teamSize = trim((string)($_POST['team_size'] ?? ''));

    if ($company === '' || $contact === '' || $email === '' || $phone === '') {
        fail('فضلا أكمل بيانات الشركة والمسؤول والبريد والجوال');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('صيغة البريد الإلكتروني غير صحيحة');
    }

    $allowedIntents = ['trial', 'subscribe', 'login'];
    if (!in_array($intent, $allowedIntents, true)) {
        $intent = 'trial';
    }
    $allowedProviders = ['form', 'google', 'facebook'];
    if (!in_array($provider, $allowedProviders, true)) {
        $provider = 'form';
    }

    $st = $pdo->prepare("
        INSERT INTO trial_requests
            (company_name, contact_name, email, phone, plan_name, intent, auth_provider, team_size)
        VALUES
            (?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $st->execute([$company, $contact, $email, $phone, $plan, $intent, $provider, $teamSize]);

    ok([
        'request_id' => (int)$pdo->lastInsertId(),
        'message' => 'تم استلام طلبك وتجهيز تجربة المنصة',
    ]);
}

if ($action === 'save_settings') {
    $token = trim((string)($_POST['access_token'] ?? ''));
    $current = settings($pdo);
    $accessToken = $token !== '' ? $token : ($current['access_token'] ?? null);

    $st = $pdo->prepare("
        UPDATE settings SET
            phone_number_id = :phone_number_id,
            waba_id = :waba_id,
            business_phone = :business_phone,
            access_token = :access_token,
            verify_token = :verify_token,
            graph_version = :graph_version,
            is_active = :is_active,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
    ");
    $st->execute([
        ':phone_number_id' => trim((string)($_POST['phone_number_id'] ?? '')),
        ':waba_id' => trim((string)($_POST['waba_id'] ?? '')),
        ':business_phone' => trim((string)($_POST['business_phone'] ?? '')),
        ':access_token' => $accessToken,
        ':verify_token' => trim((string)($_POST['verify_token'] ?? '')),
        ':graph_version' => trim((string)($_POST['graph_version'] ?? 'v25.0')) ?: 'v25.0',
        ':is_active' => (int)($_POST['is_active'] ?? 0),
    ]);
    ok();
}

if ($action === 'conversations') {
    $filter = (string)($_GET['filter'] ?? 'all');
    $q = trim((string)($_GET['q'] ?? ''));
    $where = [];
    $params = [];

    if ($filter === 'unassigned') {
        $where[] = "(c.assigned_to IS NULL OR c.assigned_to = '')";
    } elseif ($filter === 'mine') {
        $where[] = "c.assigned_to = 'Admin'";
    } elseif ($filter === 'unread') {
        $where[] = 'c.unread_count > 0';
    } elseif ($filter === 'closed') {
        $where[] = "c.status = 'closed'";
    } else {
        $where[] = "c.status <> 'closed'";
    }

    if ($q !== '') {
        $where[] = '(ct.name LIKE :q OR ct.phone LIKE :q OR c.last_message_preview LIKE :q)';
        $params[':q'] = '%' . $q . '%';
    }

    $sql = "
        SELECT c.*, ct.name, ct.phone, ct.wa_id
        FROM conversations c
        JOIN contacts ct ON ct.id = c.contact_id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
        LIMIT 100
    ";
    $st = $pdo->prepare($sql);
    $st->execute($params);
    ok($st->fetchAll());
}

if ($action === 'update_deal_stage') {
    $dealId = (int)($_POST['deal_id'] ?? 0);
    $stage = trim((string)($_POST['stage'] ?? ''));
    $allowed = ['new', 'qualified', 'proposal', 'won', 'lost'];
    if ($dealId <= 0 || !in_array($stage, $allowed, true)) {
        fail('بيانات المرحلة غير صحيحة');
    }
    $pdo->prepare('UPDATE crm_deals SET stage = ? WHERE id = ?')->execute([$stage, $dealId]);
    ok();
}

if ($action === 'toggle_automation') {
    $id = (int)($_POST['id'] ?? 0);
    if ($id <= 0) {
        fail('id مطلوب');
    }
    $pdo->prepare("UPDATE automations SET status = CASE WHEN status = 'active' THEN 'paused' ELSE 'active' END WHERE id = ?")->execute([$id]);
    ok();
}

if ($action === 'messages') {
    $conversationId = (int)($_GET['conversation_id'] ?? 0);
    if ($conversationId <= 0) {
        fail('conversation_id مطلوب');
    }

    $pdo->prepare('UPDATE conversations SET unread_count = 0 WHERE id = ?')->execute([$conversationId]);
    $st = $pdo->prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC LIMIT 300');
    $st->execute([$conversationId]);
    ok($st->fetchAll());
}

if ($action === 'assign') {
    $conversationId = (int)($_POST['conversation_id'] ?? 0);
    if ($conversationId <= 0) {
        fail('conversation_id مطلوب');
    }
    $pdo->prepare("UPDATE conversations SET assigned_to = 'Admin', status = 'open', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        ->execute([$conversationId]);
    ok();
}

if ($action === 'close') {
    $conversationId = (int)($_POST['conversation_id'] ?? 0);
    if ($conversationId <= 0) {
        fail('conversation_id مطلوب');
    }
    $pdo->prepare("UPDATE conversations SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        ->execute([$conversationId]);
    ok();
}

if ($action === 'send') {
    $conversationId = (int)($_POST['conversation_id'] ?? 0);
    $body = trim((string)($_POST['body'] ?? ''));
    if ($conversationId <= 0 || $body === '') {
        fail('المحادثة والرسالة مطلوبة');
    }

    $st = $pdo->prepare("
        SELECT c.id, ct.wa_id
        FROM conversations c
        JOIN contacts ct ON ct.id = c.contact_id
        WHERE c.id = ?
    ");
    $st->execute([$conversationId]);
    $conversation = $st->fetch();
    if (!$conversation) {
        fail('المحادثة غير موجودة', 404);
    }

    $cfg = settings($pdo);
    if (empty($cfg['is_active']) || empty($cfg['access_token']) || empty($cfg['phone_number_id'])) {
        fail('إعدادات Meta غير مكتملة أو غير مفعلة');
    }

    $url = 'https://graph.facebook.com/' . rawurlencode($cfg['graph_version'] ?: 'v25.0')
        . '/' . rawurlencode($cfg['phone_number_id']) . '/messages';
    $payload = [
        'messaging_product' => 'whatsapp',
        'to' => $conversation['wa_id'],
        'type' => 'text',
        'text' => ['preview_url' => false, 'body' => $body],
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $cfg['access_token'],
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
    ]);
    $response = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($response === false || $httpCode < 200 || $httpCode >= 300) {
        fail('فشل الإرسال إلى Meta: ' . ($error ?: (string)$response), 502);
    }

    $json = json_decode((string)$response, true) ?: [];
    $metaId = $json['messages'][0]['id'] ?? null;
    $now = date('Y-m-d H:i:s');

    $st = $pdo->prepare("
        INSERT INTO messages (conversation_id, meta_message_id, direction, message_type, body, status, raw_payload, sent_by, created_at)
        VALUES (?, ?, 'outbound', 'text', ?, 'sent', ?, 'Admin', ?)
    ");
    $st->execute([$conversationId, $metaId, $body, json_encode($json, JSON_UNESCAPED_UNICODE), $now]);

    $st = $pdo->prepare("
        UPDATE conversations
        SET assigned_to = COALESCE(assigned_to, 'Admin'),
            last_message_preview = ?,
            last_message_at = ?,
            status = 'open',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ");
    $st->execute([mb_substr($body, 0, 480), $now, $conversationId]);
    ok(['meta_message_id' => $metaId]);
}

if ($action === 'seed') {
    $contactId = upsert_contact($pdo, '966500000000', 'عميل تجربة');
    $conversationId = conversation_for_contact($pdo, $contactId);
    $now = date('Y-m-d H:i:s');
    $body = 'السلام عليكم، أبغى أعرف سعر السيارة.';
    $st = $pdo->prepare("
        INSERT INTO messages (conversation_id, direction, message_type, body, status, created_at)
        VALUES (?, 'inbound', 'text', ?, 'received', ?)
    ");
    $st->execute([$conversationId, $body, $now]);
    $pdo->prepare("
        UPDATE conversations
        SET unread_count = unread_count + 1,
            last_message_preview = ?,
            last_message_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ")->execute([$body, $now, $conversationId]);
    ok();
}

fail('أكشن غير معروف', 404);
