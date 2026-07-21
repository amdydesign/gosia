<?php
// Indeksy na kolumnach filtrowanych w export.php i dashboard.php
return function (PDO $conn) {
    foreach (['idx_collab_type' => 'collab_type', 'idx_fiscal_tracking' => 'fiscal_tracking'] as $idx => $col) {
        $check = $conn->query("SHOW INDEX FROM collaborations WHERE Key_name = '$idx'");
        if ($check->rowCount() === 0) {
            $conn->exec("ALTER TABLE collaborations ADD INDEX $idx ($col)");
            echo "    dodano indeks $idx\n";
        } else {
            echo "    indeks $idx już istnieje\n";
        }
    }
};
