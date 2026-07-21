<?php
/**
 * Show Idea
 * GET /api/ideas/show.php?id=1
 */

require_once __DIR__ . '/../bootstrap.php';
requireMethod('GET');

try {
    $userId = getCurrentUserId();
    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;

    if (!$id) {
        Response::error('ID is required', 400);
    }

    $conn = db();

    $query = "
        SELECT * FROM ideas 
        WHERE id = :id AND user_id = :user_id
        LIMIT 1
    ";

    $stmt = $conn->prepare($query);
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $idea = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$idea) {
        Response::error('Idea not found', 404);
    }

    Response::success($idea);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Fetch failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch idea', 500);
}
