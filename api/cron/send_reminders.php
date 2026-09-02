<?php
/**
 * Daily Push Reminders (cron)
 *
 * Sends push notifications about:
 *  - purchases whose return deadline is within 2 days (status 'kept')
 *  - collaborations with overdue payments
 *
 * Run once a day, e.g. on dHosting:
 *   CLI cron:  php /path/to/public_html/api/cron/send_reminders.php
 *   URL cron:  https://domena.pl/api/cron/send_reminders.php?secret=CRON_SECRET
 * (the URL variant requires CRON_SECRET to be set in api/.env)
 */

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/WebPush.php';

$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->safeLoad();

$isCli = php_sapi_name() === 'cli';

if (!$isCli) {
    header('Content-Type: application/json; charset=utf-8');
    $secret = $_ENV['CRON_SECRET'] ?? '';
    if ($secret === '' || !hash_equals($secret, $_GET['secret'] ?? '')) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Forbidden']);
        exit;
    }
}

if (!WebPush::isConfigured()) {
    $msg = 'VAPID keys not configured - nothing to send';
    echo $isCli ? $msg . "\n" : json_encode(['success' => false, 'message' => $msg]);
    exit;
}

try {
    $db = new Database();
    $conn = $db->getConnection();
    $webPush = new WebPush();

    $notifications = []; // user_id => list of payloads

    // 1. Return deadlines within 2 days
    $stmt = $conn->query("
        SELECT user_id, store, items,
               DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) as days_remaining,
               id
        FROM purchases
        WHERE status IN ('kept', 'partial')
        AND DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) BETWEEN 0 AND 2
        ORDER BY days_remaining ASC
    ");
    foreach ($stmt->fetchAll() as $row) {
        $days = (int) $row['days_remaining'];
        if ($days === 0) {
            $when = 'DZIŚ mija termin zwrotu';
        } elseif ($days === 1) {
            $when = 'Jutro mija termin zwrotu';
        } else {
            $when = "Za {$days} dni mija termin zwrotu";
        }
        $notifications[$row['user_id']][] = [
            'title' => '⏰ ' . $when,
            'body' => $row['store'] . ' — ' . $row['items'],
            'url' => '/purchases/' . $row['id'],
        ];
    }

    // 2. Overdue payments
    $stmt = $conn->query("
        SELECT user_id, COUNT(*) as cnt, COALESCE(SUM(amount_gross), 0) as total
        FROM collaborations
        WHERE payment_status = 'overdue'
        GROUP BY user_id
    ");
    foreach ($stmt->fetchAll() as $row) {
        $notifications[$row['user_id']][] = [
            'title' => '💸 Zaległe płatności',
            'body' => 'Masz ' . $row['cnt'] . ' nieopłacone współprace na łącznie '
                . number_format((float) $row['total'], 2, ',', ' ') . ' zł',
            'url' => '/collaborations',
        ];
    }

    // Send
    $sent = 0;
    foreach ($notifications as $userId => $payloads) {
        foreach ($payloads as $payload) {
            $sent += $webPush->sendToUser($conn, $userId, $payload);
        }
    }

    $summary = [
        'success' => true,
        'users_notified' => count($notifications),
        'messages_delivered' => $sent,
    ];
    echo $isCli
        ? "Done. Users: {$summary['users_notified']}, delivered: {$sent}\n"
        : json_encode($summary);

} catch (Exception $e) {
    if ($isCli) {
        fwrite(STDERR, 'Error: ' . $e->getMessage() . "\n");
        exit(1);
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Cron failed']);
}
