<?php
/**
 * Migration: Add returned_at column to purchases table
 */

require_once __DIR__ . '/config/Database.php';

try {
    $db = new Database();
    $conn = $db->getConnection();

    // Add returned_at column if it doesn't exist
    $conn->exec("
        ALTER TABLE purchases 
        ADD COLUMN IF NOT EXISTS returned_at TIMESTAMP NULL DEFAULT NULL
    ");

    echo "Migration completed: added returned_at column to purchases table\n";

} catch (Exception $e) {
    echo "Migration error: " . $e->getMessage() . "\n";
}
