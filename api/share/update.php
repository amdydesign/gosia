<?php
/**
 * Change a shared file
 * PUT /api/share/update.php?id=123
 * Any of: { title, note, is_active, allow_download, expires_at: 'YYYY-MM-DD' | null, new_link: true }
 * new_link gives the file a new address - the old link stops working.
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = intval($_GET['id'] ?? 0);
    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    $db = new Database();
    $conn = $db->getConnection();
    shareEnsure($conn);

    $stmt = $conn->prepare("SELECT * FROM shares WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    if (!$stmt->fetch()) {
        Response::notFound('Tego pliku już nie ma');
    }

    $set = [];
    $params = ['id' => $id, 'user_id' => $userId];

    if (array_key_exists('title', $input)) {
        $title = trim((string) $input['title']);
        if ($title === '') {
            Response::validationError(['title' => 'Nazwa nie może być pusta']);
        }
        $set[] = 'title = :title';
        $params['title'] = mb_substr($title, 0, 255);
    }
    if (array_key_exists('note', $input)) {
        $note = trim((string) $input['note']);
        $set[] = 'note = :note';
        $params['note'] = $note !== '' ? mb_substr($note, 0, 2000) : null;
    }
    foreach (['is_active', 'allow_download'] as $flag) {
        if (array_key_exists($flag, $input)) {
            $set[] = "$flag = :$flag";
            $params[$flag] = $input[$flag] ? 1 : 0;
        }
    }
    if (array_key_exists('expires_at', $input)) {
        $date = trim((string) $input['expires_at']);
        if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            Response::validationError(['expires_at' => 'Nieprawidłowa data']);
        }
        $set[] = 'expires_at = :expires_at';
        $params['expires_at'] = $date !== '' ? $date . ' 23:59:59' : null; // valid through that whole day
    }
    if (!empty($input['new_link'])) {
        $set[] = 'token = :token';
        $params['token'] = shareNewToken($conn);
    }

    if ($set) {
        $conn->prepare("UPDATE shares SET " . implode(', ', $set) . " WHERE id = :id AND user_id = :user_id")->execute($params);
    }

    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    Response::success(shareForPanel($stmt->fetch(PDO::FETCH_ASSOC)), 'Zapisane');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Update failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się zapisać', 500);
}
