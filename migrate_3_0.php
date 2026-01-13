<?php
require_once 'api/config/Database.php';

try {
    $db = Database::getInstance()->getConnection();

    echo "Starting migration to Gosia 3.0...\n";

    // 1. Rename 'returns' to 'purchases'
    // Check if purchases already exists to avoid error
    $checkTable = $db->query("SHOW TABLES LIKE 'purchases'");
    if ($checkTable->rowCount() == 0) {
        $checkReturns = $db->query("SHOW TABLES LIKE 'returns'");
        if ($checkReturns->rowCount() > 0) {
            $db->exec("RENAME TABLE `returns` TO `purchases`");
            echo "✅ Renamed table 'returns' to 'purchases'\n";
        } else {
            // Create purchases table if returns didn't exist
            $db->exec("CREATE TABLE IF NOT EXISTS purchases (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                store VARCHAR(100) NOT NULL,
                items VARCHAR(255) NOT NULL,
                purchase_date DATE NOT NULL,
                return_days INT NOT NULL DEFAULT 14,
                amount DECIMAL(10, 2) DEFAULT 0.00,
                purchase_url VARCHAR(255),
                returned_amount DECIMAL(10, 2) DEFAULT 0.00,
                notes TEXT,
                status ENUM('kept', 'returned', 'partial') DEFAULT 'kept',
                returned_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
            echo "✅ Created new table 'purchases'\n";
        }
    } else {
        echo "ℹ️ Table 'purchases' already exists\n";
    }

    // 2. Add new columns to 'purchases' (if they don't exist)
    try {
        $db->exec("ALTER TABLE purchases ADD COLUMN purchase_url VARCHAR(255) AFTER amount");
        echo "✅ Added 'purchase_url' to purchases\n";
    } catch (PDOException $e) { /* Ignore if exists */
    }

    try {
        $db->exec("ALTER TABLE purchases ADD COLUMN returned_amount DECIMAL(10, 2) DEFAULT 0.00 AFTER purchase_url");
        echo "✅ Added 'returned_amount' to purchases\n";
    } catch (PDOException $e) { /* Ignore if exists */
    }

    // Update status enum
    try {
        $db->exec("ALTER TABLE purchases MODIFY COLUMN status ENUM('kept', 'returned', 'partial', 'pending') DEFAULT 'kept'");
        // Convert old 'pending' to 'kept' and 'returned' stays 'returned'
        $db->exec("UPDATE purchases SET status = 'kept' WHERE status = 'pending'");
        echo "✅ Updated 'status' enum in purchases\n";
    } catch (PDOException $e) {
        echo "⚠️ Status enum update warning: " . $e->getMessage() . "\n";
    }


    // 3. Update 'collaborations' table (Net/Gross)
    try {
        // First rename amount to amount_net if not already done
        // We actually want adding amount_net and amount_gross. 
        // Let's assume 'amount' is 'amount_net' for now but we'll add explicit columns

        // Add amount_net if not exists, copy values from amount, then maybe drop amount?
        // Let's keep it simple: Add amount_gross, rename amount -> amount_net

        $db->exec("ALTER TABLE collaborations CHANGE COLUMN amount amount_net DECIMAL(10, 2) NOT NULL DEFAULT 0.00");
        echo "✅ Renamed 'amount' to 'amount_net' in collaborations\n";
    } catch (PDOException $e) {
        // Maybe it's already renamed?
        echo "ℹ️ 'amount' might already be renamed to 'amount_net'\n";
    }

    try {
        $db->exec("ALTER TABLE collaborations ADD COLUMN amount_gross DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER amount_net");
        // Initialize gross same as net for now (or * 1.23?) - let's keep same
        $db->exec("UPDATE collaborations SET amount_gross = amount_net WHERE amount_gross = 0");
        echo "✅ Added 'amount_gross' to collaborations\n";
    } catch (PDOException $e) { /* Ignore */
    }


    // 4. Create 'collaboration_team' table
    $db->exec("CREATE TABLE IF NOT EXISTS collaboration_team (
        id INT AUTO_INCREMENT PRIMARY KEY,
        collaboration_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(100) DEFAULT 'Wsparcie',
        amount DECIMAL(10, 2) DEFAULT 0.00,
        FOREIGN KEY (collaboration_id) REFERENCES collaborations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    echo "✅ Created 'collaboration_team' table\n";


    echo "\n🎉 Migration completed successfully!\n";

} catch (PDOException $e) {
    die("❌ Migration failed: " . $e->getMessage() . "\n");
}
