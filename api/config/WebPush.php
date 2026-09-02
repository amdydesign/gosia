<?php
/**
 * Minimal Web Push sender
 * - Message encryption: RFC 8291 (aes128gcm)
 * - Voluntary Application Server Identification: RFC 8292 (VAPID, ES256)
 *
 * Self-contained: requires only ext-openssl and ext-curl (no composer packages
 * beyond the already used vlucas/phpdotenv for .env loading).
 *
 * Setup:
 *   php api/utils/generate_vapid_keys.php   -> put keys into api/.env
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Dotenv\Dotenv;

class WebPush
{
    private $vapidPublicKey;  // raw uncompressed P-256 point (65 bytes)
    private $vapidPrivateKey; // raw scalar (32 bytes)
    private $subject;

    public function __construct()
    {
        $dotenv = Dotenv::createImmutable(__DIR__ . '/../');
        $dotenv->safeLoad();

        $publicB64 = $_ENV['VAPID_PUBLIC_KEY'] ?? '';
        $privateB64 = $_ENV['VAPID_PRIVATE_KEY'] ?? '';
        $this->subject = $_ENV['VAPID_SUBJECT'] ?? 'mailto:admin@localhost';

        if ($publicB64 === '' || $privateB64 === '') {
            throw new RuntimeException('VAPID keys not configured. Run api/utils/generate_vapid_keys.php and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env');
        }

        $this->vapidPublicKey = self::base64UrlDecode($publicB64);
        $this->vapidPrivateKey = self::base64UrlDecode($privateB64);

        if (strlen($this->vapidPublicKey) !== 65 || $this->vapidPublicKey[0] !== "\x04" || strlen($this->vapidPrivateKey) !== 32) {
            throw new RuntimeException('Invalid VAPID key format in .env');
        }
    }

    public static function isConfigured()
    {
        $dotenv = Dotenv::createImmutable(__DIR__ . '/../');
        $dotenv->safeLoad();
        return !empty($_ENV['VAPID_PUBLIC_KEY']) && !empty($_ENV['VAPID_PRIVATE_KEY']);
    }

    public static function getPublicKey()
    {
        $dotenv = Dotenv::createImmutable(__DIR__ . '/../');
        $dotenv->safeLoad();
        return $_ENV['VAPID_PUBLIC_KEY'] ?? '';
    }

    /**
     * Send a push message to a single subscription.
     *
     * @param string $endpoint subscription endpoint URL
     * @param string $p256dh   client public key (base64url)
     * @param string $auth     client auth secret (base64url)
     * @param array  $payload  message data, e.g. ['title' => ..., 'body' => ..., 'url' => ...]
     * @return int HTTP status code from the push service (0 on network error).
     *             404/410 mean the subscription is gone and should be deleted.
     */
    public function send($endpoint, $p256dh, $auth, array $payload, $ttl = 86400)
    {
        $body = $this->encryptPayload(
            json_encode($payload, JSON_UNESCAPED_UNICODE),
            self::base64UrlDecode($p256dh),
            self::base64UrlDecode($auth)
        );

        $jwt = $this->createVapidJwt($endpoint);

        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => [
                'Authorization: vapid t=' . $jwt . ', k=' . self::base64UrlEncode($this->vapidPublicKey),
                'Content-Encoding: aes128gcm',
                'Content-Type: application/octet-stream',
                'Content-Length: ' . strlen($body),
                'TTL: ' . (int) $ttl,
                'Urgency: normal',
            ],
        ]);
        curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);

        return $status;
    }

    /**
     * Send a payload to every subscription of a user.
     * Dead subscriptions (404/410) are removed from the database.
     *
     * @return int number of successfully delivered messages
     */
    public function sendToUser(PDO $conn, $userId, array $payload)
    {
        require_once __DIR__ . '/Schema.php';
        Schema::ensure($conn, 'push_subscriptions');

        $stmt = $conn->prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = :user_id");
        $stmt->execute(['user_id' => $userId]);
        $subscriptions = $stmt->fetchAll();

        $delivered = 0;
        foreach ($subscriptions as $sub) {
            try {
                $status = $this->send($sub['endpoint'], $sub['p256dh'], $sub['auth'], $payload);
            } catch (Exception $e) {
                continue;
            }

            if ($status === 404 || $status === 410) {
                $del = $conn->prepare("DELETE FROM push_subscriptions WHERE id = :id");
                $del->execute(['id' => $sub['id']]);
            } elseif ($status >= 200 && $status < 300) {
                $delivered++;
            }
        }

        return $delivered;
    }

    /**
     * RFC 8291 encryption (aes128gcm content coding, single record).
     *
     * $salt / $asPrivatePem are injectable for tests only.
     */
    public function encryptPayload($plaintext, $uaPublic, $authSecret, $salt = null, $asPrivatePem = null)
    {
        if (strlen($uaPublic) !== 65 || $uaPublic[0] !== "\x04") {
            throw new RuntimeException('Invalid client public key (p256dh)');
        }
        if (strlen($authSecret) !== 16) {
            throw new RuntimeException('Invalid client auth secret');
        }
        if (strlen($plaintext) > 3800) {
            throw new RuntimeException('Push payload too large');
        }

        $salt = $salt !== null ? $salt : random_bytes(16);

        // Ephemeral application server key pair
        if ($asPrivatePem === null) {
            $asKey = openssl_pkey_new([
                'curve_name' => 'prime256v1',
                'private_key_type' => OPENSSL_KEYTYPE_EC,
            ]);
        } else {
            $asKey = openssl_pkey_get_private($asPrivatePem);
        }
        if ($asKey === false) {
            throw new RuntimeException('Failed to create ephemeral EC key');
        }

        $details = openssl_pkey_get_details($asKey);
        $asPublic = "\x04"
            . str_pad($details['ec']['x'], 32, "\0", STR_PAD_LEFT)
            . str_pad($details['ec']['y'], 32, "\0", STR_PAD_LEFT);

        // ECDH shared secret
        $uaKey = openssl_pkey_get_public(self::publicPointToPem($uaPublic));
        if ($uaKey === false) {
            throw new RuntimeException('Failed to parse client public key');
        }
        $sharedSecret = openssl_pkey_derive($uaKey, $asKey, 32);
        if ($sharedSecret === false) {
            throw new RuntimeException('ECDH key derivation failed');
        }
        $sharedSecret = str_pad($sharedSecret, 32, "\0", STR_PAD_LEFT);

        // HKDF (RFC 8291 section 3.3/3.4)
        $keyInfo = "WebPush: info\x00" . $uaPublic . $asPublic;
        $ikm = hash_hkdf('sha256', $sharedSecret, 32, $keyInfo, $authSecret);
        $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\x00", $salt);
        $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\x00", $salt);

        // Single record: plaintext + 0x02 delimiter (last record)
        $tag = '';
        $ciphertext = openssl_encrypt($plaintext . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
        if ($ciphertext === false) {
            throw new RuntimeException('AES-GCM encryption failed');
        }

        // aes128gcm header: salt(16) | record size(4) | keyid length(1) | keyid(= AS public key, 65)
        return $salt . pack('N', 4096) . chr(65) . $asPublic . $ciphertext . $tag;
    }

    /**
     * RFC 8292 VAPID JWT (ES256), audience = origin of the push endpoint.
     */
    public function createVapidJwt($endpoint)
    {
        $parts = parse_url($endpoint);
        if (empty($parts['scheme']) || empty($parts['host'])) {
            throw new RuntimeException('Invalid push endpoint URL');
        }
        $aud = $parts['scheme'] . '://' . $parts['host'];
        if (isset($parts['port'])) {
            $aud .= ':' . $parts['port'];
        }

        $header = self::base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
        $claims = self::base64UrlEncode(json_encode([
            'aud' => $aud,
            'exp' => time() + 12 * 3600,
            'sub' => $this->subject,
        ]));
        $signingInput = $header . '.' . $claims;

        $pem = self::privateKeyToPem($this->vapidPrivateKey, $this->vapidPublicKey);
        if (!openssl_sign($signingInput, $derSignature, $pem, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('VAPID JWT signing failed');
        }

        return $signingInput . '.' . self::base64UrlEncode(self::derToRawSignature($derSignature));
    }

    /**
     * Generate a fresh VAPID key pair (both keys base64url encoded).
     */
    public static function generateVapidKeys()
    {
        $key = openssl_pkey_new([
            'curve_name' => 'prime256v1',
            'private_key_type' => OPENSSL_KEYTYPE_EC,
        ]);
        if ($key === false) {
            throw new RuntimeException('Failed to generate EC key pair');
        }
        $details = openssl_pkey_get_details($key);

        $public = "\x04"
            . str_pad($details['ec']['x'], 32, "\0", STR_PAD_LEFT)
            . str_pad($details['ec']['y'], 32, "\0", STR_PAD_LEFT);
        $private = str_pad($details['ec']['d'], 32, "\0", STR_PAD_LEFT);

        return [
            'publicKey' => self::base64UrlEncode($public),
            'privateKey' => self::base64UrlEncode($private),
        ];
    }

    // ---------- helpers ----------

    public static function base64UrlEncode($data)
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function base64UrlDecode($data)
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    }

    /**
     * Wrap a raw uncompressed P-256 point in a SubjectPublicKeyInfo PEM.
     */
    private static function publicPointToPem($point)
    {
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $point;
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    /**
     * Build an SEC1 ECPrivateKey PEM from raw private scalar + public point.
     */
    private static function privateKeyToPem($d, $publicPoint)
    {
        $der = "\x30\x77"
            . "\x02\x01\x01"                                        // version 1
            . "\x04\x20" . $d                                       // privateKey OCTET STRING (32)
            . "\xa0\x0a\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07"    // [0] prime256v1 OID
            . "\xa1\x44\x03\x42\x00" . $publicPoint;                // [1] publicKey BIT STRING (65)
        return "-----BEGIN EC PRIVATE KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END EC PRIVATE KEY-----\n";
    }

    /**
     * Convert a DER ECDSA signature to raw r||s (JWS format).
     */
    private static function derToRawSignature($der)
    {
        $offset = 2;                       // 0x30 SEQUENCE + length (single byte for P-256 sigs)
        $offset++;                         // 0x02 INTEGER
        $rLen = ord($der[$offset++]);
        $r = substr($der, $offset, $rLen);
        $offset += $rLen;
        $offset++;                         // 0x02 INTEGER
        $sLen = ord($der[$offset++]);
        $s = substr($der, $offset, $sLen);

        $r = str_pad(ltrim($r, "\0"), 32, "\0", STR_PAD_LEFT);
        $s = str_pad(ltrim($s, "\0"), 32, "\0", STR_PAD_LEFT);

        return $r . $s;
    }
}
