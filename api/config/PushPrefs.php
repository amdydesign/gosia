<?php
/**
 * Notification preferences per user (app_settings.push_prefs, JSON).
 * Times are Polish local "HH:MM".
 */

require_once __DIR__ . '/Schema.php';

class PushPrefs
{
    const DEFAULTS = [
        'summary' => true,          // "Na dziś" every morning
        'summary_time' => '08:30',
        'returns' => true,          // return deadlines (D-1 and the last day; D-3 too without the summary)
        'payments' => true,         // overdue payments, once a week
        'ideas' => true,            // ideas to record, Mon + Thu at ideas_time
        'ideas_time' => '17:00',
        'quiet_from' => '21:30',    // nothing is sent in quiet hours - it waits until they end
        'quiet_to' => '08:00',
    ];

    public static function load(PDO $conn, $userId)
    {
        Schema::ensure($conn, 'app_settings');
        $stmt = $conn->prepare("SELECT value FROM app_settings WHERE user_id = :user_id AND name = 'push_prefs'");
        $stmt->execute(['user_id' => $userId]);
        $saved = json_decode((string) $stmt->fetchColumn(), true);
        return self::sanitize(is_array($saved) ? $saved : []);
    }

    public static function save(PDO $conn, $userId, array $input)
    {
        $prefs = self::sanitize(array_merge(self::load($conn, $userId), $input));
        $stmt = $conn->prepare("
            INSERT INTO app_settings (user_id, name, value) VALUES (:user_id, 'push_prefs', :value)
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        ");
        $stmt->execute(['user_id' => $userId, 'value' => json_encode($prefs)]);
        return $prefs;
    }

    public static function sanitize(array $input)
    {
        $out = [];
        foreach (self::DEFAULTS as $key => $default) {
            $value = $input[$key] ?? $default;
            if (is_bool($default)) {
                $out[$key] = (bool) $value;
            } else {
                $out[$key] = preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', (string) $value) ? (string) $value : $default;
            }
        }
        return $out;
    }

    /** True when "HH:MM" now falls inside the quiet window (which may wrap past midnight). */
    public static function isQuiet(array $prefs, $now = null)
    {
        $t = ($now ?: new DateTime())->format('H:i');
        $from = $prefs['quiet_from'];
        $to = $prefs['quiet_to'];
        if ($from === $to) {
            return false;
        }
        return $from < $to ? ($t >= $from && $t < $to) : ($t >= $from || $t < $to);
    }
}
