<?php
/**
 * "Dziś ogarnięte": remembers what was finished (return sent, payment in,
 * reel recorded, task done) so Start can show progress for the day.
 *
 * ref_key identifies the thing: "purchase:12", "collab:5", "idea:3", "task:9".
 */

require_once __DIR__ . '/../config/Schema.php';

class DoneLog
{
    public static function record(PDO $conn, $userId, $refKey, $title)
    {
        try {
            Schema::ensure($conn, 'done_log');
            // Toggling back and forth on the same day must not count twice
            self::forget($conn, $userId, $refKey);
            $stmt = $conn->prepare("INSERT INTO done_log (user_id, ref_key, title, done_at) VALUES (:user_id, :ref_key, :title, :done_at)");
            $stmt->execute([
                'user_id' => $userId,
                'ref_key' => $refKey,
                'title' => mb_substr((string) $title, 0, 255),
                'done_at' => date('Y-m-d H:i:s'),
            ]);
        } catch (Exception $e) {
            // progress counter is a nicety - never break the real action
        }
    }

    /** Undo (e.g. "Cofnij" after marking paid): drop today's entry. */
    public static function forget(PDO $conn, $userId, $refKey)
    {
        try {
            Schema::ensure($conn, 'done_log');
            $stmt = $conn->prepare("DELETE FROM done_log WHERE user_id = :user_id AND ref_key = :ref_key AND done_at >= :today");
            $stmt->execute(['user_id' => $userId, 'ref_key' => $refKey, 'today' => date('Y-m-d 00:00:00')]);
        } catch (Exception $e) {
            // ignore
        }
    }

    /** @return array [['ref_key' => ..., 'title' => ..., 'done_at' => ...], ...] finished today */
    public static function today(PDO $conn, $userId)
    {
        Schema::ensure($conn, 'done_log');
        $stmt = $conn->prepare("
            SELECT ref_key, title, done_at FROM done_log
            WHERE user_id = :user_id AND done_at >= :today
            ORDER BY done_at DESC
        ");
        $stmt->execute(['user_id' => $userId, 'today' => date('Y-m-d 00:00:00')]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
