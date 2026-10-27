<?php
/**
 * All pieces are in: save the file and create its link
 * POST /api/share/finish.php  (multipart/form-data)
 * Fields: upload_id, title (optional - the file name otherwise), poster (optional JPEG made on the device)
 *   -> the share (see shareForPanel)
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $upload = shareLoadUpload($_POST['upload_id'] ?? '', $userId);
    if (!$upload || !is_file($upload['part'])) {
        Response::notFound('Wysyłanie wygasło — zacznij jeszcze raz');
    }

    clearstatcache(true, $upload['part']);
    $received = filesize($upload['part']);
    if ($received !== (int) $upload['size']) {
        Response::error('Plik nie dotarł w całości', 409, ['offset' => $received]);
    }

    $db = new Database();
    $conn = $db->getConnection();
    shareEnsure($conn);

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($upload['part']) ?: 'application/octet-stream';
    $ext = shareExtension($upload['name']);
    // .mov / .mp4 sometimes come back as a generic type - the extension knows better
    if ($mime === 'application/octet-stream' || $mime === 'video/x-quicktime') {
        $byExt = ['mp4' => 'video/mp4', 'm4v' => 'video/x-m4v', 'mov' => 'video/quicktime', 'webm' => 'video/webm'];
        $mime = $byExt[$ext] ?? $mime;
    }

    $base = bin2hex(random_bytes(16));
    $storedName = $base . ($ext !== '' ? '.' . $ext : '');
    if (!rename($upload['part'], shareDir() . '/' . $storedName)) {
        Response::error('Failed to store the file', 500);
    }
    @unlink($upload['meta']);

    // Cover frame for the list and the link preview (made in the browser - no ffmpeg on the hosting)
    $posterName = null;
    $poster = $_FILES['poster'] ?? null;
    if ($poster && ($poster['error'] ?? 1) === UPLOAD_ERR_OK && is_uploaded_file($poster['tmp_name']) && $poster['size'] <= 3 * 1024 * 1024) {
        $posterMime = $finfo->file($poster['tmp_name']);
        if (in_array($posterMime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            $posterName = $base . '-poster.' . ($posterMime === 'image/jpeg' ? 'jpg' : substr($posterMime, 6));
            if (!move_uploaded_file($poster['tmp_name'], shareDir() . '/' . $posterName)) {
                $posterName = null;
            }
        }
    }

    $title = trim((string) ($_POST['title'] ?? ''));
    $stmt = $conn->prepare("
        INSERT INTO shares (user_id, token, title, original_name, stored_name, poster_name, mime_type, size)
        VALUES (:user_id, :token, :title, :original_name, :stored_name, :poster_name, :mime_type, :size)
    ");
    $stmt->execute([
        'user_id' => $userId,
        'token' => shareNewToken($conn),
        'title' => $title !== '' ? mb_substr($title, 0, 255) : shareTitleFromName($upload['name']),
        'original_name' => $upload['name'],
        'stored_name' => $storedName,
        'poster_name' => $posterName,
        'mime_type' => mb_substr($mime, 0, 100),
        'size' => $upload['size'],
    ]);

    $row = $conn->prepare("SELECT * FROM shares WHERE id = :id");
    $row->execute(['id' => $conn->lastInsertId()]);

    Response::success(shareForPanel($row->fetch(PDO::FETCH_ASSOC)), 'Link gotowy', 201);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Finish failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się zapisać pliku', 500);
}
