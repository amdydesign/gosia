<?php
/**
 * Rename a document / edit its notes / change signing status
 * PUT /api/documents/update.php?id=123   body: { title?, notes?, status? }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = intval($_GET['id'] ?? 0);
    $data = json_decode(file_get_contents('php://input'), true) ?: [];

    if ($id <= 0) {
        Response::validationError(['id' => 'Valid id required']);
    }

    $fields = [];
    $params = ['id' => $id, 'user_id' => $userId];

    if (array_key_exists('title', $data)) {
        $title = trim((string) $data['title']);
        if ($title === '') {
            Response::validationError(['title' => 'Podaj nazwę dokumentu']);
        }
        $fields[] = 'title = :title';
        $params['title'] = mb_substr($title, 0, 255);
    }
    if (array_key_exists('notes', $data)) {
        $notes = trim((string) $data['notes']);
        $fields[] = 'notes = :notes';
        $params['notes'] = $notes === '' ? null : $notes;
    }

    if (array_key_exists('status', $data)) {
        if (!in_array($data['status'], DOCUMENTS_STATUSES, true)) {
            Response::validationError(['status' => 'Must be "signed" or "to_sign"']);
        }
        $fields[] = 'status = :status';
        $params['status'] = $data['status'];
    }

    if (!$fields) {
        Response::error('No fields to update', 400);
    }

    $db = new Database();
    $conn = $db->getConnection();
    documentsEnsureSchema($conn);

    $stmt = $conn->prepare("SELECT id FROM documents WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    if (!$stmt->fetch()) {
        Response::notFound('Dokument nie istnieje');
    }

    $stmt = $conn->prepare("UPDATE documents SET " . implode(', ', $fields) . " WHERE id = :id AND user_id = :user_id");
    $stmt->execute($params);

    Response::success(null, 'Zapisano');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Update failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się zapisać zmian', 500);
}
