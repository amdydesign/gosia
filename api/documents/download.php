<?php
/**
 * Download / preview a document
 * GET /api/documents/download.php?id=123[&inline=1]
 * Files are outside the public URL space (denied by .htaccess) and are served
 * only here, after the JWT + ownership check. Responses are never cached.
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = intval($_GET['id'] ?? 0);

    if ($id <= 0) {
        Response::validationError(['id' => 'Valid id required']);
    }

    $db = new Database();
    $conn = $db->getConnection();
    documentsEnsureSchema($conn);

    $stmt = $conn->prepare("SELECT original_name, stored_name, mime_type FROM documents WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $document = $stmt->fetch();

    if (!$document) {
        Response::notFound('Dokument nie istnieje');
    }

    $path = documentsUploadDir() . '/' . $document['stored_name'];
    if (!is_file($path)) {
        Response::notFound('Plik nie istnieje na serwerze');
    }

    // Inline only for types the browser renders safely (no HTML/SVG ever)
    $inlineTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    $inline = !empty($_GET['inline']) && in_array($document['mime_type'], $inlineTypes, true);

    header_remove('Content-Type');
    header('Content-Type: ' . $document['mime_type']);
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . "; filename*=UTF-8''" . rawurlencode($document['original_name']));
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    header('Cache-Control: no-store, private');
    header('Pragma: no-cache');

    readfile($path);
    exit;

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Download failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się pobrać pliku', 500);
}
