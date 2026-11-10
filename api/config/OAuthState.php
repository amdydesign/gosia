<?php
/**
 * OAuth "state" for connecting social accounts: signed with JWT_SECRET, bound to
 * the logged-in user and valid for 15 minutes - nothing is stored on the server.
 */

class OAuthState
{
    const TTL = 900;

    public static function make($userId)
    {
        $data = (int) $userId . '.' . (time() + self::TTL) . '.' . bin2hex(random_bytes(8));
        return $data . '.' . self::sign($data);
    }

    public static function valid($state, $userId)
    {
        $parts = explode('.', (string) $state);
        if (count($parts) !== 4) {
            return false;
        }
        list($uid, $expires, $nonce, $signature) = $parts;
        if (!hash_equals(self::sign($uid . '.' . $expires . '.' . $nonce), $signature)) {
            return false;
        }
        return (int) $uid === (int) $userId && (int) $expires >= time();
    }

    private static function sign($data)
    {
        return hash_hmac('sha256', 'oauth-state|' . $data, (string) ($_ENV['JWT_SECRET'] ?? ''));
    }
}
