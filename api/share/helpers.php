<?php
/**
 * "Udostępnij": reels / files with a public link for brands and managers.
 *
 * Files are uploaded in pieces (a few MB each), so the hosting's PHP upload
 * limit does not matter - a reel can be gigabytes. They live in api/uploads/share
 * (no direct access) and are served by share/index.php under the share.* subdomain.
 */

require_once __DIR__ . '/../config/Schema.php';

// dHosting plan size for the "Zajęte miejsce" bar; STORAGE_QUOTA_GB in api/.env changes it
const SHARE_DEFAULT_QUOTA_GB = 20;

// Default cap per file; SHARE_MAX_SIZE_MB in api/.env changes it
const SHARE_DEFAULT_MAX_MB = 5120; // 5 GB

// Files that could run on the server or in the browser are never accepted
const SHARE_BLOCKED_EXT = ['php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phar', 'pht', 'cgi', 'pl', 'py', 'sh', 'asp', 'aspx', 'jsp', 'htm', 'html', 'xhtml', 'shtml', 'svg', 'svgz', 'js', 'mjs', 'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'htaccess'];

// Shown in the browser (player / photo); everything else is a download
const SHARE_INLINE_MIME = '#^(video/(mp4|quicktime|webm|x-m4v|ogg)|audio/(mpeg|mp4|x-m4a|wav|x-wav|ogg|aac)|image/(jpeg|png|webp|gif))$#';

function shareMaxSize()
{
    $mb = intval($_ENV['SHARE_MAX_SIZE_MB'] ?? 0);
    return ($mb > 0 ? $mb : SHARE_DEFAULT_MAX_MB) * 1024 * 1024;
}

function shareDir()
{
    return __DIR__ . '/../uploads/share';
}

function shareTmpDir()
{
    return shareDir() . '/tmp';
}

// Subdomain pointing at the share/ folder (panel.malgorzatamordarska.pl/share/<token> works too)
const SHARE_DEFAULT_URL = 'https://share.malgorzatamordarska.pl';

/** Link base: SHARE_URL from api/.env overrides; locally (no subdomain) this host + /share. */
function shareBaseUrl()
{
    $configured = rtrim(trim($_ENV['SHARE_URL'] ?? ''), '/');
    if ($configured !== '') {
        return $configured;
    }
    $host = preg_replace('/[^A-Za-z0-9.:-]/', '', $_SERVER['HTTP_HOST'] ?? '');
    if (substr($host, -strlen('malgorzatamordarska.pl')) === 'malgorzatamordarska.pl') {
        return SHARE_DEFAULT_URL;
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    return ($https ? 'https' : 'http') . '://' . $host . '/share';
}

function shareIniBytes($value)
{
    $value = trim((string) $value);
    if ($value === '') {
        return 0;
    }
    $number = (float) $value;
    switch (strtolower(substr($value, -1))) {
        case 'g':
            $number *= 1024;
            // fall through
        case 'm':
            $number *= 1024;
            // fall through
        case 'k':
            $number *= 1024;
    }
    return (int) $number;
}

/** One piece: 8 MB, smaller when the server's POST limit is lower. */
function shareChunkSize()
{
    $size = 8 * 1024 * 1024;
    $postMax = shareIniBytes(ini_get('post_max_size'));
    if ($postMax > 0) {
        $size = min($size, $postMax - 64 * 1024);
    }
    return max(256 * 1024, $size);
}

function shareEnsure(PDO $conn)
{
    Schema::ensure($conn, 'shares');
}

/** 12 letters/digits - the part after the slash in the link. */
function shareNewToken(PDO $conn)
{
    $alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for ($try = 0; $try < 10; $try++) {
        $token = '';
        for ($i = 0; $i < 12; $i++) {
            $token .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $stmt = $conn->prepare("SELECT 1 FROM shares WHERE token = :token");
        $stmt->execute(['token' => $token]);
        if (!$stmt->fetchColumn()) {
            return $token;
        }
    }
    throw new RuntimeException('Could not generate a unique token');
}

function shareExtension($name)
{
    $ext = strtolower(pathinfo((string) $name, PATHINFO_EXTENSION));
    return preg_match('/^[a-z0-9]{1,8}$/', $ext) ? $ext : '';
}

function shareTitleFromName($name)
{
    $title = trim(preg_replace('/\.[A-Za-z0-9]{1,8}$/', '', (string) $name));
    return mb_substr($title !== '' ? $title : 'Plik', 0, 255);
}

/** 'active' | 'off' | 'expired' */
function shareStatus(array $row)
{
    if ((int) $row['is_active'] !== 1) {
        return 'off';
    }
    if (!empty($row['expires_at']) && strtotime($row['expires_at']) < time()) {
        return 'expired';
    }
    return 'active';
}

/** What the panel gets for one file. */
function shareForPanel(array $row)
{
    return [
        'id' => (int) $row['id'],
        'token' => $row['token'],
        'url' => shareBaseUrl() . '/' . $row['token'],
        'title' => $row['title'],
        'note' => $row['note'],
        'original_name' => $row['original_name'],
        'mime_type' => $row['mime_type'],
        'size' => (int) $row['size'],
        'has_poster' => !empty($row['poster_name']),
        'is_active' => (int) $row['is_active'] === 1,
        'allow_download' => (int) $row['allow_download'] === 1,
        'expires_at' => $row['expires_at'],
        'status' => shareStatus($row),
        'views' => (int) $row['views'],
        'downloads' => (int) $row['downloads'],
        'last_viewed_at' => $row['last_viewed_at'],
        'created_at' => $row['created_at'],
    ];
}

function shareFolderSize($dir, $recursive = true)
{
    if (!is_dir($dir)) {
        return 0;
    }
    $total = 0;
    $items = $recursive
        ? new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS))
        : new FilesystemIterator($dir, FilesystemIterator::SKIP_DOTS);
    foreach ($items as $file) {
        if ($file->isFile() && $file->getFilename() !== '.htaccess') {
            $total += $file->getSize();
        }
    }
    return $total;
}

/**
 * Space taken by everything the app keeps on the server (bytes), by kind.
 * $sharesActive: size of shares still on the list - the rest of share/ is the bin and unfinished uploads.
 * Measured against the hosting plan (20 GB; STORAGE_QUOTA_GB in api/.env, 0 = no bar).
 */
function shareStorage($sharesActive)
{
    $uploads = __DIR__ . '/../uploads';
    $shares = shareFolderSize($uploads . '/share');
    $parts = [
        'shares' => $shares,
        'documents' => shareFolderSize($uploads . '/documents'),
        'attachments' => shareFolderSize($uploads, false), // attachments sit directly in uploads/
        'inbox' => shareFolderSize($uploads . '/inbox'),
        'backups' => shareFolderSize(__DIR__ . '/../backups'),
    ];
    $quotaEnv = trim((string) ($_ENV['STORAGE_QUOTA_GB'] ?? ''));
    $quotaGb = $quotaEnv !== '' ? (float) str_replace(',', '.', $quotaEnv) : SHARE_DEFAULT_QUOTA_GB;

    return [
        'total' => array_sum($parts),
        'parts' => $parts,
        'shares_bin' => max(0, $shares - $sharesActive), // deleted (30 days in the bin) + unfinished uploads
        'quota' => $quotaGb > 0 ? (int) round($quotaGb * 1073741824) : null,
    ];
}

/** Drop pieces of uploads abandoned more than a day ago. */
function shareCleanupTmp()
{
    foreach (glob(shareTmpDir() . '/*.{part,json}', GLOB_BRACE) ?: [] as $file) {
        if (filemtime($file) < time() - 86400) {
            @unlink($file);
        }
    }
}

/** The upload being assembled (state file written by start.php), only for its owner. */
function shareLoadUpload($uploadId, $userId)
{
    if (!preg_match('/^[a-f0-9]{32}$/', (string) $uploadId)) {
        return null;
    }
    $metaPath = shareTmpDir() . '/' . $uploadId . '.json';
    if (!is_file($metaPath)) {
        return null;
    }
    $meta = json_decode((string) file_get_contents($metaPath), true);
    if (!is_array($meta) || (int) ($meta['user_id'] ?? 0) !== (int) $userId) {
        return null;
    }
    $meta['part'] = shareTmpDir() . '/' . $uploadId . '.part';
    $meta['meta'] = $metaPath;
    return $meta;
}

/**
 * Send a file with HTTP Range support (seeking in the video player, resumed downloads).
 * $disposition: 'inline' | 'attachment'
 */
function shareStream($path, $mime, $downloadName, $disposition, $cache = 'private, max-age=3600')
{
    $size = filesize($path);
    $start = 0;
    $end = $size - 1;

    @set_time_limit(0);
    @ini_set('zlib.output_compression', 'Off');
    if (function_exists('apache_setenv')) {
        @apache_setenv('no-gzip', '1');
    }
    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    header_remove('Content-Type');
    header('Accept-Ranges: bytes');
    header('Content-Type: ' . $mime);
    header('Content-Disposition: ' . $disposition . "; filename*=UTF-8''" . rawurlencode($downloadName));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: ' . $cache);
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', filemtime($path)) . ' GMT');

    $range = $_SERVER['HTTP_RANGE'] ?? '';
    if ($range !== '' && preg_match('/^bytes=(\d*)-(\d*)$/', trim($range), $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') {
            $start = max(0, $size - (int) $m[2]); // last N bytes
        } else {
            $start = (int) $m[1];
            if ($m[2] !== '') {
                $end = min((int) $m[2], $size - 1);
            }
        }
        if ($start > $end || $start >= $size) {
            http_response_code(416);
            header("Content-Range: bytes */$size");
            exit;
        }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    } else {
        http_response_code(200);
    }

    $length = $end - $start + 1;
    header('Content-Length: ' . $length);
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
        exit;
    }

    $fp = fopen($path, 'rb');
    if (!$fp) {
        exit;
    }
    fseek($fp, $start);
    $left = $length;
    while ($left > 0 && !feof($fp) && !connection_aborted()) {
        $buffer = fread($fp, (int) min(1024 * 1024, $left));
        if ($buffer === false || $buffer === '') {
            break;
        }
        echo $buffer;
        flush();
        $left -= strlen($buffer);
    }
    fclose($fp);
    exit;
}
