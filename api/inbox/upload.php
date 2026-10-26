<?php
/**
 * "Udostępnij -> Gonia": a screen (or text) goes in, AI sorts it.
 *
 * POST /api/inbox/upload.php
 *   multipart: file (image), text (optional note / shared text)   - or a raw image body
 *   Auth: the app's session, or the share-sheet token in header X-Gonia-Token
 *         (?t=TOKEN also works) - see api/inbox/token.php.
 *
 * task / idea -> saved right away; purchase / collaboration / document -> waits on Start.
 * The Shortcut gets one line of plain text back (shown as its notification); the app gets JSON.
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/AiSettings.php';
require_once __DIR__ . '/../config/RateLimit.php';
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$token = $_SERVER['HTTP_X_GONIA_TOKEN'] ?? ($_GET['t'] ?? '');
$viaShortcut = $token !== '';

/** Plain text for the Shortcut, JSON for the app. */
function inboxReply($viaShortcut, $text, array $data = [], $status = 200)
{
    if ($viaShortcut) {
        http_response_code($status);
        header('Content-Type: text/plain; charset=utf-8');
        echo $text;
        exit;
    }
    if ($status >= 400) {
        Response::error($text, $status);
    }
    Response::success($data, $text);
}

try {
    $db = new Database();
    $conn = $db->getConnection();

    if ($viaShortcut) {
        $userId = inboxUserFromToken($conn, $token);
        if (!$userId) {
            inboxReply(true, 'Gonia: ten skrót ma stary klucz. Skopiuj nowy w Ustawieniach → Udostępnianie z iPhone’a.', [], 401);
        }
    } else {
        require_once __DIR__ . '/../middleware/auth.php';
        $userId = (int) getCurrentUserId();
    }
    Schema::ensure($conn, 'inbox_items');
    Schema::ensure($conn, 'tasks');

    if (RateLimit::wait($conn, 'inbox', $userId, 60, 60) > 0) {
        inboxReply($viaShortcut, 'Gonia: za dużo naraz, spróbuj za chwilę.', [], 429);
    }
    RateLimit::hit($conn, 'inbox', $userId);

    // The file: multipart "file" (or any file field), else a raw image body
    $tmp = null;
    $originalName = null;
    $upload = $_FILES['file'] ?? (count($_FILES) ? reset($_FILES) : null);
    if ($upload && is_array($upload['tmp_name'])) {
        $upload = ['tmp_name' => $upload['tmp_name'][0], 'name' => $upload['name'][0], 'error' => $upload['error'][0], 'size' => $upload['size'][0]];
    }
    if ($upload && ($upload['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
        $tmp = $upload['tmp_name'];
        $originalName = (string) $upload['name'];
    } elseif (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'image/') === 0) {
        $tmp = tempnam(sys_get_temp_dir(), 'inbox');
        file_put_contents($tmp, file_get_contents('php://input'));
    }

    $text = trim((string) ($_POST['text'] ?? ''));
    if ($text === '' && stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') === 0) {
        $json = json_decode(file_get_contents('php://input'), true) ?: [];
        $text = trim((string) ($json['text'] ?? ''));
    }
    $text = mb_substr($text, 0, 2000);

    if (!$tmp && $text === '') {
        inboxReply($viaShortcut, 'Gonia: nic nie przyszło - udostępnij screena albo tekst.', [], 400);
    }

    $stored = null;
    $mime = null;
    $size = 0;
    if ($tmp) {
        $size = filesize($tmp);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
        if (!isset(INBOX_IMAGE_TYPES[$mime])) {
            inboxReply($viaShortcut, 'Gonia: to nie jest obraz (JPG, PNG, HEIC).', [], 415);
        }
        if ($size > INBOX_MAX_BYTES) {
            inboxReply($viaShortcut, 'Gonia: obraz jest za duży (max 15 MB).', [], 413);
        }
        $stored = bin2hex(random_bytes(16)) . '.' . INBOX_IMAGE_TYPES[$mime];
        $target = inboxUploadDir() . '/' . $stored;
        if (!(is_uploaded_file($tmp) ? move_uploaded_file($tmp, $target) : rename($tmp, $target))) {
            inboxReply($viaShortcut, 'Gonia: nie udało się zapisać screena.', [], 500);
        }
    }

    // What is it?
    $result = ['kind' => null, 'title' => $stored ? 'Screen do sprawdzenia' : mb_substr($text, 0, 120), 'data' => []];
    $aiError = null;
    try {
        AiSettings::apply($conn, $userId);
        if ($stored) {
            $image = inboxImageForAi(inboxUploadDir() . '/' . $stored, $mime);
            $result = inboxNormalize(AiClient::classifyImage(inboxPrompt(date('Y-m-d'), $text), [$image], inboxSchema()));
        } elseif (AiClient::provider()) {
            $note = normalizeCapture(AiClient::classifyText(capturePrompt(date('Y-m-d'), date('l')), $text, captureSchema()), $text);
            $data = $note['kind'] === 'task' ? ['title' => $note['title'], 'due_date' => $note['due_date']]
                : ($note['kind'] === 'idea' ? ['title' => $note['title'], 'content' => $note['idea']['content'] ?: $text]
                    : ($note[$note['kind']] ?? []));
            $result = ['kind' => $note['kind'], 'title' => $note['title'], 'data' => $data];
        } else {
            $result = ['kind' => 'task', 'title' => mb_substr($text, 0, 120), 'data' => ['title' => mb_substr($text, 0, 255), 'due_date' => null]];
        }
    } catch (RuntimeException $e) {
        $aiError = $e->getMessage();
    }

    $kind = $result['kind'];
    $data = $result['data'];
    $done = false;
    $created = null;
    if ($kind === 'task') {
        $conn->prepare("INSERT INTO tasks (user_id, title, due_date) VALUES (:user_id, :title, :due)")
            ->execute(['user_id' => $userId, 'title' => mb_substr($data['title'] ?: $result['title'], 0, 255), 'due' => $data['due_date'] ?? date('Y-m-d')]);
        $created = ['task_id' => (int) $conn->lastInsertId()];
        $done = true;
    } elseif ($kind === 'idea') {
        $conn->prepare("INSERT INTO ideas (user_id, title, content, status) VALUES (:user_id, :title, :content, 'draft')")
            ->execute(['user_id' => $userId, 'title' => mb_substr($data['title'] ?: $result['title'], 0, 255), 'content' => $data['content'] ?? '']);
        $created = ['idea_id' => (int) $conn->lastInsertId()];
        $done = true;
    }

    $conn->prepare("
        INSERT INTO inbox_items (user_id, source, stored_name, original_name, mime_type, size, note, kind, title, data, done_at)
        VALUES (:user_id, :source, :stored, :original, :mime, :size, :note, :kind, :title, :data, :done_at)
    ")->execute([
        'user_id' => $userId,
        'source' => $viaShortcut ? 'shortcut' : 'app',
        'stored' => $stored,
        'original' => $originalName ? mb_substr($originalName, 0, 255) : null,
        'mime' => $mime,
        'size' => $size,
        'note' => $text !== '' ? $text : null,
        'kind' => $kind,
        'title' => mb_substr($result['title'], 0, 255),
        'data' => json_encode($data + ($created ?: []), JSON_UNESCAPED_UNICODE),
        'done_at' => $done ? date('Y-m-d H:i:s') : null,
    ]);
    $id = (int) $conn->lastInsertId();

    $labels = ['task' => 'Zadanie', 'idea' => 'Pomysł na rolkę', 'purchase' => 'Zakup', 'collaboration' => 'Współpraca', 'document' => 'Dokument'];
    if ($done) {
        $message = '✓ ' . $labels[$kind] . ': ' . ($data['title'] ?: $result['title']);
    } elseif ($kind) {
        $message = '✓ ' . $result['title'] . ' - dokończ na Starcie w Goni.';
    } else {
        $message = '✓ Zapisane w Goni' . ($aiError ? ' (AI nie odczytało - sprawdź na Starcie)' : '') . '.';
    }

    inboxReply($viaShortcut, $message, [
        'id' => $id,
        'kind' => $kind,
        'title' => $result['title'],
        'data' => $data,
        'done' => $done,
        'created' => $created,
        'ai_error' => $aiError,
    ]);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        inboxReply($viaShortcut, 'Inbox failed: ' . $e->getMessage(), [], 500);
    }
    inboxReply($viaShortcut, 'Gonia: coś nie wyszło, spróbuj jeszcze raz.', [], 500);
}
