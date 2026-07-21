<?php
/**
 * Runner migracji. Uruchamianie (tylko CLI):
 *   php api/migrations/run.php
 *
 * Konwencja: pliki NNN_nazwa.php w tym katalogu, każdy zwraca closure:
 *   <?php return function (PDO $conn) { ... };
 * Wykonane migracje są zapisywane w tabeli `migrations` i pomijane
 * przy kolejnych uruchomieniach.
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

require_once __DIR__ . '/../config/Database.php';

$conn = Database::getInstance()->getConnection();

$conn->exec("
    CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

$executed = $conn->query("SELECT name FROM migrations")->fetchAll(PDO::FETCH_COLUMN);

$files = glob(__DIR__ . '/[0-9][0-9][0-9]_*.php');
sort($files);

$ran = 0;
foreach ($files as $file) {
    $name = basename($file, '.php');
    if (in_array($name, $executed, true)) {
        continue;
    }

    echo "==> $name\n";
    $migration = require $file;
    if (!is_callable($migration)) {
        fwrite(STDERR, "BŁĄD: $name nie zwraca funkcji — pomijam.\n");
        exit(1);
    }

    try {
        $migration($conn);
    } catch (Exception $e) {
        fwrite(STDERR, "BŁĄD w $name: " . $e->getMessage() . "\n");
        fwrite(STDERR, "Migracja NIE została zapisana jako wykonana. Napraw problem i uruchom ponownie.\n");
        exit(1);
    }

    $stmt = $conn->prepare("INSERT INTO migrations (name) VALUES (:name)");
    $stmt->execute(['name' => $name]);
    $ran++;
}

echo $ran > 0 ? "Wykonano migracji: $ran\n" : "Baza aktualna — brak nowych migracji.\n";
