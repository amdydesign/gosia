<?php
require_once __DIR__ . '/config/Database.php';

echo "Migracja: Tworzenie tabeli 'social_connections'...\n";

try {
    $db = new Database();
    $conn = $db->getConnection();

    $sql = "
    CREATE TABLE IF NOT EXISTS social_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        provider ENUM('facebook', 'instagram', 'tiktok', 'youtube') NOT NULL,
        provider_user_id VARCHAR(255),
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY idx_user_provider (user_id, provider)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";

    $conn->exec($sql);
    echo "✅ Sukces: Tabela 'social_connections' została utworzona.\n";

} catch (PDOException $e) {
    echo "❌ Błąd: " . $e->getMessage() . "\n";
}
