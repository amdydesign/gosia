<?php
/**
 * Shared files (newest first) + how much space they take
 * GET /api/share/index.php -> { items: [...], total_size, storage, max_size, base_url }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();
    shareEnsure($conn);

    $stmt = $conn->prepare("SELECT * FROM shares WHERE user_id = :user_id ORDER BY created_at DESC, id DESC");
    $stmt->execute(['user_id' => $userId]);
    $items = array_map('shareForPanel', $stmt->fetchAll(PDO::FETCH_ASSOC));
    $totalSize = array_sum(array_column($items, 'size'));

    Response::success([
        'items' => $items,
        'total_size' => $totalSize,
        'storage' => shareStorage($totalSize),
        'max_size' => shareMaxSize(),
        'base_url' => shareBaseUrl(),
    ]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('List failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się pobrać plików', 500);
}
