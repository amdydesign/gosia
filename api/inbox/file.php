<?php
/**
 * The screen of an inbox item (to open the form with it attached).
 * GET /api/inbox/file.php?id=123
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

try {
    $userId = (int) getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'inbox_items');

    $stmt = $conn->prepare("SELECT stored_name, mime_type, original_name FROM inbox_items WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => (int) ($_GET['id'] ?? 0), 'user_id' => $userId]);
    $item = $stmt->fetch(PDO::FETCH_ASSOC);
    $path = $item && $item['stored_name'] ? inboxUploadDir() . '/' . basename($item['stored_name']) : null;
    if (!$path || !is_file($path)) {
        Response::notFound('Screena już nie ma');
    }
    header_remove('Content-Type');
    header('Content-Type: ' . $item['mime_type']);
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: inline; filename="' . preg_replace('/[^A-Za-z0-9._-]/', '_', $item['original_name'] ?: basename($path)) . '"');
    header('Cache-Control: no-store');
    readfile($path);
} catch (Exception $e) {
    Response::error('Nie udało się', 500);
}
