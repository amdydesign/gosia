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
        'documents' => "
            CREATE TABLE IF NOT EXISTS documents (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                notes TEXT NULL,
                original_name VARCHAR(255) NOT NULL,
                stored_name VARCHAR(80) NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                size INT NOT NULL DEFAULT 0,
                content_text MEDIUMTEXT NULL,
                status ENUM('signed', 'to_sign') NOT NULL DEFAULT 'signed',
                doc_date DATE NULL,
                counterparty VARCHAR(255) NULL,
                analyzed_at TIMESTAMP NULL DEFAULT NULL,
                doc_kind VARCHAR(20) NULL,
                amount DECIMAL(10, 2) NULL,
                billing VARCHAR(20) NULL,
                collaboration_id INT NULL,
                collab_dismissed TINYINT(1) NOT NULL DEFAULT 0,
                file_hash CHAR(64) NULL,
                text_hash CHAR(64) NULL,
                brand VARCHAR(100) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_created (user_id, created_at)
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
        'social_profiles' => "
            CREATE TABLE IF NOT EXISTS social_profiles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                platform ENUM('facebook', 'instagram', 'tiktok', 'youtube') NOT NULL,
                handle VARCHAR(255) NOT NULL DEFAULT '',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY idx_user_platform (user_id, platform)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
        'app_settings' => "
            CREATE TABLE IF NOT EXISTS app_settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(64) NOT NULL,
                value TEXT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY idx_user_name (user_id, name)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
        // Things to do typed into "Zrzuć tutaj" (not a purchase / collaboration / idea)
        'tasks' => "
            CREATE TABLE IF NOT EXISTS tasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                due_date DATE NULL,
                done_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_open (user_id, done_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
        // "Przypomnij jutro 9:00": hides the item until remind_at, then a push is sent
        'reminders' => "
            CREATE TABLE IF NOT EXISTS reminders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                ref_key VARCHAR(120) NOT NULL,
                title VARCHAR(255) NOT NULL,
                url VARCHAR(255) NOT NULL DEFAULT '/dashboard',
                remind_at DATETIME NOT NULL,
                sent_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_due (sent_at, remind_at),
                INDEX idx_user_ref (user_id, ref_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
        // What got done today - feeds "Dziś ogarnięte X z Y"
        'done_log' => "
            CREATE TABLE IF NOT EXISTS done_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                ref_key VARCHAR(120) NOT NULL,
                title VARCHAR(255) NOT NULL,
                done_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_done (user_id, done_at),
                INDEX idx_user_ref (user_id, ref_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
        // One row per push actually sent - the cron runs every 15 min and must not repeat itself
        'push_log' => "
            CREATE TABLE IF NOT EXISTS push_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                dedup_key VARCHAR(150) NOT NULL,
                sent_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY idx_user_key (user_id, dedup_key)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
        // Server-wide values the app creates itself (e.g. VAPID keys for push)
        'server_settings' => "
            CREATE TABLE IF NOT EXISTS server_settings (
                name VARCHAR(64) NOT NULL PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
        'social_refresh_log' => "
            CREATE TABLE IF NOT EXISTS social_refresh_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                platform ENUM('facebook', 'instagram', 'tiktok', 'youtube') NOT NULL,
                attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                success TINYINT(1) NOT NULL DEFAULT 0,
                source VARCHAR(40) NULL,
                error VARCHAR(500) NULL,
                INDEX idx_user_platform (user_id, platform, id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
    ];

    /**
     * Columns added after the first release ("table.column" => ALTER statement).
     */
    private static $columns = [
        'purchases.kept_confirmed' => "ALTER TABLE purchases ADD COLUMN kept_confirmed TINYINT(1) NOT NULL DEFAULT 0",
        'purchases.returned_at' => "ALTER TABLE purchases ADD COLUMN returned_at TIMESTAMP NULL DEFAULT NULL",
    ];

    /**
     * Add the column if it does not exist (once per request).
     */
    public static function ensureColumn(PDO $conn, $table, $column)
    {
        $key = $table . '.' . $column;
        if (isset(self::$ensured[$key]) || !isset(self::$columns[$key])) {
            return;
        }
        $stmt = $conn->query("SHOW COLUMNS FROM `" . str_replace('`', '', $table) . "` LIKE " . $conn->quote($column));
        if ($stmt->rowCount() === 0) {
            $conn->exec(self::$columns[$key]);
        }
        self::$ensured[$key] = true;
    }

    /**
     * Purchases columns used by the returns flow.
     */
    public static function ensurePurchases(PDO $conn)
    {
        self::ensureColumn($conn, 'purchases', 'kept_confirmed');
        self::ensureColumn($conn, 'purchases', 'returned_at');
    }

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
