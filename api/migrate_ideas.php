<?php
require_once __DIR__ . '/config/Database.php';

echo "Migracja bazy danych...\n";

try {
    $db = new Database();
    $conn = $db->getConnection();

    $sql = "
    CREATE TABLE IF NOT EXISTS ideas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        status ENUM('draft', 'recorded') DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user_id (user_id),
        INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ";

    $conn->exec($sql);
    echo "Tabela 'ideas' została utworzona (jeśli nie istniała).\n";

} catch (PDOException $e) {
    echo "Błąd migracji: " . $e->getMessage() . "\n";
}
