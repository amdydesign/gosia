<?php
/**
 * "Asystent" - conversations.
 *
 * GET    /api/assistant/chats.php          -> { enabled, models: [{ id, label, hint }], default_model, chats: [{ id, title, model, updated_at, cost_usd }],
 *                                              month_cost_usd, usd_pln }
 * GET    /api/assistant/chats.php?id=12    -> { chat: { id, title, model, cost_usd }, busy, messages: [{ id, role, text, images, sources, model, cost_usd, created_at }], usd_pln }
 * Costs: USD from the API's token counts (with cache and web searches); usd_pln converts for the app.
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
    Schema::ensureColumns($conn, 'assistant_messages');
    Schema::ensureColumn($conn, 'assistant_chats', 'busy_at');
    $method = $_SERVER['REQUEST_METHOD'];
    $id = (int) ($_GET['id'] ?? 0);

    if ($method === 'GET' && $id > 0) {
        $stmt = $conn->prepare("SELECT id, title, model, busy_at > DATE_SUB(NOW(), INTERVAL " . Assistant::BUSY_MINUTES . " MINUTE) AS busy FROM assistant_chats WHERE id = :id AND user_id = :user_id AND deleted_at IS NULL");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $chat = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$chat) {
            Response::notFound('Tej rozmowy już nie ma');
        }
        $stmt = $conn->prepare("SELECT id, kind, content, model, cost_usd, created_at FROM assistant_messages WHERE chat_id = :chat_id ORDER BY id");
        $stmt->execute(['chat_id' => $id]);
        $messages = Assistant::bubbles($stmt->fetchAll(PDO::FETCH_ASSOC));
        $stmt = $conn->prepare("SELECT usage_json FROM assistant_messages WHERE chat_id = :chat_id AND kind = 'assistant' AND usage_json IS NOT NULL ORDER BY id DESC LIMIT 1");
        $stmt->execute(['chat_id' => $id]);
        $lastUsage = json_decode((string) $stmt->fetchColumn(), true);
        Response::success([
            'chat' => [
                'id' => (int) $chat['id'],
                'title' => $chat['title'],
                'model' => Assistant::modelId($chat['model']),
                'cost_usd' => round(array_sum(array_column($messages, 'cost_usd')), 6),
            ],
            'messages' => $messages,
            // a reply is still being written (the app was closed mid-answer) - the app waits and reloads
            'busy' => !empty($chat['busy']),
            'long_chat' => Assistant::promptTokens($lastUsage) > Assistant::LONG_CHAT_TOKENS,
            'usd_pln' => Assistant::usdToPln(),
        ]);
    }

    if ($method === 'GET') {
        // the bin keeps deleted chats for 30 days
        $conn->prepare("DELETE FROM assistant_chats WHERE user_id = :user_id AND deleted_at IS NOT NULL AND deleted_at < DATE_SUB(NOW(), INTERVAL 30 DAY)")
            ->execute(['user_id' => $userId]);
        $stmt = $conn->prepare("
            SELECT c.id, c.title, c.model, c.updated_at, COALESCE(SUM(m.cost_usd), 0) AS cost_usd
            FROM assistant_chats c
            LEFT JOIN assistant_messages m ON m.chat_id = c.id
            WHERE c.user_id = :user_id AND c.deleted_at IS NULL
            GROUP BY c.id, c.title, c.model, c.updated_at
            ORDER BY c.updated_at DESC, c.id DESC
            LIMIT 40
        ");
        $stmt->execute(['user_id' => $userId]);
        $chats = array_map(function ($row) {
            return ['id' => (int) $row['id'], 'title' => $row['title'], 'model' => $row['model'], 'updated_at' => $row['updated_at'], 'cost_usd' => round((float) $row['cost_usd'], 6)];
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));

        // spent this month - deleted chats too (the money is gone either way)
        $stmt = $conn->prepare("SELECT COALESCE(SUM(cost_usd), 0) FROM assistant_messages WHERE user_id = :user_id AND created_at >= :month");
        $stmt->execute(['user_id' => $userId, 'month' => date('Y-m-01 00:00:00')]);
        $monthCost = round((float) $stmt->fetchColumn(), 6);

        AiSettings::apply($conn, $userId);
        Response::success([
            'enabled' => AiClient::key('claude') !== '',
            'models' => Assistant::models(),
            'default_model' => Assistant::DEFAULT_MODEL,
            'chats' => $chats,
            'month_cost_usd' => $monthCost,
            'usd_pln' => Assistant::usdToPln(),
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
