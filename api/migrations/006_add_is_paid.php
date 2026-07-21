<?php
// collaboration_team.is_paid — czy członek ekipy rozliczony
return function (PDO $conn) {
    $check = $conn->query("SHOW COLUMNS FROM collaboration_team LIKE 'is_paid'");
    if ($check->rowCount() === 0) {
        $conn->exec("ALTER TABLE collaboration_team ADD COLUMN is_paid BOOLEAN DEFAULT FALSE");
        echo "    dodano kolumnę collaboration_team.is_paid\n";
    } else {
        echo "    collaboration_team.is_paid już istnieje\n";
    }
};
