<?php
declare(strict_types=1);

require_once __DIR__ . '/src/bootstrap.php';

$pdo = db();
$cfg = settings($pdo);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $mode = $_GET['hub_mode'] ?? $_GET['hub.mode'] ?? '';
    $token = $_GET['hub_verify_token'] ?? $_GET['hub.verify_token'] ?? '';
    $challenge = $_GET['hub_challenge'] ?? $_GET['hub.challenge'] ?? '';

    if ($mode === 'subscribe' && $token !== '' && hash_equals((string)$cfg['verify_token'], $token)) {
        header('Content-Type: text/plain; charset=utf-8');
        echo $challenge;
        exit;
    }

    http_response_code(403);
    echo 'Forbidden';
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo 'Method Not Allowed';
    exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo 'Bad JSON';
    exit;
}

foreach (($payload['entry'] ?? []) as $entry) {
    foreach (($entry['changes'] ?? []) as $change) {
        $value = $change['value'] ?? [];
        $names = [];
        foreach (($value['contacts'] ?? []) as $contact) {
            if (!empty($contact['wa_id'])) {
                $names[$contact['wa_id']] = $contact['profile']['name'] ?? null;
            }
        }

        foreach (($value['messages'] ?? []) as $message) {
            $waId = (string)($message['from'] ?? '');
            if ($waId === '') {
                continue;
            }

            $contactId = upsert_contact($pdo, $waId, $names[$waId] ?? null);
            $conversationId = conversation_for_contact($pdo, $contactId);
            $body = message_text($message);
            $type = (string)($message['type'] ?? 'text');
            $createdAt = !empty($message['timestamp']) ? date('Y-m-d H:i:s', (int)$message['timestamp']) : date('Y-m-d H:i:s');

            $st = $pdo->prepare("
                INSERT OR IGNORE INTO messages
                    (conversation_id, meta_message_id, direction, message_type, body, status, raw_payload, created_at)
                VALUES
                    (?, ?, 'inbound', ?, ?, 'received', ?, ?)
            ");
            $st->execute([
                $conversationId,
                $message['id'] ?? null,
                $type,
                $body,
                json_encode($message, JSON_UNESCAPED_UNICODE),
                $createdAt,
            ]);

            if ($st->rowCount() > 0) {
                $up = $pdo->prepare("
                    UPDATE conversations
                    SET unread_count = unread_count + 1,
                        status = 'open',
                        last_message_preview = ?,
                        last_message_at = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ");
                $up->execute([mb_substr($body, 0, 480), $createdAt, $conversationId]);
            }
        }

        foreach (($value['statuses'] ?? []) as $status) {
            if (!empty($status['id'])) {
                $st = $pdo->prepare('UPDATE messages SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE meta_message_id = ?');
                $st->execute([(string)($status['status'] ?? ''), (string)$status['id']]);
            }
        }
    }
}

ok();
