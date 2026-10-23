<?php
/**
 * Get Social Stats History
 * GET /api/stats/social/history.php?days=30   (days: 7-365, default 30)
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

    $days = max(7, min(365, (int) ($_GET['days'] ?? 30)));
    $stmt = $conn->prepare("
        SELECT platform, followers_count, date
        FROM social_stats
        WHERE user_id = :user_id
        AND date >= :from
        ORDER BY date ASC
    ");

    $stmt->execute(['user_id' => $userId, 'from' => date('Y-m-d', strtotime("-{$days} days"))]);
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
