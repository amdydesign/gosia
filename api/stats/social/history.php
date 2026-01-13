<?php
/**
 * Get Social Stats History
 * GET /api/stats/social/history.php
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Database.php';
require_once __DIR__ . '/../../config/Response.php';
require_once __DIR__ . '/../../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();

    // 30 days history
    $stmt = $conn->prepare("
        SELECT platform, followers_count, date
        FROM social_stats
        WHERE user_id = :user_id
        AND date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        ORDER BY date ASC
    ");

    $stmt->execute(['user_id' => $userId]);
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Group by platform
    $history = [
        'facebook' => [],
        'instagram' => [],
        'tiktok' => [],
        'youtube' => []
    ];

    foreach ($results as $row) {
        if (isset($history[$row['platform']])) {
            $history[$row['platform']][] = [
                'date' => $row['date'],
                'count' => intval($row['followers_count'])
            ];
        }
    }

    Response::success($history);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Fetch failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch history', 500);
}
