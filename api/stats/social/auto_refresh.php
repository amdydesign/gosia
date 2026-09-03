<?php
/**
 * Automatic follower refresh (called by the app in the background + by cron).
 *
 * POST /api/stats/social/auto_refresh.php
 * Body (optional): { "force": true, "platforms": ["instagram"] }
 *
 * Without params it refreshes only platforms that have no entry for today.
 * Returns per-platform results and the current counts.
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Database.php';
require_once __DIR__ . '/../../config/Response.php';
require_once __DIR__ . '/../../config/SocialFetcher.php';
require_once __DIR__ . '/../../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

// Scraping several platforms can take a while - do not let PHP's default 30s kill it
@set_time_limit(120);
ignore_user_abort(true);

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $force = !empty($input['force']);
    $platforms = isset($input['platforms']) && is_array($input['platforms']) ? $input['platforms'] : null;

    $db = new Database();
    $conn = $db->getConnection();
    $fetcher = new SocialFetcher($conn);

    $results = $fetcher->refreshUser($userId, $platforms, $force);

    // Current counts after refresh
    $stmt = $conn->prepare("
        SELECT s.platform, s.followers_count, s.date
        FROM social_stats s
        INNER JOIN (SELECT platform, MAX(date) AS max_date FROM social_stats WHERE user_id = :uid GROUP BY platform) l
            ON l.platform = s.platform AND l.max_date = s.date
        WHERE s.user_id = :uid2
    ");
    $stmt->execute(['uid' => $userId, 'uid2' => $userId]);
    $current = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $current[$row['platform']] = ['count' => (int) $row['followers_count'], 'date' => $row['date']];
    }

    Response::success([
        'results' => $results,
        'current' => $current,
        'updated' => array_keys(array_filter($results, function ($r) { return !empty($r['ok']); })),
    ]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Refresh failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się odświeżyć statystyk', 500);
}
