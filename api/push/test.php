<?php
/**
 * "Wyślij test" - sends a notification to every device of the user.
 * POST /api/push/test.php -> { delivered, devices }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/WebPush.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    if (!WebPush::isConfigured()) {
        Response::error('Serwer nie może przygotować powiadomień — spróbuj ponownie za chwilę', 503);
    }

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'push_subscriptions');
    $stmt = $conn->prepare("SELECT COUNT(*) FROM push_subscriptions WHERE user_id = :user_id");
    $stmt->execute(['user_id' => $userId]);
    $devices = (int) $stmt->fetchColumn();

    $delivered = (new WebPush())->sendToUser($conn, $userId, [
        'title' => 'Test: działa',
        'body' => 'Tak będą wyglądać przypomnienia z Goni.',
        'url' => '/dashboard',
        'tag' => 'test',
    ]);

    Response::success(['delivered' => $delivered, 'devices' => $devices]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Test push failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się wysłać testu', 500);
}
