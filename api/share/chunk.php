<?php
/**
 * One piece of a shared file (raw bytes in the body)
 * POST /api/share/chunk.php?upload_id=...&offset=N   (Content-Type: application/octet-stream)
 *   -> { offset }  bytes received so far
 * A piece sent for the wrong place answers 409 with errors.offset - the app continues from there.
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
    $upload = shareLoadUpload($_GET['upload_id'] ?? '', $userId);
    if (!$upload || !is_file($upload['part'])) {
        Response::notFound('Wysyłanie wygasło — zacznij jeszcze raz');
    }

    $offset = (int) ($_GET['offset'] ?? -1);
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);

    $out = fopen($upload['part'], 'ab');
    if (!$out || !flock($out, LOCK_EX)) {
        Response::error('Failed to store the file', 500);
    }
    clearstatcache(true, $upload['part']);
    $current = filesize($upload['part']);

    if ($offset !== $current) {
        flock($out, LOCK_UN);
        fclose($out);
        Response::error('Wrong offset', 409, ['offset' => $current]);
    }
    if ($length <= 0 || $current + $length > $upload['size']) {
        flock($out, LOCK_UN);
        fclose($out);
        Response::validationError(['file' => 'Nieprawidłowy fragment pliku']);
    }

    $in = fopen('php://input', 'rb');
    $written = stream_copy_to_stream($in, $out, $length);
    fclose($in);
    fflush($out);

    if ($written !== $length) {
        // cut off mid-way: drop the half piece, the app sends it again
        ftruncate($out, $current);
        flock($out, LOCK_UN);
        fclose($out);
        Response::error('Przerwane wysyłanie fragmentu', 409, ['offset' => $current]);
    }
    flock($out, LOCK_UN);
    fclose($out);
    touch($upload['meta']);

    Response::success(['offset' => $current + $written]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Chunk failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się wysłać fragmentu', 500);
}
