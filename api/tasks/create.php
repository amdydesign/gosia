<?php
/**
 * Create Task ("Zrzuć tutaj" -> zadanie)
 * POST /api/tasks/create.php  { title, due_date? (YYYY-MM-DD, default today) }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $title = trim((string) ($input['title'] ?? ''));
    if ($title === '') {
        Response::validationError(['title' => 'Wpisz, co jest do zrobienia']);
    }
    $due = $input['due_date'] ?? date('Y-m-d');
    if ($due !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $due)) {
        $due = date('Y-m-d');
    }

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'tasks');

    $stmt = $conn->prepare("INSERT INTO tasks (user_id, title, due_date) VALUES (:user_id, :title, :due_date)");
    $stmt->execute(['user_id' => $userId, 'title' => mb_substr($title, 0, 255), 'due_date' => $due]);

    Response::success(['id' => (int) $conn->lastInsertId()], 'Task created', 201);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Failed to create task: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się zapisać zadania', 500);
}
