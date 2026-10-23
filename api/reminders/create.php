<?php
/**
 * "Przypomnij później": hide a Start item until remind_at, then send a push.
 * POST /api/reminders/create.php
 *   { ref_key: "return:zalando", title: "Odeślij paczkę do Zalando", url?: "/purchases",
 *     preset?: "hour" | "evening" | "tomorrow"  (or remind_at: "YYYY-MM-DD HH:MM") }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    $refKey = trim((string) ($input['ref_key'] ?? ''));
    $title = trim((string) ($input['title'] ?? ''));
    $url = (string) ($input['url'] ?? '/dashboard');
    if ($refKey === '' || $title === '') {
        Response::validationError(['ref_key' => 'ref_key and title are required']);
    }
    if ($url === '' || $url[0] !== '/' || strpos($url, '//') === 0) {
        $url = '/dashboard';
    }

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'reminders');

    $now = new DateTime();
    $preset = $input['preset'] ?? 'tomorrow';
    if (!empty($input['remind_at']) && ($at = DateTime::createFromFormat('Y-m-d H:i', $input['remind_at'])) && $at > $now) {
        $remindAt = $at;
    } elseif ($preset === 'hour') {
        $remindAt = (clone $now)->modify('+1 hour');
    } elseif ($preset === 'evening' && (int) $now->format('G') < 19) {
        $remindAt = (clone $now)->setTime(19, 0);
    } else {
        $remindAt = (clone $now)->modify('+1 day')->setTime(9, 0);
    }

    // One pending reminder per thing - snoozing again moves it
    $conn->prepare("DELETE FROM reminders WHERE user_id = :user_id AND ref_key = :ref_key AND sent_at IS NULL")
        ->execute(['user_id' => $userId, 'ref_key' => $refKey]);
    $stmt = $conn->prepare("
        INSERT INTO reminders (user_id, ref_key, title, url, remind_at)
        VALUES (:user_id, :ref_key, :title, :url, :remind_at)
    ");
    $stmt->execute([
        'user_id' => $userId,
        'ref_key' => mb_substr($refKey, 0, 120),
        'title' => mb_substr($title, 0, 255),
        'url' => mb_substr($url, 0, 255),
        'remind_at' => $remindAt->format('Y-m-d H:i:s'),
    ]);

    Response::success([
        'id' => (int) $conn->lastInsertId(),
        'remind_at' => $remindAt->format('Y-m-d H:i:s'),
    ], 'Reminder set');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Failed to set reminder: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się ustawić przypomnienia', 500);
}
