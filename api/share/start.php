<?php
/**
 * Start uploading a file to share
 * POST /api/share/start.php  { name, size }
 *   -> { upload_id, chunk_size, offset }
 * Then the pieces go to chunk.php and finish.php creates the link.
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
    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    $name = trim((string) ($input['name'] ?? ''));
    $size = (int) ($input['size'] ?? 0);

    if ($name === '' || $size <= 0) {
        Response::validationError(['file' => 'Pusty plik']);
    }
    $maxSize = shareMaxSize();
    if ($size > $maxSize) {
        Response::validationError(['file' => 'Za duży plik (max ' . round($maxSize / 1073741824, 1) . ' GB)']);
    }
    if (in_array(shareExtension($name), SHARE_BLOCKED_EXT, true)) {
        Response::validationError(['file' => 'Tego typu pliku nie można udostępnić']);
    }

    $tmpDir = shareTmpDir();
    if (!is_dir($tmpDir) && !mkdir($tmpDir, 0755, true)) {
        Response::error('Upload directory is not writable', 500);
    }
    shareCleanupTmp();

    $free = @disk_free_space(shareDir());
    if ($free !== false && $free < $size + 200 * 1024 * 1024) {
        Response::validationError(['file' => 'Za mało miejsca na serwerze — usuń stare pliki']);
    }

    $uploadId = bin2hex(random_bytes(16));
    file_put_contents($tmpDir . '/' . $uploadId . '.json', json_encode([
        'user_id' => (int) $userId,
        'name' => mb_substr($name, 0, 255),
        'size' => $size,
        'started_at' => date('Y-m-d H:i:s'),
    ], JSON_UNESCAPED_UNICODE));
    touch($tmpDir . '/' . $uploadId . '.part');

    Response::success([
        'upload_id' => $uploadId,
        'chunk_size' => shareChunkSize(),
        'offset' => 0,
    ]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Start failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się rozpocząć wysyłania', 500);
}
