<?php
/**
 * "Asystent" - conversations.
 *
 * GET    /api/assistant/chats.php          -> { enabled, models: [{ id, label, hint }], default_model, chats: [{ id, title, model, updated_at }] }
 * GET    /api/assistant/chats.php?id=12    -> { chat: { id, title, model }, messages: [{ id, role, text, images, sources, model, created_at }] }
 * DELETE /api/assistant/chats.php?id=12    -> to the bin for 30 days (the app offers "Cofnij")
 * POST   /api/assistant/chats.php          { restore: 12 } -> back from the bin
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/AiSettings.php';
require_once __DIR__ . '/../config/Assistant.php';
require_once __DIR__ . '/../middleware/auth.php';

try {
    $userId = (int) getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'assistant_chats');
    Schema::ensure($conn, 'assistant_messages');
    $method = $_SERVER['REQUEST_METHOD'];
    $id = (int) ($_GET['id'] ?? 0);

    if ($method === 'GET' && $id > 0) {
        $stmt = $conn->prepare("SELECT id, title, model FROM assistant_chats WHERE id = :id AND user_id = :user_id AND deleted_at IS NULL");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $chat = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$chat) {
            Response::notFound('Tej rozmowy już nie ma');
        }
        $stmt = $conn->prepare("SELECT id, kind, content, model, created_at FROM assistant_messages WHERE chat_id = :chat_id ORDER BY id");
        $stmt->execute(['chat_id' => $id]);
        Response::success([
            'chat' => ['id' => (int) $chat['id'], 'title' => $chat['title'], 'model' => Assistant::modelId($chat['model'])],
            'messages' => Assistant::bubbles($stmt->fetchAll(PDO::FETCH_ASSOC)),
        ]);
    }

    if ($method === 'GET') {
        // the bin keeps deleted chats for 30 days
        $conn->prepare("DELETE FROM assistant_chats WHERE user_id = :user_id AND deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL 30 DAY)")
            ->execute(['user_id' => $userId]);
        $stmt = $conn->prepare("SELECT id, title, model, updated_at FROM assistant_chats WHERE user_id = :user_id AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT 40");
        $stmt->execute(['user_id' => $userId]);
        $chats = array_map(function ($row) {
            return ['id' => (int) $row['id'], 'title' => $row['title'], 'model' => $row['model'], 'updated_at' => $row['updated_at']];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));

        AiSettings::apply($conn, $userId);
        Response::success([
            'enabled' => AiClient::key('claude') !== '',
            'models' => Assistant::models(),
            'default_model' => Assistant::DEFAULT_MODEL,
            'chats' => $chats,
        ]);
    }

    if ($method === 'DELETE') {
        $stmt = $conn->prepare("UPDATE assistant_chats SET deleted_at = NOW(), updated_at = updated_at WHERE id = :id AND user_id = :user_id AND deleted_at IS NULL");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        Response::success(['deleted' => $stmt->rowCount() > 0]);
    }

    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $restore = (int) ($input['restore'] ?? 0);
        $stmt = $conn->prepare("UPDATE assistant_chats SET deleted_at = NULL, updated_at = updated_at WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $restore, 'user_id' => $userId]);
        Response::success(['restored' => $stmt->rowCount() > 0]);
    }

    Response::error('Method not allowed', 405);
} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Assistant chats failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się wczytać rozmów', 500);
}
