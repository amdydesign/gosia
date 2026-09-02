<?php
/**
 * Upload Attachment
 * POST /api/attachments/upload.php  (multipart/form-data)
 * Fields: file, entity_type (collaboration|purchase), entity_id
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();

    $entityType = trim($_POST['entity_type'] ?? '');
    $entityId = intval($_POST['entity_id'] ?? 0);

    if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'] ?? '')) {
        Response::validationError(['file' => 'Nie przesłano pliku']);
    }

    $file = $_FILES['file'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        $msg = ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE)
            ? 'Plik jest za duży'
            : 'Błąd przesyłania pliku (kod ' . $file['error'] . ')';
        Response::validationError(['file' => $msg]);
    }

    if ($file['size'] > ATTACHMENTS_MAX_SIZE) {
        Response::validationError(['file' => 'Maksymalny rozmiar pliku to 10 MB']);
    }

    $originalName = $file['name'];
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

    if (!isset(ATTACHMENTS_ALLOWED[$ext])) {
        Response::validationError(['file' => 'Niedozwolony typ pliku. Dozwolone: ' . implode(', ', array_keys(ATTACHMENTS_ALLOWED))]);
    }

    // Detect real mime type from content (do not trust the client)
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']) ?: 'application/octet-stream';

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'attachments');

    $entityType = attachmentsCheckEntity($conn, $userId, $entityType, $entityId);

    // Store under a random name; never under the user-supplied one
    $storedName = bin2hex(random_bytes(16)) . '.' . $ext;
    $uploadDir = attachmentsUploadDir();

    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
        Response::error('Upload directory is not writable', 500);
    }

    if (!move_uploaded_file($file['tmp_name'], $uploadDir . '/' . $storedName)) {
        Response::error('Failed to store the file', 500);
    }

    $stmt = $conn->prepare("
        INSERT INTO attachments (user_id, entity_type, entity_id, original_name, stored_name, mime_type, size)
        VALUES (:user_id, :entity_type, :entity_id, :original_name, :stored_name, :mime_type, :size)
    ");
    $stmt->execute([
        'user_id' => $userId,
        'entity_type' => $entityType,
        'entity_id' => $entityId,
        'original_name' => mb_substr($originalName, 0, 255),
        'stored_name' => $storedName,
        'mime_type' => mb_substr($mime, 0, 100),
        'size' => $file['size'],
    ]);

    Response::success([
        'id' => (int) $conn->lastInsertId(),
        'original_name' => $originalName,
        'mime_type' => $mime,
        'size' => (int) $file['size'],
    ], 'Załącznik dodany', 201);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Upload failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się dodać załącznika', 500);
}
