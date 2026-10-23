<?php
/**
 * What needs doing - one ordered list shared by Start ("Teraz" + "Potem dziś")
 * and the morning push, so both always say the same thing.
 *
 * Each item: kind (return|payment|task|idea), ref_key, title, meta, amount,
 * deadline, days, url, bucket ("today" | "week"), urgency (higher = first),
 * plus ids the app needs for one-tap actions.
 * Things snoozed ("Przypomnij później") are left out until their reminder.
 */

require_once __DIR__ . '/../config/Schema.php';

class TodayAgenda
{
    const LATE_AFTER_DAYS = 30;

    public static function build(PDO $conn, $userId)
    {
        Schema::ensurePurchases($conn);
        $today = date('Y-m-d');
        $skip = self::skippedKeys($conn, $userId);
        $items = [];

        // Returns, one per store (a parcel goes back together)
        $stmt = $conn->prepare("
            SELECT id, store, items, amount,
                   DATE_ADD(purchase_date, INTERVAL return_days DAY) AS deadline,
                   DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), :today) AS days
            FROM purchases
            WHERE user_id = :user_id AND status = 'kept' AND kept_confirmed = 0
              AND DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), :today2) BETWEEN 0 AND 7
            ORDER BY days ASC
        ");
        $stmt->execute(['user_id' => $userId, 'today' => $today, 'today2' => $today]);
        $groups = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $store = trim((string) $row['store']) ?: 'sklep';
            $key = 'return:' . mb_strtolower($store);
            if (!isset($groups[$key])) {
                $groups[$key] = ['store' => $store, 'ids' => [], 'purchases' => [], 'count' => 0, 'amount' => 0.0, 'days' => (int) $row['days'], 'deadline' => $row['deadline']];
            }
            $g = &$groups[$key];
            $g['ids'][] = (int) $row['id'];
            $g['purchases'][] = ['id' => (int) $row['id'], 'items' => $row['items'], 'amount' => (float) $row['amount']];
            $g['count']++;
            $g['amount'] += (float) $row['amount'];
            if ((int) $row['days'] < $g['days']) {
                $g['days'] = (int) $row['days'];
                $g['deadline'] = $row['deadline'];
            }
            unset($g);
        }
        foreach ($groups as $key => $g) {
            if (isset($skip[$key])) {
                continue;
            }
            $days = $g['days'];
            $items[] = [
                'kind' => 'return',
                'ref_key' => $key,
                'title' => 'Odeślij paczkę do ' . $g['store'],
                'store' => $g['store'],
                'meta' => $g['count'] . ' ' . self::plural($g['count'], 'rzecz', 'rzeczy', 'rzeczy'),
                'amount' => round($g['amount'], 2),
                'deadline' => $g['deadline'],
                'days' => $days,
                'late' => $days <= 1,
                'purchase_ids' => $g['ids'],
                'purchases' => $g['purchases'],
                'url' => '/purchases',
                'bucket' => $days <= 3 ? 'today' : 'week',
                'urgency' => [100, 90, 70, 60][$days] ?? 20,
            ];
        }

        // Payments waiting too long
        $stmt = $conn->prepare("
            SELECT id, brand, amount_gross, payment_status, date, DATEDIFF(:today, date) AS days_waiting
            FROM collaborations
            WHERE user_id = :user_id AND payment_status IN ('pending', 'overdue')
              AND (payment_status = 'overdue' OR date < DATE_SUB(:today2, INTERVAL " . self::LATE_AFTER_DAYS . " DAY))
            ORDER BY date ASC
            LIMIT 10
        ");
        $stmt->execute(['user_id' => $userId, 'today' => $today, 'today2' => $today]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $key = 'collab:' . $row['id'];
            if (isset($skip[$key])) {
                continue;
            }
            $days = (int) $row['days_waiting'];
            $items[] = [
                'kind' => 'payment',
                'ref_key' => $key,
                'title' => $row['brand'] . ' — upomnij się o płatność',
                'brand' => $row['brand'],
                'meta' => 'czeka ' . $days . ' dni',
                'amount' => (float) $row['amount_gross'],
                'deadline' => null,
                'days' => $days,
                'late' => true,
                'collab' => ['id' => (int) $row['id'], 'brand' => $row['brand'], 'payment_status' => $row['payment_status']],
                'url' => '/collaborations/' . $row['id'],
                'bucket' => 'today',
                'urgency' => 80,
            ];
        }

        // Tasks from "Zrzuć tutaj"
        try {
            Schema::ensure($conn, 'tasks');
            $stmt = $conn->prepare("
                SELECT id, title, due_date, DATEDIFF(due_date, :today) AS days
                FROM tasks
                WHERE user_id = :user_id AND done_at IS NULL AND (due_date IS NULL OR due_date <= :soon)
                ORDER BY due_date IS NULL, due_date ASC, id ASC
                LIMIT 20
            ");
            $stmt->execute(['user_id' => $userId, 'today' => $today, 'soon' => date('Y-m-d', strtotime('+7 days'))]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $key = 'task:' . $row['id'];
                if (isset($skip[$key])) {
                    continue;
                }
                $days = $row['due_date'] === null ? null : (int) $row['days'];
                $items[] = [
                    'kind' => 'task',
                    'ref_key' => $key,
                    'title' => $row['title'],
                    'meta' => $days === null ? 'bez terminu' : ($days < 0 ? 'po terminie' : ($days === 0 ? 'na dziś' : ($days === 1 ? 'na jutro' : 'za ' . $days . ' dni'))),
                    'amount' => null,
                    'deadline' => $row['due_date'],
                    'days' => $days,
                    'late' => $days !== null && $days < 0,
                    'task_id' => (int) $row['id'],
                    'url' => '/dashboard',
                    'bucket' => $days === null || $days <= 0 ? 'today' : 'week',
                    'urgency' => $days === null ? 30 : ($days < 0 ? 75 : ($days === 0 ? 65 : 25)),
                ];
            }
        } catch (Exception $e) {
            // tasks table optional
        }

        // Reels planned for today ("Nagram dziś"); a plan not recorded yesterday carries over
        try {
            Schema::ensureColumn($conn, 'ideas', 'planned_for');
            $stmt = $conn->prepare("
                SELECT id, title, planned_for,
                       CASE WHEN content IS NULL OR content = '' THEN 0
                            ELSE LENGTH(TRIM(content)) - LENGTH(REPLACE(TRIM(content), ' ', '')) + 1 END AS words
                FROM ideas
                WHERE user_id = :user_id AND status = 'draft' AND planned_for IS NOT NULL AND planned_for <= :today
                ORDER BY planned_for ASC, created_at DESC
                LIMIT 10
            ");
            $stmt->execute(['user_id' => $userId, 'today' => $today]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $key = 'idea:' . $row['id'];
                if (isset($skip[$key])) {
                    continue;
                }
                $seconds = (int) round((int) $row['words'] / 2.3);
                $length = $seconds > 0 ? '~' . intdiv($seconds, 60) . ':' . str_pad((string) ($seconds % 60), 2, '0', STR_PAD_LEFT) : 'bez scenariusza';
                $carried = $row['planned_for'] < $today;
                $items[] = [
                    'kind' => 'idea',
                    'ref_key' => $key,
                    'title' => 'Nagraj: ' . $row['title'],
                    'meta' => $length . ($carried ? ' · zaplanowane wcześniej' : ' · na dziś'),
                    'amount' => null,
                    'deadline' => $row['planned_for'],
                    'days' => null,
                    'late' => $carried,
                    'idea_id' => (int) $row['id'],
                    'url' => '/ideas/' . $row['id'] . ($seconds > 0 ? '?prompter=1' : ''),
                    'bucket' => 'today',
                    'urgency' => $carried ? 55 : 50,
                ];
            }
        } catch (Exception $e) {
            // ideas table optional
        }

        usort($items, function ($a, $b) {
            return $b['urgency'] <=> $a['urgency'];
        });
        return $items;
    }

    /** ref_keys snoozed for later (done things drop out by their own status). */
    private static function skippedKeys(PDO $conn, $userId)
    {
        $skip = [];
        try {
            Schema::ensure($conn, 'reminders');
            $stmt = $conn->prepare("SELECT ref_key FROM reminders WHERE user_id = :user_id AND sent_at IS NULL AND remind_at > :now");
            $stmt->execute(['user_id' => $userId, 'now' => date('Y-m-d H:i:s')]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $key) {
                $skip[$key] = true;
            }
        } catch (Exception $e) {
            // optional tables
        }
        return $skip;
    }

    public static function plural($n, $one, $few, $many)
    {
        if ($n === 1) {
            return $one;
        }
        $d = $n % 10;
        $dd = $n % 100;
        return ($d >= 2 && $d <= 4 && ($dd < 12 || $dd > 14)) ? $few : $many;
    }
}
