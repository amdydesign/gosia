<?php
/**
 * "o 19:00 przypomnij mi o powerbanku": a task typed into "Zrzuć tutaj" with a time
 * waits on Start ("przypomnę o 19:00") and a push comes at that time (cron/send_reminders.php).
 */

require_once __DIR__ . '/../config/Schema.php';

/** @param string $remindAt "YYYY-MM-DD HH:MM" (already checked, in the future) */
function setTaskReminder(PDO $conn, $userId, $taskId, $title, $remindAt)
{
    Schema::ensure($conn, 'reminders');
    $refKey = 'task:' . (int) $taskId;
    $conn->prepare("DELETE FROM reminders WHERE user_id = :user_id AND ref_key = :ref_key AND sent_at IS NULL")
        ->execute(['user_id' => $userId, 'ref_key' => $refKey]);
    $conn->prepare("
        INSERT INTO reminders (user_id, ref_key, title, url, remind_at)
        VALUES (:user_id, :ref_key, :title, '/dashboard', :remind_at)
    ")->execute([
        'user_id' => $userId,
        'ref_key' => $refKey,
        'title' => mb_substr((string) $title, 0, 255),
        'remind_at' => $remindAt . ':00',
    ]);
}
