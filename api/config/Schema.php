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
        // Failed logins / reset requests - a few tries, then a pause (key = hash of ip + login)
        'login_attempts' => "
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                scope VARCHAR(20) NOT NULL,
                key_hash CHAR(64) NOT NULL,
                attempted_at DATETIME NOT NULL,
                INDEX idx_scope_key (scope, key_hash, attempted_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
        // "Nie pamiętasz hasła?" - one-time links sent by e-mail (only the hash is stored)
        'password_resets' => "
            CREATE TABLE IF NOT EXISTS password_resets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                token_hash CHAR(64) NOT NULL,
                expires_at DATETIME NOT NULL,
                used_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE KEY idx_token (token_hash)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
        // Deleted things for 30 days ("Cofnij" / Kosz): the row and its children as JSON
        'trash' => "
            CREATE TABLE IF NOT EXISTS trash (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                entity_type VARCHAR(20) NOT NULL,
                entity_id INT NOT NULL,
                title VARCHAR(255) NOT NULL DEFAULT '',
                payload MEDIUMTEXT NOT NULL,
                files TEXT NULL,
                deleted_at DATETIME NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_deleted (user_id, deleted_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ",
        // Screens shared from the iPhone (Skróty) or dropped into "Zrzuć tutaj", sorted by AI
        'inbox_items' => "
            CREATE TABLE IF NOT EXISTS inbox_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                source VARCHAR(20) NOT NULL DEFAULT 'app',
                stored_name VARCHAR(80) NULL,
                original_name VARCHAR(255) NULL,
                mime_type VARCHAR(100) NULL,
                size INT NOT NULL DEFAULT 0,
                note TEXT NULL,
                kind VARCHAR(20) NULL,
                title VARCHAR(255) NULL,
                data MEDIUMTEXT NULL,
                done_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                INDEX idx_user_open (user_id, done_at)
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
     * Columns added after the first release ("table.column" => ALTER statement,
     * or a list: the ALTER first, then statements that fill in existing rows).
     */
    private static $columns = [
        'purchases.kept_confirmed' => "ALTER TABLE purchases ADD COLUMN kept_confirmed TINYINT(1) NOT NULL DEFAULT 0",
        'purchases.returned_at' => "ALTER TABLE purchases ADD COLUMN returned_at TIMESTAMP NULL DEFAULT NULL",
        // "Paczka przyszła": the return window counts from delivery, not from the order
        'purchases.delivered_at' => "ALTER TABLE purchases ADD COLUMN delivered_at DATE NULL DEFAULT NULL",
        // "Pieniądze są": the shop paid the refund back. Returns made before this existed count as settled.
        'purchases.refunded_at' => [
            "ALTER TABLE purchases ADD COLUMN refunded_at DATE NULL DEFAULT NULL",
            "UPDATE purchases SET refunded_at = DATE(COALESCE(returned_at, updated_at)) WHERE status IN ('returned', 'partial')",
        ],
        // what sending the parcel back cost (paid label / fee taken off the refund)
        'purchases.return_cost' => "ALTER TABLE purchases ADD COLUMN return_cost DECIMAL(10, 2) NULL DEFAULT NULL",
        // "Nagram dziś": a reel lands on Start's list only when planned for a day
        'ideas.planned_for' => "ALTER TABLE ideas ADD COLUMN planned_for DATE NULL DEFAULT NULL",
        // published reel + its results (views etc. read from an insights screenshot)
        'ideas.published_at' => "ALTER TABLE ideas ADD COLUMN published_at DATE NULL DEFAULT NULL",
        'ideas.views' => "ALTER TABLE ideas ADD COLUMN views INT NULL DEFAULT NULL",
        'ideas.stats' => "ALTER TABLE ideas ADD COLUMN stats TEXT NULL",
        // when the money came in (set by "Opłacone") - income counts in that month / tax year
        'collaborations.paid_at' => "ALTER TABLE collaborations ADD COLUMN paid_at DATE NULL DEFAULT NULL",
        // deadlines: publish by, published on, pay within N days (from publishing / the date)
        'collaborations.publish_by' => "ALTER TABLE collaborations ADD COLUMN publish_by DATE NULL DEFAULT NULL",
        'collaborations.published_at' => "ALTER TABLE collaborations ADD COLUMN published_at DATE NULL DEFAULT NULL",
        'collaborations.payment_days' => "ALTER TABLE collaborations ADD COLUMN payment_days SMALLINT NULL DEFAULT NULL",
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
            foreach ((array) self::$columns[$key] as $sql) {
                $conn->exec($sql);
            }
        }
        self::$ensured[$key] = true;
    }

    /** Every late column of a table (e.g. "collaborations"). */
    public static function ensureColumns(PDO $conn, $table)
    {
        foreach (array_keys(self::$columns) as $key) {
            if (strpos($key, $table . '.') === 0) {
                self::ensureColumn($conn, $table, substr($key, strlen($table) + 1));
            }
        }
    }

    /**
     * Purchases columns used by the returns flow.
     */
    public static function ensurePurchases(PDO $conn)
    {
        self::ensureColumns($conn, 'purchases');
    }

    /** Collaboration columns: paid_at and the deadlines. */
    public static function ensureCollaborations(PDO $conn)
    {
        self::ensureColumns($conn, 'collaborations');
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

    /**
     * Every table and late column at once - used by api/utils/repair_schema.php.
     * Returns what was checked, for the report.
     */
    public static function ensureAll(PDO $conn)
    {
        $done = [];
        foreach (array_keys(self::$definitions) as $table) {
            self::ensure($conn, $table);
            $done[] = $table;
        }
        foreach (array_keys(self::$columns) as $key) {
            list($table, $column) = explode('.', $key, 2);
            self::ensureColumn($conn, $table, $column);
            $done[] = $key;
        }
        return $done;
    }
}
