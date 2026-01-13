<?php
require_once 'api/config/Database.php';

try {
    $db = Database::getInstance()->getConnection();

    echo "--- Purchases Table ---\n";
    $stmt = $db->query("DESCRIBE purchases");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($columns as $col) {
        echo $col['Field'] . " (" . $col['Type'] . ")\n";
    }

    echo "\n--- Collaborations Table ---\n";
    $stmt = $db->query("DESCRIBE collaborations");
    $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($columns as $col) {
        echo $col['Field'] . " (" . $col['Type'] . ")\n";
    }

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
