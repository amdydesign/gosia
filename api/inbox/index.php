<?php
/**
 * Inbox items waiting on Start ("Ze screena: ...").
 *
 * GET  /api/inbox/index.php               -> open items
 * POST /api/inbox/index.php?done=ID       -> handled (the form was opened / saved)
 * POST /api/inbox/index.php?undo=ID       -> back to open ("Cofnij")
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

try {
    $userId = (int) getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'inbox_items');

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $id = (int) ($_GET['done'] ?? $_GET['undo'] ?? 0);
        $doneAt = isset($_GET['done']) ? date('Y-m-d H:i:s') : null;
        $conn->prepare("UPDATE inbox_items SET done_at = :done_at WHERE id = :id AND user_id = :user_id")
            ->execute(['done_at' => $doneAt, 'id' => $id, 'user_id' => $userId]);
        Response::success(['id' => $id]);
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        Response::error('Method not allowed', 405);
    }
    Response::success(inboxOpenItems($conn, $userId));
} catch (Exception $e) {
    Response::error('Nie udało się', 500);
}
