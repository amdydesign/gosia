<?php
require_once __DIR__ . '/config/Database.php';

echo "Migracja: Dodawanie kolumny 'amount' do tabeli 'collaboration_team'...\n";

try {
    $db = new Database();
    $conn = $db->getConnection();

    // Sprawdź czy kolumna już istnieje
    $check = $conn->query("SHOW COLUMNS FROM collaboration_team LIKE 'amount'");

    if ($check->rowCount() == 0) {
        $sql = "ALTER TABLE collaboration_team ADD COLUMN amount DECIMAL(10, 2) DEFAULT 0.00 AFTER name";
        $conn->exec($sql);
        echo "✅ Sukces: Dodano kolumnę 'amount'.\n";
    } else {
        echo "ℹ️ Info: Kolumna 'amount' już istnieje.\n";
    }

} catch (PDOException $e) {
    echo "❌ Błąd: " . $e->getMessage() . "\n";
}
