<?php
/**
 * Self-healing schema for optional tables.
 *
 * Production runs `git pull` without a migration step, so tables added later
 * (attachments, push_subscriptions) may be missing. Endpoints that use them
 * call Schema::ensure() which creates the table on first use.
 */

class Schema
{
    private static $ensured = [];

    private static $definitions = [
        'attachments' => "
            CREATE TABLE IF NOT EXISTS attachments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                entity_type ENUM('collaboration', 'purchase') NOT NULL,
                entity_id INT NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                stored_name VARCHAR(80) NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                size INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_entity (entity_type, entity_id),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
        'push_subscriptions' => "
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                endpoint VARCHAR(500) NOT NULL,
                endpoint_hash CHAR(64) NOT NULL,
                p256dh VARCHAR(255) NOT NULL,
                auth VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY idx_endpoint_hash (endpoint_hash),
                INDEX idx_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
    ];

    /**
     * Create the table if it does not exist (once per request).
     */
    public static function ensure(PDO $conn, $table)
    {
        if (isset(self::$ensured[$table]) || !isset(self::$definitions[$table])) {
            return;
        }
        $stmt = $conn->query("SHOW TABLES LIKE " . $conn->quote($table));
        if ($stmt->rowCount() === 0) {
            $conn->exec(self::$definitions[$table]);
        }
        self::$ensured[$table] = true;
    }
}
