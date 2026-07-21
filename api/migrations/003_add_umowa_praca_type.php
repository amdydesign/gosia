<?php
// collaborations.type — dodanie 'umowa-praca' do ENUM
return function (PDO $conn) {
    $conn->exec("ALTER TABLE collaborations MODIFY COLUMN type ENUM('post-instagram', 'story', 'reel', 'sesja', 'konsultacja', 'event', 'umowa-praca', 'inne') NOT NULL DEFAULT 'inne'");
    echo "    rozszerzono ENUM collaborations.type o 'umowa-praca'\n";
};
