<?php
/**
 * Remove Push Subscription
 * POST /api/push/unsubscribe.php
 * Body: { "endpoint": "..." }
 */

require_once __DIR__ . '/../bootstrap.php';
requireMethod('POST');

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true);
    $endpoint = trim($input['endpoint'] ?? '');

    if (empty($endpoint)) {
        Response::validationError(['endpoint' => 'Endpoint is required']);
    }

    $conn = db();

    $stmt = $conn->prepare("DELETE FROM push_subscriptions WHERE user_id = :user_id AND endpoint_hash = :endpoint_hash");
    $stmt->execute([
        'user_id' => $userId,
        'endpoint_hash' => hash('sha256', $endpoint),
    ]);

    Response::success(null, 'Subscription removed');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Failed to remove subscription: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to remove subscription', 500);
}
