<?php
/**
 * Set a new password for a user - CLI only (run over SSH on the server).
 *
 *   php api/utils/reset_password.php                 -> lists users
 *   php api/utils/reset_password.php admin           -> random password is generated and printed
 *   php api/utils/reset_password.php admin 'Haslo1'  -> sets the given password
 *
 * Also bumps token_version, so every logged-in device has to log in again.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/../config/Database.php';

$username = $argv[1] ?? '';
$password = $argv[2] ?? '';

try {
    $db = new Database();
    $conn = $db->getConnection();

    if ($username === '') {
        echo "Użytkownicy:\n";
        foreach ($conn->query("SELECT id, username, email FROM users ORDER BY id") as $row) {
            echo "  #{$row['id']}  {$row['username']}" . ($row['email'] ? "  <{$row['email']}>" : '') . "\n";
        }
        echo "\nUżycie: php api/utils/reset_password.php LOGIN [NOWE_HASLO]\n";
        exit(0);
    }

    $stmt = $conn->prepare("SELECT id FROM users WHERE username = :username LIMIT 1");
    $stmt->execute(['username' => $username]);
    $user = $stmt->fetch();
    if (!$user) {
        fwrite(STDERR, "Nie ma użytkownika \"{$username}\". Uruchom bez argumentów, żeby zobaczyć listę.\n");
        exit(1);
    }

    $generated = $password === '';
    if ($generated) {
        $password = 'Gosia-' . bin2hex(random_bytes(5));
    } elseif (strlen($password) < 8) {
        fwrite(STDERR, "Hasło musi mieć co najmniej 8 znaków.\n");
        exit(1);
    }

    $hasVersion = $conn->query("SHOW COLUMNS FROM users LIKE 'token_version'")->rowCount() > 0;
    $sql = "UPDATE users SET password_hash = :hash" . ($hasVersion ? ", token_version = COALESCE(token_version, 1) + 1" : '') . " WHERE id = :id";
    $conn->prepare($sql)->execute([
        'hash' => password_hash($password, PASSWORD_BCRYPT),
        'id' => $user['id'],
    ]);

    echo "Hasło dla \"{$username}\" zostało zmienione.\n";
    if ($generated) {
        echo "Nowe hasło: {$password}\n";
        echo "Zaloguj się i zmień je w aplikacji: Ustawienia -> Zmień hasło.\n";
    }
} catch (Exception $e) {
    fwrite(STDERR, "Błąd: " . $e->getMessage() . "\n");
    exit(1);
}
