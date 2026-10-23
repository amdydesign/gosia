<?php
/**
 * Delete Task
 * DELETE /api/tasks/delete.php?id=1
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = (int) ($_GET['id'] ?? 0);

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'tasks');

    $stmt = $conn->prepare("DELETE FROM tasks WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    // Gone for good: also from "Dziś ogarnięte" and from pending reminders
    if ($stmt->rowCount() > 0) {
        Schema::ensure($conn, 'done_log');
        Schema::ensure($conn, 'reminders');
        $keys = ['user_id' => $userId, 'ref_key' => 'task:' . $id];
        $conn->prepare("DELETE FROM done_log WHERE user_id = :user_id AND ref_key = :ref_key")->execute($keys);
        $conn->prepare("DELETE FROM reminders WHERE user_id = :user_id AND ref_key = :ref_key AND sent_at IS NULL")->execute($keys);
    }

    Response::success(['deleted' => $stmt->rowCount() > 0]);

} catch (Exception $e) {
    Response::error('Nie udało się usunąć zadania', 500);
}
