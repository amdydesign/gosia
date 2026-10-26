<?php
/**
 * Update Idea
 * PUT /api/ideas/update.php?id=1
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
    $data = json_decode(file_get_contents("php://input"));

    if (!$id) {
        Response::error('ID is required', 400);
    }

    $db = new Database();
    $conn = $db->getConnection();

    // Verify ownership
    $checkQuery = "SELECT id FROM ideas WHERE id = :id AND user_id = :user_id";
    $checkStmt = $conn->prepare($checkQuery);
    $checkStmt->execute(['id' => $id, 'user_id' => $userId]);

    if ($checkStmt->rowCount() === 0) {
        Response::error('Idea not found or access denied', 404);
    }

    // Build update query dynamically
    $fields = [];
    $params = ['id' => $id, 'user_id' => $userId];

    if (isset($data->title)) {
        $fields[] = "title = :title";
        $params['title'] = $data->title;
    }
    if (isset($data->content)) {
        $fields[] = "content = :content";
        $params['content'] = $data->content;
    }
    // "Nagram dziś": YYYY-MM-DD or null to take it off the day's list
    if ($data && property_exists($data, 'planned_for')) {
        Schema::ensureColumn($conn, 'ideas', 'planned_for');
        $fields[] = "planned_for = :planned_for";
        $params['planned_for'] = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $data->planned_for) ? $data->planned_for : null;
    }
    // Published reel and its results (views + likes, comments... read from an insights screen)
    if ($data && property_exists($data, 'published_at')) {
        Schema::ensureColumns($conn, 'ideas');
        $fields[] = "published_at = :published_at";
        $params['published_at'] = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $data->published_at) ? $data->published_at : null;
    }
    if ($data && property_exists($data, 'views')) {
        Schema::ensureColumns($conn, 'ideas');
        $fields[] = "views = :views";
        $params['views'] = $data->views === null || $data->views === '' ? null : max(0, (int) $data->views);
    }
    if ($data && property_exists($data, 'stats')) {
        Schema::ensureColumns($conn, 'ideas');
        $stats = [];
        foreach (['likes', 'comments', 'shares', 'saves', 'reach', 'watch_time_s'] as $key) {
            if (isset($data->stats->$key) && is_numeric($data->stats->$key) && $data->stats->$key >= 0) {
                $stats[$key] = (int) $data->stats->$key;
            }
        }
        $fields[] = "stats = :stats";
        $params['stats'] = $stats ? json_encode($stats) : null;
    }
    if (isset($data->status)) {
        $validStatuses = ['draft', 'recorded'];
        if (in_array($data->status, $validStatuses)) {
            $fields[] = "status = :status";
            $params['status'] = $data->status;
        }
    }

    if (empty($fields)) {
        Response::error('No fields to update', 400);
    }

    $query = "UPDATE ideas SET " . implode(', ', $fields) . " WHERE id = :id AND user_id = :user_id";
    $stmt = $conn->prepare($query);
    $stmt->execute($params);

    if (isset($data->status)) {
        require_once __DIR__ . '/../utils/DoneLog.php';
        if ($data->status === 'recorded') {
            $row = $conn->prepare("SELECT title FROM ideas WHERE id = :id");
            $row->execute(['id' => $id]);
            DoneLog::record($conn, $userId, 'idea:' . $id, 'Nagrane: ' . ($row->fetchColumn() ?: ''));
        } else {
            DoneLog::forget($conn, $userId, 'idea:' . $id);
        }
    }

    Response::success(['message' => 'Idea updated successfully']);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Update failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to update idea', 500);
}
