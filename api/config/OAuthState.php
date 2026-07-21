<?php
/**
 * OAuth "state" tokens (ochrona przed CSRF w OAuth)
 *
 * Token jest bezstanowy: payload (userId|platforma|wygasa|nonce) podpisany
 * HMAC-em kluczem JWT_SECRET. Nie wymaga tabeli w bazie ani sesji.
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Dotenv\Dotenv;

class OAuthState
{
    private const TTL_SECONDS = 600; // 10 minut na dokonczenie logowania u dostawcy

    private static function secret()
    {
        $dotenv = Dotenv::createImmutable(__DIR__ . '/../');
        $dotenv->safeLoad();

        $secret = $_ENV['JWT_SECRET'] ?? '';
        if ($secret === '') {
            throw new Exception('JWT_SECRET is not configured');
        }
        return $secret;
    }

    public static function generate($userId, $platform)
    {
        $payload = $userId . '|' . $platform . '|' . (time() + self::TTL_SECONDS) . '|' . bin2hex(random_bytes(8));
        $signature = hash_hmac('sha256', $payload, self::secret());
        $encoded = rtrim(strtr(base64_encode($payload), '+/', '-_'), '=');
        return $encoded . '.' . $signature;
    }

    public static function validate($state, $userId, $platform)
    {
        if (!is_string($state) || strpos($state, '.') === false) {
            return false;
        }

        list($encoded, $signature) = explode('.', $state, 2);
        $payload = base64_decode(strtr($encoded, '-_', '+/'), true);
        if ($payload === false) {
            return false;
        }

        if (!hash_equals(hash_hmac('sha256', $payload, self::secret()), $signature)) {
            return false;
        }

        $parts = explode('|', $payload);
        if (count($parts) !== 4) {
            return false;
        }

        return (string) $parts[0] === (string) $userId
            && $parts[1] === $platform
            && time() <= (int) $parts[2];
    }
}
