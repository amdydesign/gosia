<?php
/**
 * Get Ideas List
 * GET /api/ideas/index.php
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $status = isset($_GET['status']) ? $_GET['status'] : 'all'; // all, draft, recorded

    $db = new Database();
    $conn = $db->getConnection();

    $query = "
        SELECT id, title, content, status, created_at, updated_at
        FROM ideas 
        WHERE user_id = :user_id
    ";

    $params = ['user_id' => $userId];

    if ($status !== 'all') {
        $query .= " AND status = :status";
        $params['status'] = $status;
    }

    // Sort: Drafts first, then Recorded. Within groups, newest first.
    $query .= " ORDER BY CASE WHEN status = 'draft' THEN 1 ELSE 2 END ASC, created_at DESC";

    $stmt = $conn->prepare($query);
    $stmt->execute($params);
    $ideas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    Response::success($ideas);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Fetch failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to fetch ideas', 500);
}
