<?php
/**
 * Face ID / Touch ID login (WebAuthn passkeys) without extra libraries - only openssl.
 *
 * Registration happens while logged in, so the browser's public key (SPKI from
 * getPublicKey()) is trusted as is - no attestation needed. Login checks the
 * signature over authenticatorData + SHA-256(clientDataJSON) with that key.
 * Challenges travel as short signed tokens (5 min) and are single-use.
 */

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/Schema.php';
require_once __DIR__ . '/RateLimit.php';

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class Passkeys
{
    const CHALLENGE_TTL = 300;
    const ALGORITHMS = [-7, -257]; // ES256 (Apple, Android), RS256 (Windows Hello)

    public static function rpId()
    {
        return strtolower(preg_replace('/:\d+$/', '', $_SERVER['HTTP_HOST'] ?? 'localhost'));
    }

    public static function origin()
    {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
    }

    public static function b64url($bytes)
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }

    public static function fromB64url($text)
    {
        $text = strtr((string) $text, '-_', '+/');
        $decoded = base64_decode($text . str_repeat('=', (4 - strlen($text) % 4) % 4), true);
        return $decoded === false ? '' : $decoded;
    }

    /** A new challenge and the signed state the app sends back with the answer. */
    public static function challenge($purpose, $userId = null)
    {
        $challenge = self::b64url(random_bytes(32));
        $state = JWT::encode([
            'typ' => 'passkey',
            'purpose' => $purpose,
            'ch' => $challenge,
            'uid' => $userId,
            'exp' => time() + self::CHALLENGE_TTL,
        ], self::secret(), 'HS256');
        return [$challenge, $state];
    }

    /** Challenge from a state token (checked: signature, purpose, age, not used before). */
    public static function useChallenge(PDO $conn, $state, $purpose, $userId = null)
    {
        try {
            $data = (array) JWT::decode((string) $state, new Key(self::secret(), 'HS256'));
        } catch (Exception $e) {
            throw new RuntimeException('Spróbuj jeszcze raz - minęło za dużo czasu.');
        }
        if (($data['typ'] ?? '') !== 'passkey' || ($data['purpose'] ?? '') !== $purpose) {
            throw new RuntimeException('Nieprawidłowe żądanie.');
        }
        if ($userId !== null && (int) ($data['uid'] ?? 0) !== (int) $userId) {
            throw new RuntimeException('Nieprawidłowe żądanie.');
        }
        if (RateLimit::wait($conn, 'passkey_used', $data['ch'], 1, 10) > 0) {
            throw new RuntimeException('Spróbuj jeszcze raz.');
        }
        RateLimit::hit($conn, 'passkey_used', $data['ch']);
        return $data['ch'];
    }

    /** clientDataJSON: type, challenge and origin must match. */
    public static function checkClientData($clientDataJson, $type, $challenge)
    {
        $client = json_decode($clientDataJson, true);
        if (!is_array($client) || ($client['type'] ?? '') !== $type) {
            throw new RuntimeException('Nieprawidłowa odpowiedź urządzenia.');
        }
        if (!hash_equals($challenge, (string) ($client['challenge'] ?? ''))) {
            throw new RuntimeException('Spróbuj jeszcze raz.');
        }
        if (($client['origin'] ?? '') !== self::origin()) {
            throw new RuntimeException('Logowanie Face ID działa tylko w Goni.');
        }
    }

    /** authenticatorData: our site, user present + verified (Face ID). Returns the sign counter. */
    public static function checkAuthData($authData)
    {
        if (strlen($authData) < 37 || !hash_equals(hash('sha256', self::rpId(), true), substr($authData, 0, 32))) {
            throw new RuntimeException('Nieprawidłowa odpowiedź urządzenia.');
        }
        $flags = ord($authData[32]);
        if (($flags & 0x01) === 0 || ($flags & 0x04) === 0) {
            throw new RuntimeException('Potwierdź Face ID / Touch ID.');
        }
        return unpack('N', substr($authData, 33, 4))[1];
    }

    /** SPKI (DER) from getPublicKey() -> PEM, checked by openssl. */
    public static function pemFromSpki($der)
    {
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
        if (!openssl_pkey_get_public($pem)) {
            throw new RuntimeException('Nieobsługiwany klucz.');
        }
        return $pem;
    }

    public static function verifySignature($pem, $authData, $clientDataJson, $signature)
    {
        $signed = $authData . hash('sha256', $clientDataJson, true);
        return openssl_verify($signed, $signature, $pem, OPENSSL_ALGO_SHA256) === 1;
    }

    /** userHandle for an account (no personal data in it). */
    public static function userHandle($userId)
    {
        return self::b64url('gonia-' . (int) $userId);
    }

    public static function userIdFromHandle($handle)
    {
        $raw = self::fromB64url($handle);
        return preg_match('/^gonia-(\d+)$/', $raw, $m) ? (int) $m[1] : 0;
    }

    private static function secret()
    {
        if (empty($_ENV['JWT_SECRET'])) {
            Dotenv\Dotenv::createImmutable(__DIR__ . '/../')->safeLoad();
        }
        return 'passkey|' . ($_ENV['JWT_SECRET'] ?? '');
    }
}
