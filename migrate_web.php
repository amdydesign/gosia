<?php
// migrate_web.php
// Temporary script to run migration via browser

require_once __DIR__ . '/api/config/Database.php';

header('Content-Type: text/plain');

try {
    echo "Connecting to database...\n";
    $db = new Database();
    $conn = $db->getConnection();

    echo "Checking 'users' table...\n";
    $stmt = $conn->prepare("SHOW COLUMNS FROM users LIKE 'token_version'");
    $stmt->execute();

    if (!$stmt->fetch()) {
        echo "Column 'token_version' not found. Adding it...\n";
        $sql = "ALTER TABLE users ADD COLUMN token_version INT DEFAULT 1";
        $conn->exec($sql);
        echo "SUCCESS: Column 'token_version' added.\n";
    } else {
        echo "INFO: Column 'token_version' already exists.\n";
    }

    echo "Migration completed.\n";
    echo "Please delete this file from the server or repository after use.";

} catch (Exception $e) {
    http_response_code(500);
    echo "ERROR: " . $e->getMessage() . "\n";
    echo "Trace:\n" . $e->getTraceAsString();
}
