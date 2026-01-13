<?php
// api/debug_social.php
require_once __DIR__ . '/config/Database.php';

header('Content-Type: text/plain');

echo "=== DIAGNOSTYKA SOCIAL MEDIA ===\n";

// 1. Sprawdzenie Credentials
echo "\n1. Sprawdzanie pliku config/social_credentials.php:\n";
$credsPath = __DIR__ . '/config/social_credentials.php';
if (file_exists($credsPath)) {
    echo "   [OK] Plik istnieje.\n";
    $creds = require $credsPath;
    if (!empty($creds['youtube']['api_key'])) {
        echo "   [OK] API Key znaleziony: " . substr($creds['youtube']['api_key'], 0, 5) . "...\n";
    } else {
        echo "   [FAIL] Brak 'api_key' w konfiguracji!\n";
    }
} else {
    echo "   [FAIL] Plik nie istnieje!\n";
}

// 2. Sprawdzenie Bazy Danych
echo "\n2. Sprawdzanie tabeli 'social_connections':\n";
try {
    $db = new Database();
    $conn = $db->getConnection();

    // Check if table exists
    $stmt = $conn->query("SHOW TABLES LIKE 'social_connections'");
    if ($stmt->rowCount() > 0) {
        echo "   [OK] Tabela 'social_connections' istnieje.\n";

        // Check columns
        $stmt = $conn->query("SHOW COLUMNS FROM social_connections");
        $columns = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo "   Kolumny:\n";
        foreach ($columns as $col) {
            echo "   - " . $col['Field'] . " (" . $col['Type'] . ") " . ($col['Null'] === 'YES' ? 'NULL' : 'NOT NULL') . "\n";
        }
    } else {
        echo "   [FAIL] Tabela 'social_connections' NIE ISTNIEJE!\n";
    }

    // Check social_stats
    $stmt = $conn->query("SHOW TABLES LIKE 'social_stats'");
    if ($stmt->rowCount() > 0) {
        echo "   [OK] Tabela 'social_stats' istnieje.\n";
    } else {
        echo "   [FAIL] Tabela 'social_stats' NIE ISTNIEJE!\n";
    }

} catch (Exception $e) {
    echo "   [ERROR] Błąd połączenia z bazą: " . $e->getMessage() . "\n";
}

// 3. Test API YouTube (jeśli key jest)
if (!empty($creds['youtube']['api_key'])) {
    echo "\n3. Test połączenia z YouTube API:\n";
    $apiKey = $creds['youtube']['api_key'];
    // Test for Google Developers channel
    $testChannelId = 'UC_x5XG1OV2P6uZZ5FSM9Ttw';
    $url = "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id={$testChannelId}&key={$apiKey}";

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    // Disable SSL verification for local dev if needed (often an issue)
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($httpCode === 200) {
        $data = json_decode($response, true);
        if (!empty($data['items'])) {
            echo "   [OK] Połączenie udane. Kanał: " . $data['items'][0]['snippet']['title'] . "\n";
        } else {
            echo "   [WARN] Połączenie udane (200), ale brak wyników (Quota? Złe ID?).\n";
            print_r($data);
        }
    } else {
        echo "   [FAIL] Błąd HTTP: $httpCode\n";
        echo "   CURL Error: $error\n";
        echo "   Response: $response\n";
    }
}

echo "\n=== KONIEC ===\n";
