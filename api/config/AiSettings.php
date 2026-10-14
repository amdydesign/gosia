<?php
/**
 * AI keys entered in the app (Ustawienia -> Czytanie screenów).
 *
 * Stored per user in `app_settings`, keys encrypted with AES-256-GCM using a key
 * derived from JWT_SECRET, so a database dump alone does not reveal them.
 * The browser only ever sees a masked hint ("sk-ant-…a1b2").
 */

require_once __DIR__ . '/Schema.php';
require_once __DIR__ . '/AiClient.php';

class AiSettings
{
    const PROVIDERS = ['claude', 'gemini'];

    /** Load the user's settings into AiClient (call before using it). */
    public static function apply(PDO $conn, $userId)
    {
        AiClient::configure(self::load($conn, $userId));
    }

    /** @return array ['provider' => ?string, 'claude' => ?string, 'gemini' => ?string] */
    public static function load(PDO $conn, $userId)
    {
        Schema::ensure($conn, 'app_settings');
        $stmt = $conn->prepare("SELECT name, value FROM app_settings WHERE user_id = :user_id AND name IN ('ai_provider', 'ai_key_claude', 'ai_key_gemini')");
        $stmt->execute(['user_id' => $userId]);
        $rows = array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'value', 'name');

        return [
            'provider' => in_array($rows['ai_provider'] ?? '', self::PROVIDERS, true) ? $rows['ai_provider'] : null,
            'claude' => isset($rows['ai_key_claude']) ? self::decrypt($rows['ai_key_claude']) : null,
            'gemini' => isset($rows['ai_key_gemini']) ? self::decrypt($rows['ai_key_gemini']) : null,
        ];
    }

    public static function saveKey(PDO $conn, $userId, $provider, $key)
    {
        self::put($conn, $userId, 'ai_key_' . $provider, $key === null ? null : self::encrypt($key));
    }

    public static function saveProvider(PDO $conn, $userId, $provider)
    {
        self::put($conn, $userId, 'ai_provider', $provider);
    }

    /** Status for the settings screen (call after apply()). */
    public static function describe()
    {
        $out = [
            'enabled' => AiClient::provider() !== null,
            'provider' => AiClient::provider(),
        ];
        foreach (self::PROVIDERS as $p) {
            $key = AiClient::key($p);
            $out[$p] = [
                'set' => $key !== '',
                'source' => AiClient::keySource($p),
                'hint' => $key !== '' ? self::mask($key) : null,
            ];
        }
        return $out;
    }

    private static function put(PDO $conn, $userId, $name, $value)
    {
        Schema::ensure($conn, 'app_settings');
        if ($value === null) {
            $conn->prepare("DELETE FROM app_settings WHERE user_id = :user_id AND name = :name")
                ->execute(['user_id' => $userId, 'name' => $name]);
            return;
        }
        $conn->prepare("
            INSERT INTO app_settings (user_id, name, value) VALUES (:user_id, :name, :value)
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        ")->execute(['user_id' => $userId, 'name' => $name, 'value' => $value]);
    }

    private static function mask($key)
    {
        $prefix = strpos($key, 'sk-ant-') === 0 ? 'sk-ant-' : mb_substr($key, 0, 4);
        return $prefix . '…' . mb_substr($key, -4);
    }

    private static function cryptoKey()
    {
        return hash('sha256', 'gosia-app-settings|' . ($_ENV['JWT_SECRET'] ?? ''), true);
    }

    private static function encrypt($plain)
    {
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', self::cryptoKey(), OPENSSL_RAW_DATA, $iv, $tag);
        return 'v1:' . base64_encode($iv . $tag . $cipher);
    }

    private static function decrypt($stored)
    {
        if (strpos((string) $stored, 'v1:') !== 0) {
            return null;
        }
        $raw = base64_decode(substr($stored, 3), true);
        if ($raw === false || strlen($raw) <= 28) {
            return null;
        }
        $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', self::cryptoKey(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        return $plain === false ? null : $plain;
    }
}
