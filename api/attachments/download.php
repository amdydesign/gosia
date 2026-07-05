<?php
/**
 * Download Attachment
 * GET /api/attachments/download.php?id=123
 * Files live outside the public URL space (denied by .htaccess) and are
 * served through this endpoint after an ownership check.
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
    $id = intval($_GET['id'] ?? 0);

    if ($id <= 0) {
        Response::validationError(['id' => 'Valid id required']);
    }

    $db = new Database();
    $conn = $db->getConnection();

    $stmt = $conn->prepare("SELECT * FROM attachments WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $attachment = $stmt->fetch();

    if (!$attachment) {
        Response::notFound('Załącznik nie istnieje');
    }

    $path = attachmentsUploadDir() . '/' . $attachment['stored_name'];
    if (!is_file($path)) {
        Response::notFound('Plik nie istnieje na serwerze');
    }

    // Inline preview only for safe image types; everything else forces download
    $inlineTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    $disposition = in_array($attachment['mime_type'], $inlineTypes, true) ? 'inline' : 'attachment';

    header_remove('Content-Type');
    header('Content-Type: ' . $attachment['mime_type']);
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: ' . $disposition . "; filename*=UTF-8''" . rawurlencode($attachment['original_name']));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=3600');

    readfile($path);
    exit;

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Download failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się pobrać pliku', 500);
}
