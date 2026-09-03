<?php
/**
 * Refresh Social Stats (all platforms, forced)
 * POST /api/stats/social/refresh.php
 *
 * Kept for backwards compatibility - delegates to SocialFetcher.
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Database.php';
require_once __DIR__ . '/../../config/Response.php';
require_once __DIR__ . '/../../config/SocialFetcher.php';
require_once __DIR__ . '/../../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

@set_time_limit(120);

try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();
    $fetcher = new SocialFetcher($conn);

    $results = $fetcher->refreshUser($userId, null, true);
    $refreshed = [];
    $errors = [];
    foreach ($results as $platform => $r) {
        if ($r['ok']) {
            $refreshed[$platform] = $r['count'];
        } elseif (!$r['skipped']) {
            $errors[$platform] = $r['error'];
        }
    }

    Response::success([
        'refreshed' => $refreshed,
        'errors' => $errors,
        'message' => count($refreshed) > 0 ? 'Statystyki zostały odświeżone' : 'Brak platform do odświeżenia',
    ]);

} catch (Exception $e) {
    Response::error('Błąd: ' . $e->getMessage(), 500);
}
