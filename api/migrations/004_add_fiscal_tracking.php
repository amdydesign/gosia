<?php
// collaborations.fiscal_tracking — czy współpraca wliczana do rozliczeń podatkowych
return function (PDO $conn) {
    $check = $conn->query("SHOW COLUMNS FROM collaborations LIKE 'fiscal_tracking'");
    if ($check->rowCount() === 0) {
        $conn->exec("ALTER TABLE collaborations ADD COLUMN fiscal_tracking BOOLEAN NOT NULL DEFAULT TRUE");
        echo "    dodano kolumnę collaborations.fiscal_tracking\n";
    } else {
        echo "    collaborations.fiscal_tracking już istnieje\n";
    }
};
