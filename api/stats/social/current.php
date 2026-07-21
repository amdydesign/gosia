<?php
/**
 * Get Current Social Stats
 * GET /api/stats/social/current.php
 */

require_once __DIR__ . '/../../bootstrap.php';
requireMethod('GET');

try {
    $userId = getCurrentUserId();
    $conn = db();

    // Get latest entry for each platform
    // Subquery is needed to find the latest date per platform
    $stmt = $conn->prepare("
        SELECT s.platform, s.followers_count, s.date
        FROM social_stats s
        INNER JOIN (
            SELECT platform, MAX(date) as max_date
            FROM social_stats
            WHERE user_id = :user_id
            GROUP BY platform
        ) latest ON s.platform = latest.platform AND s.date = latest.max_date
        WHERE s.user_id = :user_id2
    ");

    $stmt->execute(['user_id' => $userId, 'user_id2' => $userId]);
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Format as simple key-value object for frontend
    $data = [];
    foreach ($results as $row) {
        $data[$row['platform']] = [
            'count' => intval($row['followers_count']),
            'date' => $row['date']
        ];
    }

    // Ensure all platforms exist in response
    $platforms = ['facebook', 'instagram', 'tiktok', 'youtube'];
    foreach ($platforms as $platform) {
        if (!isset($data[$platform])) {
            $data[$platform] = ['count' => 0, 'date' => null];
        }
    }

    Response::success($data);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Fetch failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch stats', 500);
}
