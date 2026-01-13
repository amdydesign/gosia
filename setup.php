<?php
/**
 * ONE-TIME DATABASE SETUP SCRIPT
 * Execute this file ONCE in browser, then DELETE it!
 * URL: http://panel.malgorzatamordarska.pl/setup.php
 */

require_once __DIR__ . '/api/vendor/autoload.php';

use Dotenv\Dotenv;

// Load .env
$dotenv = Dotenv::createImmutable(__DIR__ . '/api');
$dotenv->load();

// Database credentials
$host = $_ENV['DB_HOST'];
$dbname = $_ENV['DB_NAME'];
$username = $_ENV['DB_USER'];
$password = $_ENV['DB_PASS'];

echo "<!DOCTYPE html><html><head><title>Database Setup</title>";
echo "<style>body{font-family:Arial;max-width:800px;margin:50px auto;padding:20px;}";
echo "pre{background:#f5f5f5;padding:15px;border-radius:5px;overflow-x:auto;}";
echo ".success{color:green;} .error{color:red;}</style></head><body>";
echo "<h1>🗄️ Gosia Stylist Manager - Database Setup</h1>";

try {
    // Connect to MySQL
    $dsn = "mysql:host=$host;charset=utf8mb4";
    $pdo = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
    ]);

    echo "<p class='success'>✅ Connected to MySQL server</p>";

    // Create database if not exists
    $pdo->exec("CREATE DATABASE IF NOT EXISTS `$dbname` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    echo "<p class='success'>✅ Database '$dbname' ready</p>";

    // Use database
    $pdo->exec("USE `$dbname`");

    // Read SQL file
    $sqlFile = __DIR__ . '/api/database/schema.sql';
    $sql = file_get_contents($sqlFile);

    // Remove comments and split by semicolon
    $sql = preg_replace('/--.*$/m', '', $sql);
    $statements = array_filter(array_map('trim', explode(';', $sql)));

    echo "<h2>Executing SQL statements...</h2><pre>";

    $successCount = 0;
    foreach ($statements as $statement) {
        if (empty($statement))
            continue;

        try {
            $pdo->exec($statement);
            $successCount++;

            // Show what was created
            if (stripos($statement, 'CREATE TABLE') !== false) {
                preg_match('/CREATE TABLE.*?`?(\w+)`?\s/i', $statement, $matches);
                $tableName = $matches[1] ?? 'unknown';
                echo "✅ Created table: $tableName\n";
            } elseif (stripos($statement, 'INSERT INTO') !== false) {
                preg_match('/INSERT INTO\s+`?(\w+)`?/i', $statement, $matches);
                $tableName = $matches[1] ?? 'unknown';
                echo "✅ Inserted data into: $tableName\n";
            }
        } catch (PDOException $e) {
            // Ignore "table already exists" errors
            if (
                strpos($e->getMessage(), 'already exists') === false &&
                strpos($e->getMessage(), 'Duplicate entry') === false
            ) {
                echo "<span class='error'>❌ Error: " . $e->getMessage() . "</span>\n";
            }
        }
    }

    echo "</pre>";
    echo "<h2 class='success'>✅ Setup Complete!</h2>";
    echo "<p>Executed $successCount SQL statements successfully.</p>";

    // Verify tables
    $tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
    echo "<h3>Created Tables:</h3><ul>";
    foreach ($tables as $table) {
        echo "<li>$table</li>";
    }
    echo "</ul>";

    // Check if user exists
    $userCount = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    echo "<p>Users in database: <strong>$userCount</strong></p>";

    if ($userCount > 0) {
        echo "<div style='background:#e8f5e9;padding:15px;border-radius:5px;margin-top:20px;'>";
        echo "<h3>🎉 Ready to use!</h3>";
        echo "<p><strong>Login:</strong> admin<br><strong>Password:</strong> password</p>";
        echo "<p>⚠️ <strong>IMPORTANT:</strong> Delete this setup.php file NOW for security!</p>";
        echo "</div>";
    }

} catch (PDOException $e) {
    echo "<p class='error'>❌ Database Error: " . $e->getMessage() . "</p>";
    echo "<pre>Host: $host\nDatabase: $dbname\nUser: $username</pre>";
}

echo "</body></html>";
