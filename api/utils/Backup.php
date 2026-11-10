<?php
/**
 * Backups - run by the existing cron (send_reminders.php) once a night, or by hand:
 *   php api/cron/backup.php            (add --files to include uploads now)
 *
 *  - every night: the whole database -> api/backups/db-YYYY-MM-DD-<random>.sql.gz (last 14 days kept)
 *  - Sundays: uploaded files (contracts, receipts) -> api/backups/files-YYYY-MM-DD-<random>.zip (last 2 kept)
 *    (the random part makes the names impossible to guess, should the directory ever be served)
 *  - off the server (optional): the same files to S3-compatible storage (Backblaze B2,
 *    Cloudflare R2, AWS...) - set BACKUP_S3_* in api/.env. With BACKUP_PASSWORD they are
 *    encrypted first (AES-256-GCM); keep that password outside the server too.
 *  - a failure sends a push to the admin - also when a run died half-way (e.g. out of memory);
 *    the nightly run is tried up to 3 times.
 * Restore: php api/utils/restore_backup.php <file>
 */

require_once __DIR__ . '/../config/Schema.php';

class Backup
{
    const KEEP_DB = 14;
    const KEEP_FILES = 2;
    const CHUNK = 8388608; // 8 MB - encryption works in pieces so big archives fit in memory
    const MAGIC = "GONIABK1";
    const MAX_TRIES = 3;           // nightly attempts before giving up until tomorrow
    const INSERT_BYTES = 1048576;  // one INSERT statement holds about 1 MB of rows
    // db-2026-10-26.sql.gz (older copies) or db-2026-10-26-0f3a9c....sql.gz
    const NAME_PATTERN = '/^(db|files)-(\d{4}-\d{2}-\d{2})(?:-[a-f0-9]{8,32})?\.(sql\.gz|zip)$/';

    public static function dir()
    {
        return __DIR__ . '/../backups';
    }

    /**
     * Once a night (03:00-05:59), called from the 15-minute cron. Returns a report or null.
     * "Done for today" is saved only after a success, so a run that failed or died is tried
     * again on the next cron runs (MAX_TRIES a night).
     */
    public static function runIfDue(PDO $conn, DateTime $now)
    {
        self::noteUnfinished($conn);
        if ($now->format('H') < '03' || $now->format('H') > '05') {
            return null;
        }
        $today = $now->format('Y-m-d');
        if (self::state($conn, 'backup_last_run') === $today) {
            return null;
        }
        // "YYYY-MM-DD n" - how many times tonight's backup was started
        $tries = explode(' ', self::state($conn, 'backup_tries'));
        $count = $tries[0] === $today ? (int) ($tries[1] ?? 0) : 0;
        if ($count >= self::MAX_TRIES) {
            return null;
        }
        self::setState($conn, 'backup_tries', $today . ' ' . ($count + 1));
        self::setState($conn, 'backup_started', date('Y-m-d H:i:s'));
        $report = self::run($conn, $now->format('N') === '7');
        self::setState($conn, 'backup_started', '');
        if ($report['ok']) {
            self::setState($conn, 'backup_last_run', $today);
        }
        return $report;
    }

    /**
     * A nightly run that started and never finished (fatal error: memory, time limit) leaves
     * "backup_started" behind. Seen on a later cron run: save the error and tell the admin.
     */
    private static function noteUnfinished(PDO $conn)
    {
        $started = self::state($conn, 'backup_started');
        if ($started === '' || time() - (int) strtotime($started) < 600) {
            return;
        }
        self::setState($conn, 'backup_started', '');
        $message = 'Kopia zaczęta ' . substr($started, 0, 16) . ' nie skończyła się (np. zabrakło pamięci albo czasu).';
        self::setState($conn, 'backup_last_error', date('Y-m-d H:i') . ' ' . $message);
        self::alertAdmins($conn, $message);
    }

    /** Days since the last backup that worked, or null when there was none yet. */
    public static function daysSinceLastOk(PDO $conn)
    {
        $last = strtotime(self::state($conn, 'backup_last_ok'));
        return $last ? max(0, (int) floor((time() - $last) / 86400)) : null;
    }

    public static function lastOk(PDO $conn)
    {
        return self::state($conn, 'backup_last_ok') ?: null;
    }

    /** @return array ['ok' => bool, 'files' => [...], 'remote' => bool, 'error' => ?string] */
    public static function run(PDO $conn, $withFiles = false)
    {
        @set_time_limit(600);
        $report = ['ok' => true, 'files' => [], 'remote' => false, 'error' => null];
        try {
            self::prepareDir();
            $made = [self::dumpDatabase($conn)];
            if ($withFiles) {
                $zip = self::archiveUploads();
                if ($zip) {
                    $made[] = $zip;
                }
            }
            $report['files'] = array_map('basename', $made);
            if (self::remoteConfigured()) {
                foreach ($made as $path) {
                    self::uploadRemote($path);
                }
                $report['remote'] = true;
            }
            self::rotate();
            self::setState($conn, 'backup_last_ok', date('Y-m-d H:i:s'));
            self::setState($conn, 'backup_last_error', '');
        } catch (Throwable $e) {
            $report['ok'] = false;
            $report['error'] = $e->getMessage();
            self::setState($conn, 'backup_last_error', date('Y-m-d H:i') . ' ' . mb_substr($e->getMessage(), 0, 400));
            self::alertAdmins($conn, $e->getMessage());
        }
        return $report;
    }

    /** For Ustawienia -> Kopie zapasowe. */
    public static function status(PDO $conn)
    {
        $files = [];
        foreach (glob(self::dir() . '/{db,files}-*', GLOB_BRACE) ?: [] as $path) {
            if (!preg_match(self::NAME_PATTERN, basename($path))) {
                continue; // unfinished pieces (.part, .enc)
            }
            $files[] = ['name' => basename($path), 'size' => filesize($path), 'date' => date('Y-m-d H:i', filemtime($path))];
        }
        // newest first: by the day in the name, then by the time written
        usort($files, function ($a, $b) {
            return strcmp(substr($b['name'], strpos($b['name'], '-') + 1, 10) . $b['date'], substr($a['name'], strpos($a['name'], '-') + 1, 10) . $a['date']);
        });
        return [
            'last_ok' => self::state($conn, 'backup_last_ok') ?: null,
            'last_error' => self::state($conn, 'backup_last_error') ?: null,
            'remote' => self::remoteConfigured(),
            'encrypted' => trim($_ENV['BACKUP_PASSWORD'] ?? '') !== '',
            'files' => $files,
        ];
    }

    /* ------------------------------------------------------------- dump */

    /** Random part of a file name - backups cannot be found by guessing the date. */
    private static function suffix()
    {
        return bin2hex(random_bytes(8));
    }

    /**
     * A second connection that streams rows instead of loading whole tables into memory,
     * with one consistent view of the data for the whole dump.
     */
    private static function dumpConnection()
    {
        $pdo = new PDO(
            "mysql:host={$_ENV['DB_HOST']};dbname={$_ENV['DB_NAME']};charset=utf8mb4",
            $_ENV['DB_USER'],
            $_ENV['DB_PASS'],
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => false,
                PDO::ATTR_STRINGIFY_FETCHES => true,
            ]
        );
        // the same clock as the main connection (TIMESTAMP columns are written in session time)
        $pdo->exec("SET time_zone = '" . date('P') . "'");
        $pdo->exec("START TRANSACTION WITH CONSISTENT SNAPSHOT");
        return $pdo;
    }

    /** Copy of the database as it is right now, kept until removed by hand (before a restore). */
    public static function safetyDump(PDO $conn)
    {
        self::prepareDir();
        return self::dumpDatabase($conn, 'before-restore-' . date('Y-m-d-His'));
    }

    private static function dumpDatabase(PDO $conn, $name = null)
    {
        $path = self::dir() . '/' . ($name ?: 'db-' . date('Y-m-d')) . '-' . self::suffix() . '.sql.gz';
        // table list and CREATE statements: small, read through the main connection
        $tables = $conn->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_NUM);
        $read = self::dumpConnection();
        $gz = gzopen($path . '.part', 'wb6');
        if (!$gz) {
            throw new RuntimeException('Nie mogę zapisać kopii w api/backups');
        }
        try {
            self::write($gz, "-- Gonia backup " . date('Y-m-d H:i:s') . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n");
            foreach ($tables as $t) {
                $table = $t[0];
                $create = $conn->query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM)[1];
                self::write($gz, "DROP TABLE IF EXISTS `$table`;\n$create;\n");
                // rows are written one by one; a statement is closed after about 1 MB
                $rows = $read->query("SELECT * FROM `$table`");
                $bytes = 0;
                while ($row = $rows->fetch(PDO::FETCH_ASSOC)) {
                    $line = '(' . implode(', ', array_map(function ($v) use ($conn) {
                        return $v === null ? 'NULL' : $conn->quote((string) $v);
                    }, $row)) . ')';
                    if ($bytes === 0) {
                        self::write($gz, "INSERT INTO `$table` (`" . implode('`, `', array_keys($row)) . "`) VALUES\n" . $line);
                    } else {
                        self::write($gz, ",\n" . $line);
                    }
                    $bytes += strlen($line);
                    if ($bytes >= self::INSERT_BYTES) {
                        self::write($gz, ";\n");
                        $bytes = 0;
                    }
                }
                $rows->closeCursor();
                if ($bytes > 0) {
                    self::write($gz, ";\n");
                }
                self::write($gz, "\n");
            }
            self::write($gz, "SET FOREIGN_KEY_CHECKS = 1;\n");
        } catch (Throwable $e) {
            gzclose($gz);
            @unlink($path . '.part');
            throw $e;
        }
        if (!gzclose($gz) || !rename($path . '.part', $path)) {
            @unlink($path . '.part');
            throw new RuntimeException('Nie mogę zapisać kopii w api/backups');
        }
        return $path;
    }

    /** gzwrite that notices a full disk. */
    private static function write($gz, $text)
    {
        if (gzwrite($gz, $text) !== strlen($text)) {
            throw new RuntimeException('Nie mogę zapisać kopii w api/backups (brak miejsca?)');
        }
    }

    private static function archiveUploads()
    {
        $source = realpath(__DIR__ . '/../uploads');
        if (!$source || !class_exists('ZipArchive')) {
            return null;
        }
        $path = self::dir() . '/files-' . date('Y-m-d') . '-' . self::suffix() . '.zip';
        $zip = new ZipArchive();
        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Nie mogę utworzyć archiwum plików');
        }
        $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS));
        foreach ($files as $file) {
            if ($file->isFile() && $file->getFilename() !== '.htaccess') {
                $name = substr($file->getPathname(), strlen($source) + 1);
                // shared reels (gigabytes, copies of what is on the phone) stay out of the backup
                if (strpos(str_replace('\\', '/', $name), 'share/') === 0) {
                    continue;
                }
                $zip->addFile($file->getPathname(), $name);
                // already compressed (PDF, JPG) - just store, much faster
                $zip->setCompressionName($name, ZipArchive::CM_STORE);
            }
        }
        $zip->close();
        return $path;
    }

    /** Keep the newest copy of each day, for the last KEEP_DB / KEEP_FILES days; drop leftovers of broken runs. */
    private static function rotate()
    {
        foreach (['db' => self::KEEP_DB, 'files' => self::KEEP_FILES] as $kind => $keep) {
            $byDay = [];
            foreach (glob(self::dir() . "/$kind-*") ?: [] as $path) {
                if (!preg_match(self::NAME_PATTERN, basename($path), $m)) {
                    // .part / .enc / zip temp file of a run that died - not one that is being written now
                    if (time() - (int) @filemtime($path) > 86400) {
                        @unlink($path);
                    }
                    continue;
                }
                $byDay[$m[2]][] = $path;
            }
            krsort($byDay);
            $day = 0;
            foreach ($byDay as $paths) {
                usort($paths, function ($a, $b) {
                    return filemtime($b) <=> filemtime($a);
                });
                // older copies of the same day, and whole days past the limit
                foreach ($day < $keep ? array_slice($paths, 1) : $paths as $old) {
                    @unlink($old);
                }
                $day++;
            }
        }
    }

    private static function prepareDir()
    {
        $dir = self::dir();
        if (!is_dir($dir) && !@mkdir($dir, 0750, true)) {
            throw new RuntimeException('Nie mogę utworzyć katalogu api/backups');
        }
        if (!is_file($dir . '/.htaccess')) {
            file_put_contents($dir . '/.htaccess', "# Backups are never served over HTTP\n<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n");
        }
    }

    /* ----------------------------------------------------------- encrypt */

    /** AES-256-GCM in 8 MB pieces: MAGIC, salt(16), then [len(4) iv(12) tag(16) data]... */
    public static function encryptFile($source, $target, $password)
    {
        $salt = random_bytes(16);
        $key = hash_pbkdf2('sha256', $password, $salt, 200000, 32, true);
        $in = fopen($source, 'rb');
        $out = fopen($target, 'wb');
        fwrite($out, self::MAGIC . $salt);
        $index = 0;
        while (!feof($in)) {
            $plain = fread($in, self::CHUNK);
            if ($plain === '' || $plain === false) {
                break;
            }
            $iv = random_bytes(12);
            $tag = '';
            $cipher = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, pack('N', $index++));
            fwrite($out, pack('N', strlen($cipher)) . $iv . $tag . $cipher);
        }
        fclose($in);
        fclose($out);
    }

    public static function decryptFile($source, $target, $password)
    {
        $in = fopen($source, 'rb');
        if (fread($in, strlen(self::MAGIC)) !== self::MAGIC) {
            throw new RuntimeException('To nie jest zaszyfrowana kopia Goni');
        }
        $key = hash_pbkdf2('sha256', $password, fread($in, 16), 200000, 32, true);
        $out = fopen($target, 'wb');
        $index = 0;
        while (($head = fread($in, 4)) !== false && strlen($head) === 4) {
            $len = unpack('N', $head)[1];
            $iv = fread($in, 12);
            $tag = fread($in, 16);
            $plain = openssl_decrypt(fread($in, $len), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, pack('N', $index++));
            if ($plain === false) {
                throw new RuntimeException('Złe hasło albo uszkodzony plik');
            }
            fwrite($out, $plain);
        }
        fclose($in);
        fclose($out);
    }

    /* -------------------------------------------------------------- S3 */

    private static function remoteConfigured()
    {
        foreach (['BACKUP_S3_ENDPOINT', 'BACKUP_S3_BUCKET', 'BACKUP_S3_KEY', 'BACKUP_S3_SECRET'] as $name) {
            if (trim($_ENV[$name] ?? '') === '') {
                return false;
            }
        }
        return true;
    }

    private static function uploadRemote($path)
    {
        $password = trim($_ENV['BACKUP_PASSWORD'] ?? '');
        $file = $path;
        $name = basename($path);
        if ($password !== '') {
            $file = $path . '.enc';
            self::encryptFile($path, $file, $password);
            $name .= '.enc';
        }
        try {
            self::s3Put($file, trim($_ENV['BACKUP_S3_PREFIX'] ?? 'gonia', '/') . '/' . $name);
        } finally {
            if ($file !== $path) {
                @unlink($file);
            }
        }
    }

    /** PUT one object with AWS Signature V4 (path-style URL, works with B2 / R2 / AWS / MinIO). */
    public static function s3Put($file, $key)
    {
        $endpoint = rtrim(trim($_ENV['BACKUP_S3_ENDPOINT']), '/');
        $bucket = trim($_ENV['BACKUP_S3_BUCKET']);
        $region = trim($_ENV['BACKUP_S3_REGION'] ?? '') ?: 'us-east-1';
        $access = trim($_ENV['BACKUP_S3_KEY']);
        $secret = trim($_ENV['BACKUP_S3_SECRET']);

        $host = parse_url($endpoint, PHP_URL_HOST) . (parse_url($endpoint, PHP_URL_PORT) ? ':' . parse_url($endpoint, PHP_URL_PORT) : '');
        $uri = '/' . rawurlencode($bucket) . '/' . implode('/', array_map('rawurlencode', explode('/', $key)));
        $payloadHash = hash_file('sha256', $file);
        $amzDate = gmdate('Ymd\THis\Z');
        $day = gmdate('Ymd');
        $scope = "$day/$region/s3/aws4_request";
        $canonical = "PUT\n$uri\n\nhost:$host\nx-amz-content-sha256:$payloadHash\nx-amz-date:$amzDate\n\nhost;x-amz-content-sha256;x-amz-date\n$payloadHash";
        $toSign = "AWS4-HMAC-SHA256\n$amzDate\n$scope\n" . hash('sha256', $canonical);
        $signingKey = hash_hmac('sha256', 'aws4_request', hash_hmac('sha256', 's3', hash_hmac('sha256', $region, hash_hmac('sha256', $day, 'AWS4' . $secret, true), true), true), true);
        $signature = hash_hmac('sha256', $toSign, $signingKey);

        $fh = fopen($file, 'rb');
        $ch = curl_init($endpoint . $uri);
        curl_setopt_array($ch, [
            CURLOPT_PUT => true,
            CURLOPT_INFILE => $fh,
            CURLOPT_INFILESIZE => filesize($file),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 300,
            CURLOPT_HTTPHEADER => [
                'x-amz-content-sha256: ' . $payloadHash,
                'x-amz-date: ' . $amzDate,
                "Authorization: AWS4-HMAC-SHA256 Credential=$access/$scope, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=$signature",
            ],
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        fclose($fh);
        if ($status < 200 || $status >= 300) {
            $detail = preg_match('/<Message>([^<]+)/', (string) $body, $m) ? $m[1] : ($error ?: 'HTTP ' . $status);
            throw new RuntimeException('Wysyłka kopii poza serwer nie wyszła: ' . $detail);
        }
    }

    /* ----------------------------------------------------------- state */

    private static function state(PDO $conn, $name)
    {
        Schema::ensure($conn, 'server_settings');
        $stmt = $conn->prepare("SELECT value FROM server_settings WHERE name = :name");
        $stmt->execute(['name' => $name]);
        return (string) $stmt->fetchColumn();
    }

    private static function setState(PDO $conn, $name, $value)
    {
        Schema::ensure($conn, 'server_settings');
        $conn->prepare("INSERT INTO server_settings (name, value) VALUES (:name, :value) ON DUPLICATE KEY UPDATE value = VALUES(value)")
            ->execute(['name' => $name, 'value' => (string) $value]);
    }

    private static function alertAdmins(PDO $conn, $message)
    {
        try {
            require_once __DIR__ . '/../config/WebPush.php';
            if (!WebPush::isConfigured()) {
                return;
            }
            $push = new WebPush();
            foreach ($conn->query("SELECT id FROM users WHERE is_admin = 1 AND is_active = 1")->fetchAll(PDO::FETCH_COLUMN) as $adminId) {
                $push->sendToUser($conn, (int) $adminId, [
                    'title' => 'Kopia zapasowa nie wyszła',
                    'body' => mb_substr($message, 0, 120) . ' — szczegóły w Ustawieniach → Kopie zapasowe.',
                    'url' => '/dashboard',
                    'tag' => 'backup',
                ]);
            }
        } catch (Exception $e) {
            // the error is in server_settings anyway
        }
    }
}
