<?php
/**
 * Cover frame of a shared file, for the list in the app
 * GET /api/share/poster.php?id=123
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

    $stmt = $conn->prepare("SELECT poster_name FROM shares WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => intval($_GET['id'] ?? 0), 'user_id' => $userId]);
    $posterName = $stmt->fetchColumn();
    $path = $posterName ? shareDir() . '/' . $posterName : '';

    if (!$path || !is_file($path)) {
        Response::notFound('Brak okładki');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path) ?: 'image/jpeg';
    shareStream($path, $mime, $posterName, 'inline', 'private, max-age=86400');

} catch (Exception $e) {
    Response::error('Nie udało się pobrać okładki', 500);
}
