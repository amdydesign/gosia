<?php
/**
 * Update Social Stats (For today)
 * POST /api/stats/social/update.php
 */

require_once __DIR__ . '/../../bootstrap.php';
requireMethod('POST');

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true);

    $platform = $input['platform'] ?? '';
    $count = intval($input['count'] ?? 0);
    $date = date('Y-m-d'); // Today

    if (!in_array($platform, ['facebook', 'instagram', 'tiktok', 'youtube'])) {
        Response::error('Invalid platform', 400);
    }

    if ($count < 0) {
        Response::error('Count cannot be negative', 400);
    }

    $conn = db();

    // Upsert: Insert or Update if exists for today
    $stmt = $conn->prepare("
        INSERT INTO social_stats (user_id, platform, followers_count, date)
        VALUES (:user_id, :platform, :count, :date)
        ON DUPLICATE KEY UPDATE followers_count = :count_update
    ");

    $stmt->execute([
        'user_id' => $userId,
        'platform' => $platform,
        'count' => $count,
        'date' => $date,
        'count_update' => $count
    ]);

    Response::success(['message' => 'Stats updated', 'platform' => $platform, 'count' => $count]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Update failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to update stats', 500);
}
