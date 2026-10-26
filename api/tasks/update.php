<?php
/**
 * Update Task
 * PUT /api/tasks/update.php?id=1  { done?: bool, title?, due_date? }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../utils/DoneLog.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = (int) ($_GET['id'] ?? 0);
    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'tasks');
    Schema::ensureColumn($conn, 'tasks', 'steps');

    $stmt = $conn->prepare("SELECT id, title FROM tasks WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $task = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$task) {
        Response::error('Not found', 404);
    }

    $fields = [];
    $params = ['id' => $id];
    if (array_key_exists('done', $input)) {
        $fields[] = 'done_at = :done_at';
        $params['done_at'] = $input['done'] ? date('Y-m-d H:i:s') : null;
    }
    if (isset($input['title']) && trim($input['title']) !== '') {
        $fields[] = 'title = :title';
        $params['title'] = mb_substr(trim($input['title']), 0, 255);
    }
    if (array_key_exists('due_date', $input)) {
        $fields[] = 'due_date = :due_date';
        $params['due_date'] = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $input['due_date']) ? $input['due_date'] : null;
    }
    // "Rozbij na kroki": [{text, done}], null removes the steps
    if (array_key_exists('steps', $input)) {
        $steps = [];
        foreach ((array) $input['steps'] as $step) {
            $text = trim((string) ($step['text'] ?? ''));
            if ($text !== '') {
                $steps[] = ['text' => mb_substr($text, 0, 200), 'done' => !empty($step['done'])];
            }
        }
        $fields[] = 'steps = :steps';
        $params['steps'] = $steps ? json_encode(array_slice($steps, 0, 12), JSON_UNESCAPED_UNICODE) : null;
    }
    if ($fields) {
        $conn->prepare("UPDATE tasks SET " . implode(', ', $fields) . " WHERE id = :id")->execute($params);
    }

    if (array_key_exists('done', $input)) {
        if ($input['done']) {
            DoneLog::record($conn, $userId, 'task:' . $id, $task['title']);
        } else {
            DoneLog::forget($conn, $userId, 'task:' . $id);
        }
    }

    Response::success(['message' => 'Task updated']);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Failed to update task: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się zapisać zadania', 500);
}
