<?php
/**
 * ONE-TIME PASSWORD UPDATE
 * Run this to update admin password to 'password'
 */

require_once __DIR__ . '/api/vendor/autoload.php';

use Dotenv\Dotenv;

// Load .env
$dotenv = Dotenv::createImmutable(__DIR__ . '/api');
$dotenv->load();

try {
    $pdo = new PDO(
        "mysql:host={$_ENV['DB_HOST']};dbname={$_ENV['DB_NAME']};charset=utf8mb4",
        $_ENV['DB_USER'],
        $_ENV['DB_PASS'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Password hash for 'password'
    $newHash = '$2y$12$QaVmcvONpCjvZOSMR1Oc2O.3ot1wzzleG2Rz4zBTZwqTAAjJMf5JC';

    $stmt = $pdo->prepare("UPDATE users SET password_hash = :hash WHERE username = 'admin'");
    $stmt->execute(['hash' => $newHash]);

    echo "✅ Password updated successfully!\n";
    echo "Username: admin\n";
    echo "Password: password\n";

} catch (PDOException $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
}
