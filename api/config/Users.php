<?php
/**
 * Accounts: who may log in, who is the admin, and the name shown in the app.
 *
 * The admin is the owner (first account) - only they add accounts and reset
 * passwords, and only their account may use the server's AI key from api/.env
 * and the legacy social handles. Every other account sees only its own data.
 */

class Users
{
    private static $ensured = false;

    const COLUMNS = [
        'display_name' => "ALTER TABLE users ADD COLUMN display_name VARCHAR(100) NULL",
        'is_admin' => "ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0",
        'is_active' => "ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1",
    ];

    /** Add the account columns if missing and make sure there is an admin (once per request). */
    public static function ensure(PDO $conn)
    {
        if (self::$ensured) {
            return;
        }
        $existing = array_column($conn->query("SHOW COLUMNS FROM users")->fetchAll(PDO::FETCH_ASSOC), 'Field');
        foreach (self::COLUMNS as $column => $sql) {
            if (!in_array($column, $existing, true)) {
                $conn->exec($sql);
            }
        }
        // Before accounts existed the panel was Gosia's alone. Her account - the one holding
        // the collaborations, not a leftover test login - becomes the admin.
        if (!$conn->query("SELECT 1 FROM users WHERE is_admin = 1 LIMIT 1")->fetchColumn()) {
            $owner = $conn->query("
                SELECT u.id FROM users u
                ORDER BY (SELECT COUNT(*) FROM collaborations c WHERE c.user_id = u.id) DESC, u.id ASC
                LIMIT 1
            ")->fetchColumn();
            if ($owner) {
                $conn->prepare("UPDATE users SET is_admin = 1, is_active = 1, display_name = COALESCE(display_name, 'Gosia') WHERE id = :id")
                    ->execute(['id' => $owner]);
            }
        }
        self::$ensured = true;
    }

    public static function find(PDO $conn, $id)
    {
        self::ensure($conn);
        $stmt = $conn->prepare("SELECT id, username, email, display_name, is_admin, is_active, last_login, created_at FROM users WHERE id = :id");
        $stmt->execute(['id' => $id]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    public static function isAdmin(PDO $conn, $id)
    {
        $user = self::find($conn, $id);
        return $user && (int) $user['is_admin'] === 1;
    }

    /** What the app gets about an account (never the password hash). */
    public static function publicData(array $user)
    {
        return [
            'id' => (int) $user['id'],
            'username' => $user['username'],
            'email' => $user['email'] ?? null,
            'display_name' => trim((string) ($user['display_name'] ?? '')) ?: $user['username'],
            'is_admin' => (int) ($user['is_admin'] ?? 0) === 1,
        ];
    }

    /** Login: 3-50 chars, letters, digits, dot, dash, underscore. Returns error text or null. */
    public static function usernameError($username)
    {
        if (!preg_match('/^[a-zA-Z0-9._-]{3,50}$/', $username)) {
            return 'Login: 3-50 znaków, litery bez polskich znaków, cyfry, kropka, myślnik.';
        }
        return null;
    }

    public static function passwordError($password)
    {
        return mb_strlen($password) < 8 ? 'Hasło musi mieć co najmniej 8 znaków.' : null;
    }
}
