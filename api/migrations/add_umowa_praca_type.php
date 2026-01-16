<?php
/**
 * Migration: Add 'umowa-praca' to collaborations.type ENUM
 */

require_once __DIR__ . '/../config/Database.php';

try {
    $db = new Database();
    $conn = $db->getConnection();

    // Modify the type column to include 'umowa-praca'
    $sql = "ALTER TABLE collaborations MODIFY COLUMN type ENUM('post-instagram', 'story', 'reel', 'sesja', 'konsultacja', 'event', 'umowa-praca', 'inne') NOT NULL DEFAULT 'inne'";

    $conn->exec($sql);

    echo json_encode(['success' => true, 'message' => 'Added umowa-praca to type ENUM']);

} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
