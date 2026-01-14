<?php
require_once __DIR__ . '/../config/Database.php';

try {
    $db = new Database();
    $conn = $db->getConnection();

    echo "Migrating collab_types...\n";

    // 1. Add `collab_type` column if it doesn't exist
    // We check via a show columns command or just try catch alter
    try {
        $check = $conn->query("SHOW COLUMNS FROM collaborations LIKE 'collab_type'");
        if ($check->rowCount() == 0) {
            $conn->exec("ALTER TABLE collaborations ADD COLUMN collab_type VARCHAR(50) DEFAULT 'other'");
            echo "Added 'collab_type' column.\n";
        } else {
            echo "'collab_type' column already exists.\n";
        }
    } catch (PDOException $e) {
        // If error, maybe table doesn't exist? But assuming it does.
        echo "Error checking column: " . $e->getMessage() . "\n";
    }

    // 2. Migrate data from `type` (old enum/varchar) to `collab_type`
    // Mapping: 
    // 'barter' -> 'barter'
    // 'paid' -> 'invoice' (default) or guessing??
    // Actually, based on previous logic, we seem to be introducing NEW types.
    // If old data is just 'barter'/'paid', we might map 'paid' -> 'umowa_50' as a safe default or 'invoice'?
    // Let's assume 'umowa_50' as it's the most common for this user, OR 'invoice'.
    // Let's just copy `type` to `collab_type` first if they align, or set defaults.

    // FETCH all to migrate in PHP to be safe with logic
    $stm = $conn->query("SELECT id, type, collab_type FROM collaborations");
    $rows = $stm->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as $row) {
        $newType = $row['collab_type'];

        // Only migrate if collab_type is 'other' or empty (default)
        if ($newType === 'other' || empty($newType)) {
            if ($row['type'] === 'barter') {
                $newType = 'barter';
            } elseif ($row['type'] === 'paid') {
                // Defaulting old 'paid' to 'umowa_50' (Standard)
                $newType = 'umowa_50';
            } else {
                $newType = $row['type']; // Copy whatever was there
            }

            $upd = $conn->prepare("UPDATE collaborations SET collab_type = :ct WHERE id = :id");
            $upd->execute(['ct' => $newType, 'id' => $row['id']]);
        }
    }
    echo "Data migration complete.\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
