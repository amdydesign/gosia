<?php
/**
 * Delete a document (to the bin for 30 days; the file is removed when the bin is emptied)
 * DELETE /api/documents/delete.php?id=123
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/../utils/Trash.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = intval($_GET['id'] ?? 0);
    if ($id <= 0) {
        Response::error('ID is required', 400);
    }

    $db = new Database();
    $conn = $db->getConnection();

    // To the bin for 30 days - "Cofnij" restores it (api/trash/index.php)
    $trashId = Trash::put($conn, $userId, 'document', $id);
    if (!$trashId) {
        Response::notFound('Dokument nie istnieje');
    }

    Response::success(['trash_id' => $trashId], 'Usunięte');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Delete failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się usunąć', 500);
}
