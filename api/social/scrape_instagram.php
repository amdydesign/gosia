<?php
/**
 * Legacy endpoint kept for compatibility - now authenticated and backed by SocialFetcher.
 * POST /api/social/scrape_instagram.php
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/SocialFetcher.php';
require_once __DIR__ . '/../middleware/auth.php';

try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();
    $fetcher = new SocialFetcher($conn);
    $results = $fetcher->refreshUser($userId, ['instagram'], true);
    $r = $results['instagram'] ?? ['ok' => false, 'error' => 'Brak konfiguracji'];

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($r['ok']
        ? ['success' => true, 'message' => 'Zaktualizowano Instagram', 'followers' => $r['count'], 'platform' => 'instagram', 'source' => $r['source']]
        : ['success' => false, 'error' => $r['error'] ?? 'Nie udało się pobrać danych'], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
