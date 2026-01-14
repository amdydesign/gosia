<?php
require_once __DIR__ . '/../config/Database.php';

try {
    $db = new Database();
    $conn = $db->getConnection();

    echo "Fixing fiscal_tracking logic...\n";

    // 1. Set fiscal_tracking = 0 for 'gotowka'
    $sql1 = "UPDATE collaborations SET fiscal_tracking = 0 WHERE collab_type = 'gotowka'";
    $conn->exec($sql1);
    echo "Marked 'gotowka' as private.\n";

    // 2. Set fiscal_tracking = 1 for EVERYTHING ELSE (useme, umowa, invoice, etc.)
    $sql2 = "UPDATE collaborations SET fiscal_tracking = 1 WHERE collab_type != 'gotowka'";
    $conn->exec($sql2);
    echo "Marked non-gotowka as official (PIT).\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
