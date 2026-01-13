<?php
require_once __DIR__ . '/config/Database.php';

echo "Migracja: Tworzenie tabeli 'social_stats'...\n";

try {
    $db = new Database();
    $conn = $db->getConnection();

    $sql = "
    CREATE TABLE IF NOT EXISTS social_stats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        platform ENUM('facebook', 'instagram', 'tiktok', 'youtube') NOT NULL,
        followers_count INT NOT NULL DEFAULT 0,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY idx_unique_daily (user_id, platform, date),
        INDEX idx_user_platform (user_id, platform)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";

    $conn->exec($sql);
    echo "✅ Sukces: Tabela 'social_stats' została utworzona (jeśli nie istniała).\n";

} catch (PDOException $e) {
    echo "❌ Błąd: " . $e->getMessage() . "\n";
}
