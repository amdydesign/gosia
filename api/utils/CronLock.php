<?php
/**
 * One run at a time: a cron job that is still working when the next one starts
 * (slow push service, big backup) must not run twice - that would repeat pushes.
 *
 * MySQL named lock, held by this connection: it is freed by release(), and by the
 * server itself when the script ends or dies. If the lock cannot be checked at all,
 * the job runs anyway (as before).
 */

class CronLock
{
    /** True when this run may go ahead; false when another run holds the lock. */
    public static function acquire(PDO $conn, $name)
    {
        try {
            $stmt = $conn->prepare("SELECT GET_LOCK(:name, 0)");
            $stmt->execute(['name' => self::name($conn, $name)]);
            $got = $stmt->fetchColumn();
            $stmt->closeCursor();
            if ($got !== null && (int) $got === 0) {
                return false;
            }
            register_shutdown_function(function () use ($conn, $name) {
                CronLock::release($conn, $name);
            });
            return true;
        } catch (Exception $e) {
            error_log('CronLock: ' . $e->getMessage());
            return true;
        }
    }

    public static function release(PDO $conn, $name)
    {
        try {
            $stmt = $conn->prepare("SELECT RELEASE_LOCK(:name)");
            $stmt->execute(['name' => self::name($conn, $name)]);
            $stmt->closeCursor();
        } catch (Exception $e) {
            // the connection is gone - so is the lock
        }
    }

    /** Lock names are shared by the whole MySQL server (other sites too) - add this database's mark. */
    private static function name(PDO $conn, $name)
    {
        static $mark = null;
        if ($mark === null) {
            $mark = substr(md5((string) ($_ENV['DB_NAME'] ?? '') . '|' . (string) ($_ENV['DB_HOST'] ?? '')), 0, 8);
        }
        return 'gosia_cron_' . $name . '_' . $mark;
    }
}
