<?php
/**
 * Link documents with a collaboration (after the user confirmed a suggestion)
 * POST /api/documents/link.php
 * body: { document_ids: [1, 2], collaboration_id: 5 }   -> link
 *       { document_ids: [1, 2], dismiss: true }         -> "Pomiń" - stop suggesting them
 *       { document_ids: [1], unlink: true }             -> remove the link
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
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $ids = array_values(array_unique(array_filter(array_map('intval', (array) ($data['document_ids'] ?? [])))));
    if (!$ids || count($ids) > 50) {
        Response::validationError(['document_ids' => 'Podaj dokumenty']);
    }

    $db = new Database();
    $conn = $db->getConnection();
    documentsEnsureSchema($conn);

    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    if (!empty($data['dismiss'])) {
        $sql = "UPDATE documents SET collab_dismissed = 1 WHERE user_id = ? AND id IN ($placeholders)";
        $conn->prepare($sql)->execute(array_merge([$userId], $ids));
        Response::success(null, 'Pominięto');
    }

    if (!empty($data['unlink'])) {
        $sql = "UPDATE documents SET collaboration_id = NULL WHERE user_id = ? AND id IN ($placeholders)";
        $conn->prepare($sql)->execute(array_merge([$userId], $ids));
        Response::success(null, 'Odłączono');
    }

    $collabId = intval($data['collaboration_id'] ?? 0);
    $stmt = $conn->prepare("SELECT id FROM collaborations WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $collabId, 'user_id' => $userId]);
    if (!$stmt->fetch()) {
        Response::notFound('Współpraca nie istnieje');
    }

    $sql = "UPDATE documents SET collaboration_id = ?, collab_dismissed = 0 WHERE user_id = ? AND id IN ($placeholders)";
    $conn->prepare($sql)->execute(array_merge([$collabId, $userId], $ids));

    // Deadlines from the contract fill the collaboration's empty ones
    require_once __DIR__ . '/../collaborations/helpers.php';
    $stmt = $conn->prepare("SELECT terms FROM documents WHERE user_id = ? AND id IN ($placeholders) AND terms IS NOT NULL");
    $stmt->execute(array_merge([$userId], $ids));
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $json) {
        collabApplyTerms($conn, $userId, $collabId, documentsTerms($json));
    }

    Response::success(['collaboration_id' => $collabId, 'document_ids' => $ids], 'Połączono ze współpracą');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Link failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się połączyć dokumentów ze współpracą', 500);
}
