<?php
/**
 * Database Connection Class
 * Uses PDO with .env configuration
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Dotenv\Dotenv;

class Database {
    private $host;
    private $db_name;
    private $username;
    private $password;
    private $conn;
    private static $instance = null;

    public function __construct() {
        // Load .env file
        $dotenv = Dotenv::createImmutable(__DIR__ . '/../');
        $dotenv->load();
        
        $this->host = $_ENV['DB_HOST'];
        $this->db_name = $_ENV['DB_NAME'];
        $this->username = $_ENV['DB_USER'];
        $this->password = $_ENV['DB_PASS'];
    }

    /**
     * Get database connection (singleton)
     */
    public function getConnection() {
        if ($this->conn === null) {
            try {
                $dsn = "mysql:host={$this->host};dbname={$this->db_name};charset=utf8mb4";
                $options = [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ];
                
                $this->conn = new PDO($dsn, $this->username, $this->password, $options);
            } catch (PDOException $e) {
                if ($_ENV['APP_DEBUG'] === 'true') {
                    die(json_encode([
                        'success' => false,
                        'message' => 'Database connection failed: ' . $e->getMessage()
                    ]));
                }
                die(json_encode([
                    'success' => false,
                    'message' => 'Database connection failed'
                ]));
            }
        }
        return $this->conn;
    }

    /**
     * Get singleton instance
     */
    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
}
