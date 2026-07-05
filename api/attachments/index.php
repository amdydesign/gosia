<?php
/**
 * List Attachments for an entity
 * GET /api/attachments/index.php?entity_type=collaboration|purchase&entity_id=123
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

    $entityType = trim($_GET['entity_type'] ?? '');
    $entityId = intval($_GET['entity_id'] ?? 0);

    $db = new Database();
    $conn = $db->getConnection();

    $entityType = attachmentsCheckEntity($conn, $userId, $entityType, $entityId);

    $stmt = $conn->prepare("
        SELECT id, original_name, mime_type, size, created_at
        FROM attachments
        WHERE user_id = :user_id AND entity_type = :entity_type AND entity_id = :entity_id
        ORDER BY created_at DESC, id DESC
    ");
    $stmt->execute([
        'user_id' => $userId,
        'entity_type' => $entityType,
        'entity_id' => $entityId,
    ]);

    Response::success($stmt->fetchAll());

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Failed to list attachments: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się pobrać załączników', 500);
}
