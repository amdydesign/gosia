<?php
require_once __DIR__ . '/config/Database.php';

echo "Migracja: Aktualizacja tabeli 'social_connections' (Allow NULL tokens)...\n";

try {
    $db = new Database();
    $conn = $db->getConnection();

    // Modify columns to be nullable because for API Key method we don't have access tokens
    $sql = "
    ALTER TABLE social_connections 
    MODIFY access_token TEXT NULL,
    MODIFY refresh_token TEXT NULL,
    MODIFY expires_at DATETIME NULL;
    ";

    $conn->exec($sql);
    echo "✅ Sukces: Tabela 'social_connections' zaktualizowana.\n";

} catch (PDOException $e) {
    echo "⚠️ Info (może już zaktualizowane): " . $e->getMessage() . "\n";
}
