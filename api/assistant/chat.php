<?php
/**
 * "Asystent" - send a message, get the reply streamed (Server-Sent Events).
 *
 * POST /api/assistant/chat.php
 *   { chat_id?: int, message: "...", model?: "claude-opus-5-5", images?: [{ media_type, data (base64) }] }
 *
 * Events (event: name / data: JSON):
 *   chat   { chat_id }         first event: the chat exists and her message is stored
 *   status { text }            what is happening ("Myślę…")
 *   tool   { name, text }      a panel tool or web search runs ("Sprawdzam współprace…")
 *   text   { text }            next piece of the answer
 *   source { url, title }      a web page the answer cites
 *   task   { id, title, due_date, remind_at }   a task was added (the app offers "Cofnij")
 *   idea   { id, title, planned_for }            an idea was saved to Pomysły (the app offers "Cofnij")
 *   style_note { note }                         a note about her writing style was remembered ("Cofnij" forgets it)
 *   idea_updated { id, title, previous: { title, content, status, planned_for } }   an idea was changed ("Cofnij" restores previous)
 *   done   { chat_id, title, model, model_label, cost_usd (this reply), chat_cost_usd, usd_pln }
 *   error  { message, saved?, chat_id? }   without "saved": nothing was stored - her message can be sent again;
 *                              with "saved": part of the reply (and what its tools did) is stored - the app reloads the chat
 *
 * Her message is stored before the answer starts and every finished step right after it, so nothing is lost
 * when the app is closed mid-answer (the reply carries on) or the server stops the script.
 * While a reply is being written the chat is "busy": a second message is refused, the app waits and reloads.
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
    Schema::ensureColumn($conn, 'assistant_chats', 'busy_at');
    Schema::ensureColumns($conn, 'assistant_messages');

    // History of this chat - replayed exactly as stored
    $chatId = (int) ($input['chat_id'] ?? 0);
    $history = [];
    $version = Assistant::PROMPT_VERSION;
    if ($chatId > 0) {
        $stmt = $conn->prepare("SELECT id, prompt_version, busy_at > DATE_SUB(NOW(), INTERVAL " . Assistant::BUSY_MINUTES . " MINUTE) AS busy FROM assistant_chats WHERE id = :id AND user_id = :user_id AND deleted_at IS NULL");
        $stmt->execute(['id' => $chatId, 'user_id' => $userId]);
        $chat = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$chat) {
            Response::notFound('Tej rozmowy już nie ma - zacznij nową.');
        }
        if (!empty($chat['busy'])) {
            Response::error('Poprzednia odpowiedź jeszcze się pisze. Poczekaj chwilę.', 409);
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

    // Optional monthly cap (ASSISTANT_MONTHLY_LIMIT_USD in api/.env) - off when not set
    $limit = (float) ($_ENV['ASSISTANT_MONTHLY_LIMIT_USD'] ?? 0);
    if ($limit > 0) {
        $stmt = $conn->prepare("SELECT COALESCE(SUM(cost_usd), 0) FROM assistant_messages WHERE user_id = :user_id AND created_at >= :month");
        $stmt->execute(['user_id' => $userId, 'month' => date('Y-m-01 00:00:00')]);
        if ((float) $stmt->fetchColumn() >= $limit) {
            Response::error('Miesięczny limit asystenta jest wyczerpany. Wróci 1. dnia miesiąca.', 429);
        }
    }

    // Her message is stored before the answer starts
    $isNew = $chatId === 0;
    $title = '';
    $conn->beginTransaction();
    if ($isNew) {
        $firstLine = trim(strtok($text, "\n") ?: '');
        $title = $firstLine !== '' ? mb_substr($firstLine, 0, 80) : 'Zdjęcie';
        $conn->prepare("INSERT INTO assistant_chats (user_id, title, model, prompt_version, busy_at) VALUES (:user_id, :title, :model, :version, NOW())")
            ->execute(['user_id' => $userId, 'title' => $title, 'model' => $model, 'version' => $version]);
        $chatId = (int) $conn->lastInsertId();
    } else {
        $conn->prepare("UPDATE assistant_chats SET busy_at = NOW() WHERE id = :id")->execute(['id' => $chatId]);
    }
    $insert = $conn->prepare("INSERT INTO assistant_messages (chat_id, user_id, kind, content, model, cost_usd, usage_json) VALUES (:chat_id, :user_id, :kind, :content, :model, :cost, :usage)");
    $store = function (array $rows) use ($insert, $chatId, $userId) {
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
    };
    $store([['kind' => 'user', 'message' => $userMessage, 'model' => null]]);
    $userRowId = (int) $conn->lastInsertId();
    $conn->commit();
} catch (Exception $e) {
    if (isset($conn) && $conn->inTransaction()) {
        $conn->rollBack();
    }
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

$savedSteps = 0;
$finished = false;
$release = function () use ($conn, $chatId) {
    $conn->prepare("UPDATE assistant_chats SET busy_at = NULL, updated_at = updated_at WHERE id = :id")->execute(['id' => $chatId]);
};
// a fatal error (memory, time limit) must not leave the chat blocked
register_shutdown_function(function () use (&$finished, $release) {
    if (!$finished) {
        try {
            $release();
        } catch (Throwable $e) {
            // the block expires by itself after Assistant::BUSY_MINUTES
        }
    }
});
$fail = function ($message) use ($conn, $emit, $release, $chatId, $isNew, $userRowId, &$savedSteps, &$finished) {
    try {
        if ($conn->inTransaction()) {
            $conn->rollBack();
        }
        if ($savedSteps === 0) {
            // nothing of the reply exists: take her message back out so she can send it again
            $conn->prepare("DELETE FROM assistant_messages WHERE id = :id")->execute(['id' => $userRowId]);
            if ($isNew) {
                $conn->prepare("DELETE FROM assistant_chats WHERE id = :id")->execute(['id' => $chatId]);
            }
        }
        $release();
    } catch (Throwable $e) {
        error_log('Assistant cleanup failed: ' . $e->getMessage());
    }
    $finished = true;
    $emit('error', $savedSteps === 0 ? ['message' => $message] : ['message' => $message, 'saved' => true, 'chat_id' => $chatId]);
};

$emit('chat', ['chat_id' => $chatId]);

try {
    $result = Assistant::reply($conn, $userId, $history, $model, $emit, $version, function (array $rows) use ($store, &$savedSteps) {
        $store($rows);
        $savedSteps += count($rows);
    });

    $conn->prepare("UPDATE assistant_chats SET model = :model, busy_at = NULL, updated_at = NOW() WHERE id = :id")
        ->execute(['model' => $model, 'id' => $chatId]);
    $finished = true;

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
        // a long chat costs more per reply - the app suggests starting a new one
        'long_chat' => $result['prompt_tokens'] > Assistant::LONG_CHAT_TOKENS,
        'title' => $title,
        'model' => $result['model'],
        'model_label' => Assistant::modelLabel($result['model']),
    ]);
} catch (RuntimeException $e) {
    $fail($e->getMessage());
} catch (Throwable $e) {
    error_log('Assistant reply failed: ' . $e->getMessage());
    $fail(($_ENV['APP_DEBUG'] ?? '') === 'true' ? $e->getMessage() : 'Nie udało się dokończyć odpowiedzi. Spróbuj jeszcze raz.');
}
