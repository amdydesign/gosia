<?php
/**
 * Upload a document to the archive
 * POST /api/documents/upload.php  (multipart/form-data)
 * Fields: file, title, notes (optional), content_text (optional, text the
 *         browser extracted from a PDF - used for full-text search)
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

    if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'] ?? '')) {
        $tooBig = empty($_FILES) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0;
        Response::validationError(['file' => $tooBig ? 'Plik jest za duży dla serwera' : 'Nie przesłano pliku']);
    }

    $file = $_FILES['file'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        $msg = ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE)
            ? 'Plik jest za duży'
            : 'Błąd przesyłania pliku (kod ' . $file['error'] . ')';
        Response::validationError(['file' => $msg]);
    }

    if ($file['size'] > DOCUMENTS_MAX_SIZE) {
        Response::validationError(['file' => 'Maksymalny rozmiar pliku to 20 MB']);
    }

    $originalName = $file['name'];
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

    if (!isset(DOCUMENTS_ALLOWED[$ext])) {
        Response::validationError(['file' => 'Niedozwolony typ pliku. Dozwolone: ' . implode(', ', array_keys(DOCUMENTS_ALLOWED))]);
    }

    $title = trim($_POST['title'] ?? '');
    if ($title === '') {
        $title = pathinfo($originalName, PATHINFO_FILENAME);
    }
    $notes = trim($_POST['notes'] ?? '');

    // Detect real mime type from content (do not trust the client)
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']) ?: 'application/octet-stream';

    $text = documentsExtractText($file['tmp_name'], $ext);
    if ($text === '' && $ext === 'pdf') {
        $text = documentsCleanText($_POST['content_text'] ?? '');
    }

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'documents');

    // Store under a random name; never under the user-supplied one
    $storedName = bin2hex(random_bytes(16)) . '.' . $ext;
    $uploadDir = documentsUploadDir();

    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0750, true)) {
        Response::error('Upload directory is not writable', 500);
    }

    if (!move_uploaded_file($file['tmp_name'], $uploadDir . '/' . $storedName)) {
        Response::error('Failed to store the file', 500);
    }
    @chmod($uploadDir . '/' . $storedName, 0640);

    $stmt = $conn->prepare("
        INSERT INTO documents (user_id, title, notes, original_name, stored_name, mime_type, size, content_text)
        VALUES (:user_id, :title, :notes, :original_name, :stored_name, :mime_type, :size, :content_text)
    ");
    $stmt->execute([
        'user_id' => $userId,
        'title' => mb_substr($title, 0, 255),
        'notes' => $notes === '' ? null : $notes,
        'original_name' => mb_substr($originalName, 0, 255),
        'stored_name' => $storedName,
        'mime_type' => mb_substr($mime, 0, 100),
        'size' => $file['size'],
        'content_text' => $text === '' ? null : $text,
    ]);

    Response::success([
        'id' => (int) $conn->lastInsertId(),
        'title' => $title,
        'has_text' => $text !== '',
    ], 'Dokument dodany', 201);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Upload failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się dodać dokumentu', 500);
}
