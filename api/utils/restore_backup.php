<?php
/**
 * Restore a backup - CLI only (over SSH on the server).
 *
 *   php api/utils/restore_backup.php api/backups/db-2026-10-26-0f3a9c1b2d4e5f60.sql.gz
 *   php api/utils/restore_backup.php db-2026-10-26-....sql.gz.enc   (from off-site storage, asks for BACKUP_PASSWORD)
 *   php api/utils/restore_backup.php files-2026-10-25-....zip(.enc) (unpacks into api/uploads)
 * (older copies without the random part in the name work the same)
 *
 * The database restore REPLACES all tables with the copy. Before it touches anything it saves
 * the current database to api/backups/before-restore-<date>-<random>.sql.gz and prints the path;
 * if that copy cannot be made, nothing is changed. Remove those files by hand when no longer needed.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/Backup.php';
require_once __DIR__ . '/../config/Users.php';
require_once __DIR__ . '/../documents/helpers.php';

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
        // the decrypted copy is only needed for this run
        register_shutdown_function(function () use ($work) {
            @unlink($work);
        });
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
    if (!$gz) {
        throw new RuntimeException('Nie mogę otworzyć kopii');
    }

    // Safety copy of what is in the database now - made before the first table is dropped
    try {
        $safety = Backup::safetyDump($conn);
    } catch (Throwable $e) {
        gzclose($gz);
        fwrite(STDERR, 'Nie udało się zapisać kopii obecnej bazy, nic nie zmieniam: ' . $e->getMessage() . "\n");
        exit(1);
    }
    echo "Obecna baza zapisana w: " . (realpath($safety) ?: $safety) . "\n";

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
    if (trim($statement) !== '') {
        throw new RuntimeException('Kopia jest ucięta (ostatnie polecenie bez końca). Obecna baza sprzed przywracania: ' . $safety);
    }
    echo "Gotowe: $count poleceń.\n";

    // an older copy may lack newer tables / columns - add them now, not on the next request
    try {
        Schema::forget();
        Users::ensure($conn);
        Schema::ensureAll($conn);
        documentsEnsureSchema($conn);
    } catch (Exception $e) {
        echo "Uwaga: uruchom jeszcze php api/utils/repair_schema.php (" . $e->getMessage() . ")\n";
    }
} catch (Exception $e) {
    fwrite(STDERR, 'Błąd: ' . $e->getMessage() . "\n");
    if (!empty($safety)) {
        fwrite(STDERR, 'Baza może być przywrócona tylko częściowo. Stan sprzed przywracania: ' . $safety . "\n");
    }
    exit(1);
}
