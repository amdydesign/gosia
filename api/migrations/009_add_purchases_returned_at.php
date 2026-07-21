<?php
// purchases.returned_at — używane przez purchases/update.php, brakowało w schemacie
return function (PDO $conn) {
    $check = $conn->query("SHOW COLUMNS FROM purchases LIKE 'returned_at'");
    if ($check->rowCount() === 0) {
        $conn->exec("ALTER TABLE purchases ADD COLUMN returned_at TIMESTAMP NULL AFTER status");
        echo "    dodano kolumnę purchases.returned_at\n";
    } else {
        echo "    purchases.returned_at już istnieje\n";
    }
};
