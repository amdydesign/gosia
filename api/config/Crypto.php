<?php
/**
 * Szyfrowanie sekretów przechowywanych w bazie (tokeny OAuth social media).
 *
 * libsodium secretbox (XSalsa20-Poly1305), klucz w .env jako APP_ENCRYPTION_KEY
 * (base64, 32 bajty — wygeneruj: php -r "echo base64_encode(random_bytes(32));").
 *
 * Format w bazie: "enc:v1:" + base64(nonce + ciphertext).
 * Wartości bez prefiksu traktowane są jako zaszłość plaintext (do czasu
 * uruchomienia migracji szyfrującej) i zwracane bez zmian przy odczycie.
 */

class Crypto
{
    private const PREFIX = 'enc:v1:';

    private static function key()
    {
        $raw = base64_decode($_ENV['APP_ENCRYPTION_KEY'] ?? '', true);
        if ($raw === false || strlen($raw) !== SODIUM_CRYPTO_SECRETBOX_KEYBYTES) {
            throw new Exception('APP_ENCRYPTION_KEY is not configured (32 random bytes, base64 — see api/.env.example)');
        }
        return $raw;
    }

    public static function encrypt($plaintext)
    {
        if ($plaintext === null || $plaintext === '') {
            return $plaintext;
        }
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = sodium_crypto_secretbox($plaintext, $nonce, self::key());
        return self::PREFIX . base64_encode($nonce . $cipher);
    }

    public static function decrypt($stored)
    {
        if ($stored === null || $stored === '' || strpos($stored, self::PREFIX) !== 0) {
            // Zaszłość: wartość niezaszyfrowana (sprzed migracji)
            return $stored;
        }
        $raw = base64_decode(substr($stored, strlen(self::PREFIX)), true);
        if ($raw === false || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            throw new Exception('Corrupted encrypted value');
        }
        $nonce = substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plain = sodium_crypto_secretbox_open($cipher, $nonce, self::key());
        if ($plain === false) {
            throw new Exception('Decryption failed (wrong APP_ENCRYPTION_KEY?)');
        }
        return $plain;
    }

    public static function isEncrypted($stored)
    {
        return is_string($stored) && strpos($stored, self::PREFIX) === 0;
    }
}
