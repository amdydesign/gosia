<?php
/**
 * Save Push Subscription
 * POST /api/push/subscribe.php
 * Body: { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
 * Sends a welcome notification so the user immediately sees it works.
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/WebPush.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true);

    $endpoint = trim($input['endpoint'] ?? '');
    $p256dh = trim($input['keys']['p256dh'] ?? '');
    $auth = trim($input['keys']['auth'] ?? '');

    if (empty($endpoint) || !filter_var($endpoint, FILTER_VALIDATE_URL) || strpos($endpoint, 'https://') !== 0) {
        Response::validationError(['endpoint' => 'Valid https endpoint is required']);
    }
    if (empty($p256dh) || empty($auth)) {
        Response::validationError(['keys' => 'p256dh and auth keys are required']);
    }
    if (strlen(WebPush::base64UrlDecode($p256dh)) !== 65 || strlen(WebPush::base64UrlDecode($auth)) !== 16) {
        Response::validationError(['keys' => 'Invalid subscription key format']);
    }

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'push_subscriptions');

    $stmt = $conn->prepare("
        INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth)
        VALUES (:user_id, :endpoint, :endpoint_hash, :p256dh, :auth)
        ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)
    ");
    $stmt->execute([
        'user_id' => $userId,
        'endpoint' => $endpoint,
        'endpoint_hash' => hash('sha256', $endpoint),
        'p256dh' => $p256dh,
        'auth' => $auth,
    ]);

    // Best-effort welcome push - confirms the whole pipeline works
    $delivered = 0;
    if (WebPush::isConfigured()) {
        try {
            $webPush = new WebPush();
            $status = $webPush->send($endpoint, $p256dh, $auth, [
                'title' => 'Powiadomienia włączone 🎉',
                'body' => 'Będziesz dostawać przypomnienia o zwrotach i zaległych płatnościach.',
                'url' => '/dashboard',
            ]);
            $delivered = ($status >= 200 && $status < 300) ? 1 : 0;
        } catch (Exception $e) {
            // subscription saved anyway
        }
    }

    Response::success(['welcome_sent' => $delivered === 1], 'Subscription saved');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Failed to save subscription: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to save subscription', 500);
}
