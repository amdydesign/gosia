<?php
/**
 * Public page of a shared reel / file - what a brand or a manager opens from the link.
 *
 *   /<token>           page with the player (or photo) and "Pobierz"
 *   /<token>/file      the file itself, for the player (Range = seeking)
 *   /<token>/download  the file as a download (counted)
 *   /<token>/poster    cover frame (player + link preview in messengers)
 *   ?p=1               preview from the app - not counted as a view
 */

require_once __DIR__ . '/../api/config/Database.php';
require_once __DIR__ . '/../api/share/helpers.php';

function h($text)
{
    return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
}

function shareSize($bytes)
{
    if ($bytes >= 1073741824) {
        return str_replace('.', ',', round($bytes / 1073741824, 1)) . ' GB';
    }
    if ($bytes >= 1048576) {
        return round($bytes / 1048576) . ' MB';
    }
    return max(1, round($bytes / 1024)) . ' KB';
}

function shareDate($value)
{
    $months = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
    $time = strtotime((string) $value);
    return $time ? date('j', $time) . ' ' . $months[(int) date('n', $time) - 1] . ' ' . date('Y', $time) : '';
}

/** Link previews (WhatsApp, Messenger, Slack...) fetch the page too - those are not views. */
function shareIsBot()
{
    $agent = $_SERVER['HTTP_USER_AGENT'] ?? '';
    return $agent === '' || preg_match('/bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|linkedin|embedly|curl|wget|python|okhttp|headless/i', $agent);
}

function sharePage($status, $title, $body, $head = '')
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    $brand = trim($_ENV['SHARE_BRAND'] ?? '') ?: 'Małgorzata Mordarska';
    ?>
<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0b0b0d">
<title><?= h($title) ?> · <?= h($brand) ?></title>
<?= $head ?>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; }
    body {
        min-height: 100vh; min-height: 100dvh;
        background: #0b0b0d; color: #f3f3ef;
        font: 15px/1.5 Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
        -webkit-font-smoothing: antialiased;
        display: flex; flex-direction: column; align-items: center;
        padding: max(20px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom));
    }
    .brand { font-family: 'Space Grotesk', Inter, sans-serif; font-weight: 600; letter-spacing: -0.01em; font-size: 15px; color: #a1a19a; margin-bottom: 20px; text-align: center; }
    .brand b { color: #f3f3ef; font-weight: 600; }
    main { width: 100%; max-width: 560px; display: flex; flex-direction: column; align-items: center; }
    .media { width: 100%; display: flex; justify-content: center; }
    video, .media img { display: block; max-width: 100%; max-height: 72vh; max-height: 72dvh; border-radius: 18px; background: #000; }
    video { width: 100%; }
    audio { width: 100%; }
    .file { width: 100%; border: 1px solid #26262b; background: #151518; border-radius: 18px; padding: 36px 20px; text-align: center; }
    .file .ext { display: inline-flex; align-items: center; justify-content: center; min-width: 64px; height: 64px; padding: 0 12px; border-radius: 16px; background: #d4f25a; color: #0b0b0d; font: 700 16px 'Space Grotesk', Inter, sans-serif; text-transform: uppercase; }
    h1 { font-family: 'Space Grotesk', Inter, sans-serif; font-size: 22px; line-height: 1.25; font-weight: 600; letter-spacing: -0.02em; margin: 18px 0 4px; text-align: center; overflow-wrap: anywhere; }
    .meta { color: #a1a19a; font-size: 13px; text-align: center; }
    .note { width: 100%; margin-top: 16px; padding: 14px 16px; border-radius: 14px; background: #151518; border: 1px solid #26262b; white-space: pre-line; overflow-wrap: anywhere; }
    .btn { margin-top: 20px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 50px; padding: 0 26px; border-radius: 999px; background: #d4f25a; color: #0b0b0d; font-weight: 700; font-size: 15px; text-decoration: none; }
    .btn:hover { background: #c5e63f; }
    .btn svg { width: 18px; height: 18px; }
    .hint { color: #77776f; font-size: 12px; margin-top: 10px; text-align: center; }
    .empty { margin-top: 12vh; text-align: center; }
    .empty p { color: #a1a19a; margin: 6px 0 0; }
    footer { margin-top: auto; padding-top: 32px; color: #55554f; font-size: 11px; text-align: center; }
</style>
</head>
<body>
<div class="brand"><b><?= h($brand) ?></b></div>
<main>
<?= $body ?>
</main>
<footer>Link udostępniony prywatnie — nie przekazuj go dalej bez zgody.</footer>
</body>
</html>
<?php
    exit;
}

function shareGone($title, $text, $status = 404)
{
    sharePage($status, $title, '<div class="empty"><h1>' . h($title) . '</h1><p>' . h($text) . '</p></div>');
}

try {
    $db = new Database();
    $conn = $db->getConnection();

    $token = (string) ($_GET['t'] ?? '');
    $action = (string) ($_GET['a'] ?? '');

    if (!preg_match('/^[A-Za-z0-9]{8,20}$/', $token)) {
        shareGone('Tu nic nie ma', 'Sprawdź, czy link został skopiowany w całości.');
    }

    shareEnsure($conn);
    $stmt = $conn->prepare("SELECT * FROM shares WHERE token = :token");
    $stmt->execute(['token' => $token]);
    $share = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$share) {
        shareGone('Link nie działa', 'Plik został usunięty albo link jest niepełny.');
    }
    $status = shareStatus($share);
    if ($status === 'off') {
        shareGone('Link jest wyłączony', 'Poproś o nowy link.', 410);
    }
    if ($status === 'expired') {
        shareGone('Link wygasł', 'Poproś o nowy link.', 410);
    }

    $path = shareDir() . '/' . $share['stored_name'];
    if (!is_file($path)) {
        shareGone('Pliku już nie ma', 'Poproś o nowy link.', 410);
    }

    $mime = $share['mime_type'];
    $inline = (bool) preg_match(SHARE_INLINE_MIME, $mime);
    $canDownload = (int) $share['allow_download'] === 1;

    if ($action === 'poster') {
        $poster = $share['poster_name'] ? shareDir() . '/' . $share['poster_name'] : '';
        if (!$poster || !is_file($poster)) {
            http_response_code(404);
            exit;
        }
        shareStream($poster, (new finfo(FILEINFO_MIME_TYPE))->file($poster) ?: 'image/jpeg', $share['poster_name'], 'inline', 'public, max-age=86400');
    }

    if ($action === 'file') {
        if (!$inline) {
            http_response_code(404);
            exit;
        }
        shareStream($path, $mime, $share['original_name'], 'inline');
    }

    if ($action === 'download') {
        if (!$canDownload) {
            shareGone('Pobieranie jest wyłączone', 'Ten plik można tylko obejrzeć.', 403);
        }
        // count the start of a download, not every resumed piece of it
        if (!shareIsBot() && empty($_GET['p']) && preg_match('/^(bytes=0-)?$/', trim($_SERVER['HTTP_RANGE'] ?? ''))) {
            $conn->prepare("UPDATE shares SET downloads = downloads + 1 WHERE id = :id")->execute(['id' => $share['id']]);
        }
        shareStream($path, $mime, $share['original_name'], 'attachment');
    }

    if (!shareIsBot() && empty($_GET['p'])) {
        $conn->prepare("UPDATE shares SET views = views + 1, last_viewed_at = NOW() WHERE id = :id")->execute(['id' => $share['id']]);
    }

    // Links relative to this page: works on share.* and on panel.*/share alike
    $self = rtrim(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/');
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $origin = ($https ? 'https' : 'http') . '://' . preg_replace('/[^A-Za-z0-9.:-]/', '', $_SERVER['HTTP_HOST'] ?? '');
    $preview = !empty($_GET['p']) ? '?p=1' : '';
    $fileUrl = $self . '/file';
    $posterUrl = $share['poster_name'] ? $self . '/poster' : '';
    $downloadUrl = $self . '/download' . $preview;

    $title = $share['title'];
    $meta = shareSize((int) $share['size']) . ' · ' . shareDate($share['created_at']);

    if (strpos($mime, 'video/') === 0 && $inline) {
        $media = '<video controls playsinline preload="metadata" src="' . h($fileUrl) . '"'
            . ($posterUrl ? ' poster="' . h($posterUrl) . '"' : '')
            . ($canDownload ? '' : ' controlslist="nodownload"') . '></video>';
    } elseif (strpos($mime, 'image/') === 0 && $inline) {
        $media = '<img src="' . h($fileUrl) . '" alt="' . h($title) . '">';
    } elseif (strpos($mime, 'audio/') === 0 && $inline) {
        $media = '<audio controls preload="metadata" src="' . h($fileUrl) . '"></audio>';
    } else {
        $ext = shareExtension($share['original_name']) ?: 'plik';
        $media = '<div class="file"><span class="ext">' . h($ext) . '</span></div>';
    }

    $body = '<div class="media">' . $media . '</div>'
        . '<h1>' . h($title) . '</h1>'
        . '<div class="meta">' . h($meta) . '</div>';
    if (trim((string) $share['note']) !== '') {
        $body .= '<div class="note">' . h($share['note']) . '</div>';
    }
    if ($canDownload) {
        $body .= '<a class="btn" href="' . h($downloadUrl) . '" download>'
            . '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>'
            . 'Pobierz · ' . h(shareSize((int) $share['size'])) . '</a>';
        if (strpos($mime, 'video/') === 0) {
            $body .= '<div class="hint">Pobierasz oryginał w pełnej jakości.</div>';
        }
    }

    $head = '<meta property="og:type" content="' . (strpos($mime, 'video/') === 0 ? 'video.other' : 'website') . '">'
        . '<meta property="og:title" content="' . h($title) . '">'
        . '<meta property="og:description" content="' . h($meta) . '">';
    if ($posterUrl) {
        $head .= '<meta property="og:image" content="' . h($origin . $posterUrl) . '">';
    }

    sharePage(200, $title, $body, $head);

} catch (Exception $e) {
    shareGone('Coś poszło nie tak', 'Spróbuj otworzyć link za chwilę.', 500);
}
