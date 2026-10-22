<?php
/**
 * Add missing columns of the document archive right now - CLI only (run over SSH on the server).
 *
 *   php api/utils/repair_schema.php
 *
 * Endpoints do this on their own; use it when the server still runs a cached
 * copy of an older file and reports "Unknown column".
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../documents/helpers.php';

try {
    $db = new Database();
    $conn = $db->getConnection();

    documentsEnsureSchema($conn);

    $columns = array_column($conn->query("SHOW COLUMNS FROM documents")->fetchAll(PDO::FETCH_ASSOC), 'Field');
    echo "OK. Kolumny documents: " . implode(', ', $columns) . "\n";
} catch (Exception $e) {
    fwrite(STDERR, "Błąd: " . $e->getMessage() . "\n");
    exit(1);
}
