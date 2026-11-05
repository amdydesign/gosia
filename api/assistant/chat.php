<?php
/**
 * "Asystent" - send a message, get the reply streamed (Server-Sent Events).
 *
 * POST /api/assistant/chat.php
 *   { chat_id?: int, message: "...", model?: "claude-opus-5-5", images?: [{ media_type, data (base64) }] }
 *
 * Events (event: name / data: JSON):
 *   status { text }            what is happening ("Myślę…")
 *   tool   { name, text }      a panel tool or web search runs ("Sprawdzam współprace…")
 *   text   { text }            next piece of the answer
 *   source { url, title }      a web page the answer cites
 *   task   { id, title, due_date, remind_at }   a task was added (the app offers "Cofnij")
 *   done   { chat_id, title, model, model_label, cost_usd (this reply), chat_cost_usd, usd_pln }
 *   error  { message }         nothing was saved - her message can be sent again
 *
 * The reply is saved only when it is complete; closing the app mid-answer does not stop it.
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/AiSettings.php';
require_once __DIR__ . '/../config/Assistant.php';
require_once __DIR__ . '/../middleware/auth.php';

const ASSISTANT_MAX_TEXT = 20000;
const ASSISTANT_MAX_IMAGES = 4;
const ASSISTANT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = (int) getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true) ?: [];

    $text = trim((string) ($input['message'] ?? ''));
    if (mb_strlen($text) > ASSISTANT_MAX_TEXT) {
        Response::validationError(['message' => 'Wiadomość jest za długa - skróć ją albo podziel.']);
    }
    $images = [];
    foreach (array_slice(is_array($input['images'] ?? null) ? $input['images'] : [], 0, ASSISTANT_MAX_IMAGES) as $image) {
        $type = (string) ($image['media_type'] ?? '');
        $data = preg_replace('/\s+/', '', (string) ($image['data'] ?? ''));
        if (!in_array($type, ASSISTANT_IMAGE_TYPES, true) || $data === '' || strlen($data) > 7000000 || base64_decode($data, true) === false) {
            Response::validationError(['images' => 'Nie udało się odczytać zdjęcia. Spróbuj JPG lub PNG.']);
        }
        $images[] = ['media_type' => $type, 'data' => $data];
    }
    if ($text === '' && !$images) {
        Response::validationError(['message' => 'Napisz wiadomość']);
    }
    $model = Assistant::modelId($input['model'] ?? '');

    $db = new Database();
    $conn = $db->getConnection();
    AiSettings::apply($conn, $userId);
    if (AiClient::key('claude') === '') {
        Response::error('Asystent wymaga klucza Claude (Ustawienia → Czytanie screenów).', 503);
    }
    Schema::ensure($conn, 'assistant_chats');
    Schema::ensure($conn, 'assistant_messages');
    Schema::ensureColumn($conn, 'assistant_chats', 'prompt_version');
    Schema::ensureColumns($conn, 'assistant_messages');

    // History of this chat - replayed exactly as stored
    $chatId = (int) ($input['chat_id'] ?? 0);
    $history = [];
    $version = Assistant::PROMPT_VERSION;
    if ($chatId > 0) {
        $stmt = $conn->prepare("SELECT id, prompt_version FROM assistant_chats WHERE id = :id AND user_id = :user_id AND deleted_at IS NULL");
        $stmt->execute(['id' => $chatId, 'user_id' => $userId]);
        $chat = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$chat) {
            Response::notFound('Tej rozmowy już nie ma - zacznij nową.');
        }
        // an older chat keeps the prompt and tools it started with
        $version = Assistant::promptVersion($chat['prompt_version']);
        $stmt = $conn->prepare("SELECT kind, content FROM assistant_messages WHERE chat_id = :chat_id ORDER BY id");
        $stmt->execute(['chat_id' => $chatId]);
        $bytes = 0;
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $bytes += strlen($row['content']);
            $content = json_decode($row['content']);
            if (is_array($content)) {
                $history[] = (object) ['role' => $row['kind'] === 'assistant' ? 'assistant' : 'user', 'content' => $content];
            }
        }
        if ($bytes > Assistant::MAX_HISTORY_BYTES) {
            Response::error('Ta rozmowa jest już bardzo długa. Zacznij nową - będzie szybciej i taniej.', 422);
        }
    }

    // Her message: pictures first, then the date and time, then what she wrote
    $content = [];
    foreach ($images as $image) {
        $content[] = (object) ['type' => 'image', 'source' => (object) ['type' => 'base64', 'media_type' => $image['media_type'], 'data' => $image['data']]];
    }
    $content[] = (object) ['type' => 'text', 'text' => Assistant::contextText()];
    $content[] = (object) ['type' => 'text', 'text' => $text !== '' ? $text : 'Co jest na tym zdjęciu?'];
    $userMessage = (object) ['role' => 'user', 'content' => $content];
    $history[] = $userMessage;
} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Assistant failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się wysłać wiadomości', 500);
}

// ---------------------------------------------------------------- stream

@set_time_limit(900);
ignore_user_abort(true);
@ini_set('zlib.output_compression', '0');
@ini_set('output_buffering', '0');
@ini_set('implicit_flush', '1');
if (function_exists('apache_setenv')) {
    @apache_setenv('no-gzip', '1');
}
while (ob_get_level() > 0) {
    ob_end_flush();
}
header('Content-Type: text/event-stream; charset=utf-8');
header('Cache-Control: no-cache, no-transform');
header('X-Accel-Buffering: no');

$emit = function ($event, array $data) {
    if (connection_aborted()) {
        return;
    }
    echo 'event: ' . $event . "\n" . 'data: ' . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n\n";
    @flush();
};

// padding pushes the first bytes through proxy buffers, so the answer appears as it is written
echo ':' . str_repeat(' ', 2048) . "\n\n";
$emit('status', ['text' => 'Myślę…']);

try {
    $result = Assistant::reply($conn, $userId, $history, $model, $emit, $version);

    $conn->beginTransaction();
    $title = '';
    if ($chatId === 0) {
        $firstLine = trim(strtok($text, "\n") ?: '');
        $title = $firstLine !== '' ? mb_substr($firstLine, 0, 80) : 'Zdjęcie';
        $conn->prepare("INSERT INTO assistant_chats (user_id, title, model, prompt_version) VALUES (:user_id, :title, :model, :version)")
            ->execute(['user_id' => $userId, 'title' => $title, 'model' => $model, 'version' => $version]);
        $chatId = (int) $conn->lastInsertId();
    }
    $insert = $conn->prepare("INSERT INTO assistant_messages (chat_id, user_id, kind, content, model, cost_usd, usage_json) VALUES (:chat_id, :user_id, :kind, :content, :model, :cost, :usage)");
    $rows = array_merge([['kind' => 'user', 'message' => $userMessage, 'model' => null]], $result['messages']);
    foreach ($rows as $row) {
        $insert->execute([
            'chat_id' => $chatId,
            'user_id' => $userId,
            'kind' => $row['kind'],
            'content' => json_encode($row['message']->content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'model' => $row['model'],
            'cost' => isset($row['cost']) ? $row['cost'] : null,
            'usage' => isset($row['usage']) ? json_encode($row['usage']) : null,
        ]);
    }
    $conn->prepare("UPDATE assistant_chats SET model = :model, updated_at = NOW() WHERE id = :id")
        ->execute(['model' => $model, 'id' => $chatId]);
    $conn->commit();

    if ($title === '') {
        $stmt = $conn->prepare("SELECT title FROM assistant_chats WHERE id = :id");
        $stmt->execute(['id' => $chatId]);
        $title = (string) $stmt->fetchColumn();
    }
    $stmt = $conn->prepare("SELECT COALESCE(SUM(cost_usd), 0) FROM assistant_messages WHERE chat_id = :id");
    $stmt->execute(['id' => $chatId]);
    $emit('done', [
        'chat_id' => $chatId,
        'cost_usd' => $result['cost'],
        'chat_cost_usd' => round((float) $stmt->fetchColumn(), 6),
        'usd_pln' => Assistant::usdToPln(),
        'title' => $title,
        'model' => $result['model'],
        'model_label' => Assistant::modelLabel($result['model']),
    ]);
} catch (RuntimeException $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    $emit('error', ['message' => $e->getMessage()]);
} catch (Exception $e) {
    if ($conn->inTransaction()) {
        $conn->rollBack();
    }
    $emit('error', ['message' => ($_ENV['APP_DEBUG'] ?? '') === 'true' ? $e->getMessage() : 'Nie udało się zapisać odpowiedzi. Spróbuj jeszcze raz.']);
}
