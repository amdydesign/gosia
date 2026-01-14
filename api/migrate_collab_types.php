<?php
/**
 * Migration: Update collaborations table for new billing types
 * Adds: collab_type ENUM and fiscal_tracking BOOLEAN
 */

require_once __DIR__ . '/config/Database.php';

try {
    $db = new Database();
    $conn = $db->getConnection();

    echo "Starting migration: collaboration types...\n";

    // Step 1: Add new column collab_type if doesn't exist
    $conn->exec("
        ALTER TABLE collaborations 
        ADD COLUMN IF NOT EXISTS collab_type ENUM('umowa_50','umowa_20','useme_50','useme_20','gotowka') 
        DEFAULT 'umowa_50'
    ");
    echo "✓ Added collab_type column\n";

    // Step 2: Add fiscal_tracking column
    $conn->exec("
        ALTER TABLE collaborations 
        ADD COLUMN IF NOT EXISTS fiscal_tracking BOOLEAN DEFAULT TRUE
    ");
    echo "✓ Added fiscal_tracking column\n";

    // Step 3: Migrate existing data based on 'type' field
    // Assuming existing 'type' has values like 'post-instagram', 'story', etc
    // We'll set all existing to 'umowa_50' and fiscal_tracking=TRUE
    $conn->exec("
        UPDATE collaborations 
        SET collab_type = 'umowa_50', 
            fiscal_tracking = TRUE 
        WHERE collab_type IS NULL
    ");
    echo "✓ Migrated existing collaborations to umowa_50\n";

    echo "\n✅ Migration completed successfully!\n";
    echo "New collaboration types available:\n";
    echo "  - umowa_50: Umowa o Dzieło (50% KUP)\n";
    echo "  - umowa_20: Umowa o Dzieło (20% KUP)\n";
    echo "  - useme_50: Use.me (50% KUP)\n";
    echo "  - useme_20: Use.me (20% KUP)\n";
    echo "  - gotowka: Gotówka prywatna\n";

} catch (Exception $e) {
    echo "❌ Migration error: " . $e->getMessage() . "\n";
    exit(1);
}
