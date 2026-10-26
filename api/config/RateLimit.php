<?php
/**
 * A few tries, then a pause - against password guessing.
 * Keys are hashed (IP + login), so the table holds no personal data in clear text.
 */

require_once __DIR__ . '/Schema.php';

class RateLimit
{
    /** Minutes left until the next try is allowed, or 0 when it may go ahead. */
    public static function wait(PDO $conn, $scope, $key, $max, $minutes)
    {
        Schema::ensure($conn, 'login_attempts');
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

    public static function hit(PDO $conn, $scope, $key)
    {
        Schema::ensure($conn, 'login_attempts');
        $conn->prepare("INSERT INTO login_attempts (scope, key_hash, attempted_at) VALUES (:scope, :key, :at)")
            ->execute(['scope' => $scope, 'key' => self::hash($key), 'at' => date('Y-m-d H:i:s')]);
        // keep the table small
        if (mt_rand(1, 50) === 1) {
            $conn->exec("DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 2 DAY)");
        }
    }

    public static function clear(PDO $conn, $scope, $key)
    {
        Schema::ensure($conn, 'login_attempts');
        $conn->prepare("DELETE FROM login_attempts WHERE scope = :scope AND key_hash = :key")
            ->execute(['scope' => $scope, 'key' => self::hash($key)]);
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
