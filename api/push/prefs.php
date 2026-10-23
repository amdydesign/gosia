<?php
/**
 * Notification settings
 * GET  /api/push/prefs.php        -> prefs + number of devices with notifications on
 * POST /api/push/prefs.php {...}  -> save (partial update)
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/PushPrefs.php';
require_once __DIR__ . '/../middleware/auth.php';

try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $prefs = PushPrefs::save($conn, $userId, $input);
    } elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $prefs = PushPrefs::load($conn, $userId);
    } else {
        Response::error('Method not allowed', 405);
    }

    Schema::ensure($conn, 'push_subscriptions');
    $stmt = $conn->prepare("SELECT COUNT(*) FROM push_subscriptions WHERE user_id = :user_id");
    $stmt->execute(['user_id' => $userId]);

    Response::success(['prefs' => $prefs, 'devices' => (int) $stmt->fetchColumn()]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Push prefs failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się zapisać ustawień powiadomień', 500);
}
