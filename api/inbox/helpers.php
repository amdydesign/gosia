<?php
/**
 * Inbox: screens (and text) shared to Gonia from the iPhone share sheet (an Apple
 * Shortcut posting here with a personal token) or dropped into "Zrzuć tutaj".
 *
 * AI says what it is. A task or a reel idea is saved right away; a purchase,
 * a paid collaboration or a document waits on Start ("Ze screena: ...") and
 * opens the right form with the screen already attached.
 */

require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../utils/CapturePrompts.php';

const INBOX_KINDS = ['purchase', 'collaboration', 'document', 'idea', 'task'];
const INBOX_MAX_BYTES = 15 * 1024 * 1024;
const INBOX_AI_MAX_SIDE = 1800; // px - enough to read a screen, much cheaper than full size
const INBOX_IMAGE_TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'image/heic' => 'heic', 'image/heif' => 'heic'];

function inboxUploadDir()
{
    $dir = __DIR__ . '/../uploads/inbox';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    return $dir;
}

/** The user a share-sheet token belongs to (tokens live in app_settings as "inbox_token"). */
function inboxUserFromToken(PDO $conn, $token)
{
    $token = trim((string) $token);
    if (strlen($token) < 24) {
        return null;
    }
    Schema::ensure($conn, 'app_settings');
    $stmt = $conn->query("SELECT user_id, value FROM app_settings WHERE name = 'inbox_token'");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        if (hash_equals((string) $row['value'], $token)) {
            return (int) $row['user_id'];
        }
    }
    return null;
}

function inboxToken(PDO $conn, $userId, $renew = false)
{
    Schema::ensure($conn, 'app_settings');
    if (!$renew) {
        $stmt = $conn->prepare("SELECT value FROM app_settings WHERE user_id = :user_id AND name = 'inbox_token'");
        $stmt->execute(['user_id' => $userId]);
        $token = (string) $stmt->fetchColumn();
        if ($token !== '') {
            return $token;
        }
    }
    $token = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
    $conn->prepare("
        INSERT INTO app_settings (user_id, name, value) VALUES (:user_id, 'inbox_token', :value)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
    ")->execute(['user_id' => $userId, 'value' => $token]);
    return $token;
}

/**
 * Image ready for the AI: at most INBOX_AI_MAX_SIDE px, JPEG/PNG, base64.
 * HEIC (iPhone photos) needs Imagick on the server - the shortcut converts to JPEG first.
 */
function inboxImageForAi($path, $mime)
{
    if ($mime === 'image/heic' || $mime === 'image/heif') {
        if (!class_exists('Imagick')) {
            throw new RuntimeException('Zdjęcie HEIC - w skrócie dodaj krok „Konwertuj obraz” na JPEG.');
        }
        $im = new Imagick($path);
        $im->setImageFormat('jpeg');
        $im->thumbnailImage(INBOX_AI_MAX_SIDE, INBOX_AI_MAX_SIDE, true);
        return ['media_type' => 'image/jpeg', 'data' => base64_encode($im->getImageBlob())];
    }
    $size = @getimagesize($path);
    $tooBig = $size && max($size[0], $size[1]) > INBOX_AI_MAX_SIDE;
    if ((!$tooBig && filesize($path) <= 4 * 1024 * 1024) || !function_exists('imagecreatefromstring')) {
        return ['media_type' => $mime, 'data' => base64_encode(file_get_contents($path))];
    }
    $src = imagecreatefromstring(file_get_contents($path));
    if (!$src) {
        return ['media_type' => $mime, 'data' => base64_encode(file_get_contents($path))];
    }
    $scale = $size ? min(1, INBOX_AI_MAX_SIDE / max($size[0], $size[1])) : 1;
    $w = max(1, (int) round(imagesx($src) * $scale));
    $h = max(1, (int) round(imagesy($src) * $scale));
    $dst = imagecreatetruecolor($w, $h);
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $w, $h, imagesx($src), imagesy($src));
    ob_start();
    imagejpeg($dst, null, 85);
    $jpeg = ob_get_clean();
    imagedestroy($src);
    imagedestroy($dst);
    return ['media_type' => 'image/jpeg', 'data' => base64_encode($jpeg)];
}

function inboxPrompt($today, $note)
{
    $noteText = trim((string) $note) !== '' ? "\nDopisek od niej: \"" . mb_substr(trim($note), 0, 500) . "\"\n" : '';
    return <<<PROMPT
Jesteś asystentką stylistki i influencerki z Polski. Udostępniła do swojej aplikacji screena (albo zdjęcie). Dzisiaj jest {$today}.{$noteText}
Rozpoznaj, co to jest, i zwróć dane w schemacie JSON.

Rodzaje (kind):
- "purchase" - potwierdzenie zamówienia, paragon, koszyk lub mail ze sklepu z ubraniami/dodatkami (rzeczy, które może zwróci).
- "collaboration" - PŁATNA współpraca: wiadomość, mail lub brief od marki/agencji z propozycją współpracy, zlecenie, potwierdzenie stawki.
- "document" - umowa, NDA, aneks, rachunek, faktura - dokument do archiwum.
- "idea" - inspiracja na rolkę: cudza rolka/post, cytat, notatka z pomysłem.
- "task" - wszystko inne do zrobienia: wiadomość, na którą trzeba odpowiedzieć, termin, prośba (np. "prześlij fakturę do piątku").
- W razie wątpliwości wybierz "task".

Pola:
- title: krótko po polsku, co to jest - widać to na liście, np. "Zakup — Zalando, 2 rzeczy", "Współpraca — Vichy, 2 stories", "Umowa — LPP", "Odpisz Ani w sprawie sesji".
- task: dla "task" - title (zacznij od czasownika) i due_date (RRRR-MM-DD, gdy widać termin; inaczej pusty tekst).
- idea: dla "idea" - title (tytuł rolki do 60 znaków) i content (1-3 zdania: o czym ma być rolka).
- collaboration: brand, amount_gross (zł brutto, 0 gdy brak kwoty), notes (co trzeba zrobić, terminy).
- purchase: store, item (krótko, co kupiła), amount (zł, 0 gdy nie widać).
- Zawsze zwracaj wszystkie pola; te, które nie pasują, wypełnij pustymi tekstami i zerami. Nie wymyślaj kwot ani marek.
PROMPT;
}

function inboxSchema()
{
    $str = ['type' => 'string'];
    $num = ['type' => 'number'];
    return [
        'type' => 'object',
        'properties' => [
            'kind' => ['type' => 'string', 'enum' => INBOX_KINDS],
            'title' => $str,
            'task' => ['type' => 'object', 'properties' => ['title' => $str, 'due_date' => $str], 'required' => ['title', 'due_date'], 'additionalProperties' => false],
            'idea' => ['type' => 'object', 'properties' => ['title' => $str, 'content' => $str], 'required' => ['title', 'content'], 'additionalProperties' => false],
            'collaboration' => ['type' => 'object', 'properties' => ['brand' => $str, 'amount_gross' => $num, 'notes' => $str], 'required' => ['brand', 'amount_gross', 'notes'], 'additionalProperties' => false],
            'purchase' => ['type' => 'object', 'properties' => ['store' => $str, 'item' => $str, 'amount' => $num], 'required' => ['store', 'item', 'amount'], 'additionalProperties' => false],
        ],
        'required' => ['kind', 'title', 'task', 'idea', 'collaboration', 'purchase'],
        'additionalProperties' => false,
    ];
}

/** AI result -> what we store: kind, title, data for the form. */
function inboxNormalize(array $r)
{
    $kind = in_array($r['kind'] ?? '', INBOX_KINDS, true) ? $r['kind'] : 'task';
    $title = trim((string) ($r['title'] ?? ''));
    $data = [];
    if ($kind === 'task') {
        $data = [
            'title' => trim((string) ($r['task']['title'] ?? '')) ?: $title,
            'due_date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($r['task']['due_date'] ?? '')) ? $r['task']['due_date'] : null,
        ];
    } elseif ($kind === 'idea') {
        $data = ['title' => trim((string) ($r['idea']['title'] ?? '')) ?: $title, 'content' => trim((string) ($r['idea']['content'] ?? ''))];
    } elseif ($kind === 'collaboration') {
        $c = $r['collaboration'] ?? [];
        $data = ['brand' => trim((string) ($c['brand'] ?? '')), 'amount_gross' => max(0, (float) ($c['amount_gross'] ?? 0)), 'notes' => trim((string) ($c['notes'] ?? ''))];
    } elseif ($kind === 'purchase') {
        $p = $r['purchase'] ?? [];
        $data = ['store' => trim((string) ($p['store'] ?? '')), 'item' => trim((string) ($p['item'] ?? '')), 'amount' => max(0, (float) ($p['amount'] ?? 0))];
    }
    return ['kind' => $kind, 'title' => mb_substr($title ?: ($data['title'] ?? 'Ze screena'), 0, 255), 'data' => $data];
}

/** Open inbox items of a user (newest first). */
function inboxOpenItems(PDO $conn, $userId)
{
    Schema::ensure($conn, 'inbox_items');
    $stmt = $conn->prepare("
        SELECT id, source, kind, title, data, note, original_name, mime_type, (stored_name IS NOT NULL) AS has_file, created_at
        FROM inbox_items WHERE user_id = :user_id AND done_at IS NULL
        ORDER BY created_at DESC LIMIT 30
    ");
    $stmt->execute(['user_id' => $userId]);
    $items = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $row['id'] = (int) $row['id'];
        $row['has_file'] = (bool) $row['has_file'];
        $row['data'] = json_decode((string) $row['data'], true) ?: [];
        $items[] = $row;
    }
    return $items;
}

/** Done items keep their file 30 days (for "Cofnij"), then it goes. */
function inboxPurge(PDO $conn)
{
    Schema::ensure($conn, 'inbox_items');
    $old = $conn->query("SELECT id, stored_name FROM inbox_items WHERE done_at IS NOT NULL AND done_at < DATE_SUB(NOW(), INTERVAL 30 DAY)")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($old as $row) {
        if ($row['stored_name'] && preg_match('/^[a-f0-9]{32}\.[a-z]{3,4}$/', $row['stored_name'])) {
            @unlink(inboxUploadDir() . '/' . $row['stored_name']);
        }
        $conn->prepare("DELETE FROM inbox_items WHERE id = :id")->execute(['id' => $row['id']]);
    }
}
