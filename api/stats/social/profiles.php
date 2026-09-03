<?php
/**
 * Social profiles (handles) used for automatic follower fetching.
 *
 * GET  /api/stats/social/profiles.php
 *      -> { profiles: {instagram, facebook, youtube, tiktok}, connected: {...}, last: {platform: {attempted_at, success, source, error}}, stale: [...] }
 * POST /api/stats/social/profiles.php  body: { instagram: "nazwa", facebook: "url lub nazwa", youtube: "UC... lub @handle", tiktok: "nazwa" }
 *      -> saves handles and immediately refreshes the platforms that changed
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Database.php';
require_once __DIR__ . '/../../config/Response.php';
require_once __DIR__ . '/../../config/SocialFetcher.php';
require_once __DIR__ . '/../../middleware/auth.php';

try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();
    $fetcher = new SocialFetcher($conn);

    $refreshed = [];
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $before = $fetcher->getProfiles($userId);
        $fetcher->saveProfiles($userId, $input);
        $after = $fetcher->getProfiles($userId);

        $changed = [];
        foreach (SocialFetcher::PLATFORMS as $platform) {
            if (($before[$platform] ?? '') !== ($after[$platform] ?? '') && !empty($after[$platform])) {
                $changed[] = $platform;
            }
        }
        if ($changed) {
            $refreshed = $fetcher->refreshUser($userId, $changed, true);
        }
    } elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        Response::error('Method not allowed', 405);
    }

    $stmt = $conn->prepare("SELECT provider FROM social_connections WHERE user_id = :uid");
    $stmt->execute(['uid' => $userId]);
    $connected = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $connected[$row['provider']] = true;
    }

    $profiles = $fetcher->getProfiles($userId);
    $out = [];
    foreach (SocialFetcher::PLATFORMS as $platform) {
        $out[$platform] = $profiles[$platform] ?? '';
    }

    Response::success([
        'profiles' => $out,
        'connected' => $connected,
        'last' => $fetcher->lastAttempts($userId),
        'stale' => $fetcher->stalePlatforms($userId),
        'refreshed' => $refreshed,
    ]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Profiles failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się zapisać profili', 500);
}
