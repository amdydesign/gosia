<?php
/**
 * A few tries, then a pause - against password guessing.
 * Keys are hashed (IP + login), so the table holds no personal data in clear text.
 *
 * Creates its own table and never blocks a login: if the limit cannot be checked
 * (e.g. the server still runs an older cached file right after "git pull"), the try goes ahead.
 */

class RateLimit
{
    private static $ready = false;

    /** Minutes left until the next try is allowed, or 0 when it may go ahead. */
    public static function wait(PDO $conn, $scope, $key, $max, $minutes)
    {
        try {
            return self::waitOrFail($conn, $scope, $key, $max, $minutes);
        } catch (Exception $e) {
            error_log('RateLimit: ' . $e->getMessage());
            return 0;
        }
    }

    public static function hit(PDO $conn, $scope, $key)
    {
        try {
            self::ensureTable($conn);
            $conn->prepare("INSERT INTO login_attempts (scope, key_hash, attempted_at) VALUES (:scope, :key, :at)")
                ->execute(['scope' => $scope, 'key' => self::hash($key), 'at' => date('Y-m-d H:i:s')]);
            // keep the table small
            if (mt_rand(1, 50) === 1) {
                $conn->exec("DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 2 DAY)");
            }
        } catch (Exception $e) {
            error_log('RateLimit: ' . $e->getMessage());
        }
    }

    public static function clear(PDO $conn, $scope, $key)
    {
        try {
            self::ensureTable($conn);
            $conn->prepare("DELETE FROM login_attempts WHERE scope = :scope AND key_hash = :key")
                ->execute(['scope' => $scope, 'key' => self::hash($key)]);
        } catch (Exception $e) {
            error_log('RateLimit: ' . $e->getMessage());
        }
    }

    public static function ensureTable(PDO $conn)
    {
        if (self::$ready) {
            return;
        }
        $conn->exec("
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                scope VARCHAR(20) NOT NULL,
                key_hash CHAR(64) NOT NULL,
                attempted_at DATETIME NOT NULL,
                INDEX idx_scope_key (scope, key_hash, attempted_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
        self::$ready = true;
    }

    private static function waitOrFail(PDO $conn, $scope, $key, $max, $minutes)
    {
        self::ensureTable($conn);
        $since = date('Y-m-d H:i:s', time() - $minutes * 60);
        $stmt = $conn->prepare("
            SELECT COUNT(*) AS n, MIN(attempted_at) AS first FROM login_attempts
            WHERE scope = :scope AND key_hash = :key AND attempted_at >= :since
        ");
        $stmt->execute(['scope' => $scope, 'key' => self::hash($key), 'since' => $since]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ((int) $row['n'] < $max) {
            return 0;
        }
        $freeAt = strtotime($row['first']) + $minutes * 60;
        return max(1, (int) ceil(($freeAt - time()) / 60));
    }

    public static function ip()
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    }

    private static function hash($key)
    {
        return hash('sha256', (string) $key);
    }
}
