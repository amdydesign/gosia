<?php
require_once __DIR__ . '/../config/Database.php';

try {
    $db = new Database();
    $conn = $db->getConnection();

    echo "Checking for 'fiscal_tracking' column...\n";

    // Check if column exists
    $check = $conn->query("SHOW COLUMNS FROM collaborations LIKE 'fiscal_tracking'");

    if ($check->rowCount() == 0) {
        // Add column if missing
        // Default to TRUE (1) because most are official? Or FALSE?
        // Let's default to TRUE (1) as 'standard' work is PIT, and 'gotowka' is exception.
        $conn->exec("ALTER TABLE collaborations ADD COLUMN fiscal_tracking BOOLEAN DEFAULT TRUE");
        echo "Added 'fiscal_tracking' column.\n";
    } else {
        echo "'fiscal_tracking' column already exists.\n";
    }

    echo "Migration complete.\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
