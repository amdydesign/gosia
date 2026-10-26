<?php
/**
 * Restore a backup - CLI only (over SSH on the server).
 *
 *   php api/utils/restore_backup.php api/backups/db-2026-10-26.sql.gz
 *   php api/utils/restore_backup.php db-2026-10-26.sql.gz.enc   (from off-site storage, asks for BACKUP_PASSWORD)
 *   php api/utils/restore_backup.php files-2026-10-25.zip(.enc) (unpacks into api/uploads)
 *
 * The database restore REPLACES all tables with the copy. Make a fresh backup first
 * (php api/cron/backup.php) if the current data may still be needed.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/Backup.php';

$file = $argv[1] ?? '';
if ($file === '' || !is_file($file)) {
    fwrite(STDERR, "Użycie: php api/utils/restore_backup.php <plik kopii>\n");
    exit(1);
}

try {
    $db = new Database();
    $conn = $db->getConnection();

    $work = $file;
    if (substr($file, -4) === '.enc') {
        $password = trim($_ENV['BACKUP_PASSWORD'] ?? '');
        if ($password === '') {
            echo 'Hasło kopii (BACKUP_PASSWORD): ';
            $password = trim((string) fgets(STDIN));
        }
        $work = sys_get_temp_dir() . '/' . basename(substr($file, 0, -4));
        Backup::decryptFile($file, $work, $password);
    }

    if (substr($work, -4) === '.zip') {
        $zip = new ZipArchive();
        if ($zip->open($work) !== true) {
            throw new RuntimeException('Nie mogę otworzyć archiwum');
        }
        $zip->extractTo(__DIR__ . '/../uploads');
        $zip->close();
        echo "Pliki rozpakowane do api/uploads.\n";
        exit(0);
    }

    echo "To zastąpi CAŁĄ bazę danymi z kopii. Wpisz TAK, żeby kontynuować: ";
    if (trim((string) fgets(STDIN)) !== 'TAK') {
        echo "Przerwane.\n";
        exit(1);
    }
    $gz = gzopen($work, 'rb');
    $statement = '';
    $count = 0;
    while (($line = gzgets($gz)) !== false) {
        if ($statement === '' && (trim($line) === '' || strpos($line, '--') === 0)) {
            continue;
        }
        $statement .= $line;
        // statements end with ";" at the end of a line (values never end a line with ";\n" - newlines are escaped by quote())
        if (substr(rtrim($line), -1) === ';') {
            $conn->exec($statement);
            $statement = '';
            $count++;
        }
    }
    gzclose($gz);
    echo "Gotowe: $count poleceń.\n";
} catch (Exception $e) {
    fwrite(STDERR, 'Błąd: ' . $e->getMessage() . "\n");
    exit(1);
}
