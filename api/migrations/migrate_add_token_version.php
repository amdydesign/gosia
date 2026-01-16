<?php
require_once __DIR__ . '/../config/Database.php';

try {
    $db = new Database();
    $conn = $db->getConnection();

    // Check if column exists
    $stmt = $conn->prepare("SHOW COLUMNS FROM users LIKE 'token_version'");
    $stmt->execute();

    if (!$stmt->fetch()) {
        echo "Adding token_version column to users table...\n";
        $sql = "ALTER TABLE users ADD COLUMN token_version INT DEFAULT 1";
        $conn->exec($sql);
        echo "Column token_version added successfully.\n";
    } else {
        echo "Column token_version already exists.\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
