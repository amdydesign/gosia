<?php
/**
 * Delete Attachment
 * DELETE /api/attachments/delete.php?id=123
 */

require_once __DIR__ . '/../bootstrap.php';
require_once __DIR__ . '/helpers.php';

requireMethod('DELETE');

try {
    $userId = getCurrentUserId();
    $id = intval($_GET['id'] ?? 0);

    if ($id <= 0) {
        Response::validationError(['id' => 'Valid id required']);
    }

    $conn = db();

    $stmt = $conn->prepare("SELECT stored_name FROM attachments WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $attachment = $stmt->fetch();

    if (!$attachment) {
        Response::notFound('Załącznik nie istnieje');
    }

    $stmt = $conn->prepare("DELETE FROM attachments WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    $path = attachmentsUploadDir() . '/' . $attachment['stored_name'];
    if (is_file($path)) {
        @unlink($path);
    }

    Response::success(null, 'Załącznik usunięty');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Delete failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się usunąć załącznika', 500);
}
