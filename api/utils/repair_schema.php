<?php
/**
 * Create every missing table and column right now - CLI only (run over SSH on the server).
 *
 *   php api/utils/repair_schema.php
 *
 * Endpoints do this on their own; use it when the server still runs a cached
 * copy of an older file and reports "Unknown column" or "Table ... doesn't exist".
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/Users.php';
require_once __DIR__ . '/../config/RateLimit.php';
require_once __DIR__ . '/../documents/helpers.php';

try {
    $db = new Database();
    $conn = $db->getConnection();

    Users::ensure($conn);
    RateLimit::ensureTable($conn);
    $checked = Schema::ensureAll($conn);
    documentsEnsureSchema($conn);

    $tables = $conn->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    echo "OK. Sprawdzone: " . count($checked) . " tabel i kolumn.\n";
    echo "Tabele: " . implode(', ', $tables) . "\n";
} catch (Exception $e) {
    fwrite(STDERR, "Błąd: " . $e->getMessage() . "\n");
    exit(1);
}
