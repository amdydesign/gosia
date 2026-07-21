<?php
// Migracje wolno uruchamiac wylacznie z CLI (php api/migrations/plik.php)
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

require_once __DIR__ . '/../config/Database.php';

try {
    $db = new Database();
    $conn = $db->getConnection();

    echo "Creating login_attempts table...\n";
    $conn->exec("
        CREATE TABLE IF NOT EXISTS login_attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) NOT NULL,
            ip_address VARCHAR(45) NOT NULL,
            attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            INDEX idx_login_attempts (username, ip_address, attempted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    echo "Done.\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
