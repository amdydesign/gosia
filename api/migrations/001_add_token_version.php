<?php
// users.token_version — wersjonowanie tokenów JWT (unieważnianie sesji)
return function (PDO $conn) {
    $check = $conn->query("SHOW COLUMNS FROM users LIKE 'token_version'");
    if ($check->rowCount() === 0) {
        $conn->exec("ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 1");
        echo "    dodano kolumnę users.token_version\n";
    } else {
        echo "    users.token_version już istnieje\n";
    }
};
