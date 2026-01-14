<?php
require_once __DIR__ . '/../config/Database.php';

try {
    $db = new Database();
    $conn = $db->getConnection();

    echo "Checking collaboration_team schema...\n";

    // Check if column exists
    $stmt = $conn->prepare("SHOW COLUMNS FROM collaboration_team LIKE 'is_paid'");
    $stmt->execute();

    if ($stmt->rowCount() == 0) {
        echo "Adding is_paid column...\n";
        $sql = "ALTER TABLE collaboration_team ADD COLUMN is_paid BOOLEAN DEFAULT FALSE";
        $conn->exec($sql);
        echo "Column added successfully.\n";
    } else {
        echo "Column is_paid already exists.\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
