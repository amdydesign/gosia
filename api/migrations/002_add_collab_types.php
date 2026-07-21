<?php
// collaborations.collab_type — sposób rozliczenia + migracja danych ze starego 'type'
return function (PDO $conn) {
    $check = $conn->query("SHOW COLUMNS FROM collaborations LIKE 'collab_type'");
    if ($check->rowCount() === 0) {
        $conn->exec("ALTER TABLE collaborations ADD COLUMN collab_type VARCHAR(50) NOT NULL DEFAULT 'other'");
        echo "    dodano kolumnę collaborations.collab_type\n";
    } else {
        echo "    collaborations.collab_type już istnieje\n";
    }

    $rows = $conn->query("SELECT id, type, collab_type FROM collaborations")->fetchAll(PDO::FETCH_ASSOC);
    $upd = $conn->prepare("UPDATE collaborations SET collab_type = :ct WHERE id = :id");
    foreach ($rows as $row) {
        if ($row['collab_type'] === 'other' || empty($row['collab_type'])) {
            if ($row['type'] === 'barter') {
                $new = 'barter';
            } elseif ($row['type'] === 'paid') {
                $new = 'umowa_50'; // najczęstszy wariant u właścicielki
            } else {
                $new = $row['collab_type'] ?: 'other';
            }
            $upd->execute(['ct' => $new, 'id' => $row['id']]);
        }
    }
    echo "    zmigrowano dane collab_type\n";
};
