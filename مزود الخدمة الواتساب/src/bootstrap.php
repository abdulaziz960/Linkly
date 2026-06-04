<?php
declare(strict_types=1);

const APP_NAME = 'AudienceW';

function app_path(string $path = ''): string
{
    $base = dirname(__DIR__);
    return $path === '' ? $base : $base . '/' . ltrim($path, '/');
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $dataDir = app_path('data');
    if (!is_dir($dataDir)) {
        mkdir($dataDir, 0775, true);
    }

    $pdo = new PDO('sqlite:' . app_path('data/app.sqlite'));
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');

    migrate($pdo);
    return $pdo;
}

function migrate(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            phone_number_id TEXT,
            waba_id TEXT,
            business_phone TEXT,
            access_token TEXT,
            verify_token TEXT NOT NULL,
            graph_version TEXT NOT NULL DEFAULT 'v25.0',
            is_active INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wa_id TEXT NOT NULL UNIQUE,
            name TEXT,
            phone TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER NOT NULL UNIQUE,
            assigned_to TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            unread_count INTEGER NOT NULL DEFAULT 0,
            tags TEXT,
            last_message_preview TEXT,
            last_message_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            meta_message_id TEXT UNIQUE,
            direction TEXT NOT NULL,
            message_type TEXT NOT NULL DEFAULT 'text',
            body TEXT,
            status TEXT,
            raw_payload TEXT,
            sent_by TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS agents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'support',
            email TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            active_chats INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS crm_deals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER,
            title TEXT NOT NULL,
            stage TEXT NOT NULL DEFAULT 'new',
            value INTEGER NOT NULL DEFAULT 0,
            owner TEXT,
            next_step TEXT,
            due_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            audience TEXT NOT NULL,
            channel TEXT NOT NULL DEFAULT 'whatsapp',
            status TEXT NOT NULL DEFAULT 'draft',
            sent_count INTEGER NOT NULL DEFAULT 0,
            reply_rate INTEGER NOT NULL DEFAULT 0,
            scheduled_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS automations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trigger_name TEXT NOT NULL,
            reply_body TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            handoff_to TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price INTEGER NOT NULL,
            conversations_limit INTEGER NOT NULL,
            agents_limit INTEGER NOT NULL,
            features TEXT NOT NULL
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS tenants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            plan_name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'trial',
            trial_ends_at TEXT,
            seats INTEGER NOT NULL DEFAULT 3,
            monthly_messages INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS trial_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            contact_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            plan_name TEXT,
            intent TEXT NOT NULL DEFAULT 'trial',
            auth_provider TEXT NOT NULL DEFAULT 'form',
            team_size TEXT,
            status TEXT NOT NULL DEFAULT 'new',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    ");

    $exists = (int)$pdo->query('SELECT COUNT(*) FROM settings')->fetchColumn();
    if ($exists === 0) {
        $st = $pdo->prepare("INSERT INTO settings (id, verify_token) VALUES (1, ?)");
        $st->execute([bin2hex(random_bytes(16))]);
    }

    seed_demo_data($pdo);
}

function seed_demo_data(PDO $pdo): void
{
    if ((int)$pdo->query('SELECT COUNT(*) FROM agents')->fetchColumn() === 0) {
        $agents = [
            ['سارة العتيبي', 'support_lead', 'sarah@example.com', 6],
            ['ماجد الحربي', 'sales', 'majed@example.com', 4],
            ['نورة القحطاني', 'support', 'noura@example.com', 3],
        ];
        $st = $pdo->prepare('INSERT INTO agents (name, role, email, active_chats) VALUES (?, ?, ?, ?)');
        foreach ($agents as $agent) {
            $st->execute($agent);
        }
    }

    if ((int)$pdo->query('SELECT COUNT(*) FROM plans')->fetchColumn() === 0) {
        $plans = [
            ['Starter', 199, 2000, 3, 'صندوق وارد موحد، CRM أساسي، ردود سريعة، تجربة مجانية 14 يوم'],
            ['Growth', 499, 12000, 10, 'توزيع ذكي، حملات واتساب، رد آلي، تقارير SLA، صلاحيات'],
            ['Scale', 999, 50000, 30, 'إدارة متعددة الفروع، API، Webhooks، مدير نجاح، تقارير متقدمة'],
        ];
        $st = $pdo->prepare('INSERT INTO plans (name, price, conversations_limit, agents_limit, features) VALUES (?, ?, ?, ?, ?)');
        foreach ($plans as $plan) {
            $st->execute($plan);
        }
    }

    if ((int)$pdo->query('SELECT COUNT(*) FROM tenants')->fetchColumn() === 0) {
        $tenants = [
            ['عيادات النخبة', 'Growth', 'active', date('Y-m-d', strtotime('+11 days')), 8, 8420],
            ['متجر الرياض للعطور', 'Starter', 'trial', date('Y-m-d', strtotime('+13 days')), 3, 1240],
            ['شركة مدار العقارية', 'Scale', 'active', date('Y-m-d', strtotime('+5 days')), 18, 23110],
        ];
        $st = $pdo->prepare('INSERT INTO tenants (company_name, plan_name, status, trial_ends_at, seats, monthly_messages) VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($tenants as $tenant) {
            $st->execute($tenant);
        }
    }

    if ((int)$pdo->query('SELECT COUNT(*) FROM campaigns')->fetchColumn() === 0) {
        $campaigns = [
            ['عرض العودة', 'عملاء مهتمين آخر 30 يوم', 'whatsapp', 'scheduled', 0, 0, date('Y-m-d H:i:s', strtotime('+1 day'))],
            ['استرجاع السلات', 'سلات متروكة', 'whatsapp', 'running', 1840, 31, date('Y-m-d H:i:s')],
            ['ترحيب التجربة المجانية', 'مشتركين جدد', 'email', 'active', 420, 44, date('Y-m-d H:i:s', strtotime('-2 days'))],
        ];
        $st = $pdo->prepare('INSERT INTO campaigns (name, audience, channel, status, sent_count, reply_rate, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        foreach ($campaigns as $campaign) {
            $st->execute($campaign);
        }
    }

    if ((int)$pdo->query('SELECT COUNT(*) FROM automations')->fetchColumn() === 0) {
        $rules = [
            ['خارج أوقات العمل', 'وصلتنا رسالتك، فريقنا بيرجع لك مع بداية الدوام. تقدر تترك رقم الطلب أو الخدمة المطلوبة.', 'active', 'فريق الدعم'],
            ['عميل جديد من إعلان', 'أهلًا! شكرًا لتواصلك معنا. اختر الخدمة المطلوبة: 1) الأسعار 2) عرض تجريبي 3) محادثة موظف.', 'active', 'المبيعات'],
            ['تصعيد شكوى', 'تم تسجيل طلبك وتصعيده للمشرف. بنرجع لك بتحديث قريب.', 'paused', 'مشرف الخدمة'],
        ];
        $st = $pdo->prepare('INSERT INTO automations (trigger_name, reply_body, status, handoff_to) VALUES (?, ?, ?, ?)');
        foreach ($rules as $rule) {
            $st->execute($rule);
        }
    }

    if ((int)$pdo->query('SELECT COUNT(*) FROM crm_deals')->fetchColumn() === 0) {
        $contactId = upsert_contact($pdo, '966555111222', 'مطعم لافندر');
        $conversationId = conversation_for_contact($pdo, $contactId);
        $pdo->prepare("
            UPDATE conversations
            SET assigned_to = 'ماجد الحربي',
                status = 'open',
                unread_count = 2,
                tags = 'lead,ads',
                last_message_preview = 'نحتاج باقة فيها 8 موظفين وحملات',
                last_message_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ")->execute([$conversationId]);
        $pdo->prepare("
            INSERT INTO messages (conversation_id, direction, message_type, body, status, created_at)
            VALUES (?, 'inbound', 'text', 'نحتاج باقة فيها 8 موظفين وحملات', 'received', CURRENT_TIMESTAMP)
        ")->execute([$conversationId]);

        $deals = [
            [$contactId, 'اشتراك مطعم لافندر', 'qualified', 499, 'ماجد الحربي', 'إرسال عرض Growth', date('Y-m-d', strtotime('+2 days'))],
            [null, 'فرع عيادات النخبة الجديد', 'proposal', 999, 'سارة العتيبي', 'مكالمة اعتماد الصلاحيات', date('Y-m-d', strtotime('+4 days'))],
            [null, 'متجر أجهزة - تجربة مجانية', 'new', 199, 'نورة القحطاني', 'متابعة بعد الربط', date('Y-m-d', strtotime('+1 day'))],
        ];
        $st = $pdo->prepare('INSERT INTO crm_deals (contact_id, title, stage, value, owner, next_step, due_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        foreach ($deals as $deal) {
            $st->execute($deal);
        }
    }
}

function json_response(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function ok(mixed $data = null): never
{
    json_response(['ok' => true, 'data' => $data]);
}

function fail(string $message, int $status = 400): never
{
    json_response(['ok' => false, 'msg' => $message], $status);
}

function settings(PDO $pdo): array
{
    $row = $pdo->query('SELECT * FROM settings WHERE id = 1')->fetch();
    return $row ?: [];
}

function upsert_contact(PDO $pdo, string $waId, ?string $name): int
{
    $st = $pdo->prepare("
        INSERT INTO contacts (wa_id, name, phone, updated_at)
        VALUES (:wa_id, :name, :phone, CURRENT_TIMESTAMP)
        ON CONFLICT(wa_id) DO UPDATE SET
            name = COALESCE(NULLIF(excluded.name, ''), contacts.name),
            phone = excluded.phone,
            updated_at = CURRENT_TIMESTAMP
    ");
    $st->execute([':wa_id' => $waId, ':name' => $name, ':phone' => $waId]);

    $st = $pdo->prepare('SELECT id FROM contacts WHERE wa_id = ?');
    $st->execute([$waId]);
    return (int)$st->fetchColumn();
}

function conversation_for_contact(PDO $pdo, int $contactId): int
{
    $st = $pdo->prepare("
        INSERT INTO conversations (contact_id, updated_at)
        VALUES (?, CURRENT_TIMESTAMP)
        ON CONFLICT(contact_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    ");
    $st->execute([$contactId]);

    $st = $pdo->prepare('SELECT id FROM conversations WHERE contact_id = ?');
    $st->execute([$contactId]);
    return (int)$st->fetchColumn();
}

function message_text(array $message): string
{
    $type = (string)($message['type'] ?? 'text');
    if ($type === 'text') {
        return trim((string)($message['text']['body'] ?? ''));
    }
    if (isset($message[$type]['caption'])) {
        return trim((string)$message[$type]['caption']);
    }
    return '[' . $type . ']';
}
