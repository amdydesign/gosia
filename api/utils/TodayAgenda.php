<?php
/**
 * What needs doing - one ordered list shared by Start ("Teraz" + "Potem dziś")
 * and the morning push, so both always say the same thing.
 *
 * Each item: kind (return|refund|payment|publish|sign|term|inbox|task|idea), ref_key,
 * title, meta, amount, deadline, days, url, bucket ("today" | "week"),
 * urgency (higher = first), plus ids the app needs for one-tap actions.
 * Things snoozed ("Później") stay listed with snoozed_until, but leave "today"
 * (bucket "later" / "snoozed") until their reminder.
 */

require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../purchases/helpers.php';
require_once __DIR__ . '/../collaborations/helpers.php';

class TodayAgenda
{
    const LATE_AFTER_DAYS = 30;

    public static function build(PDO $conn, $userId)
    {
        Schema::ensurePurchases($conn);
        Schema::ensureCollaborations($conn);
        $today = date('Y-m-d');
        $skip = self::skippedKeys($conn, $userId);
        $timesToday = self::timesToday($conn, $userId);
        $items = [];

        self::returns($conn, $userId, $today, $items);
        self::refunds($conn, $userId, $today, $items);
        self::payments($conn, $userId, $today, $items);
        self::publishing($conn, $userId, $today, $items);
        self::documents($conn, $userId, $today, $items);
        self::inbox($conn, $userId, $items);
        self::tasks($conn, $userId, $today, $items);
        self::ideas($conn, $userId, $today, $items);

        // Snoozed ("Później"): still listed, but never "Teraz" until the reminder time.
        // Later today -> bucket "later" (still counts for today); another day -> "snoozed".
        // A time today (reminder, also one that already rang) orders the day list: the next one is "Teraz".
        foreach ($items as &$item) {
            if (isset($skip[$item['ref_key']])) {
                $until = $skip[$item['ref_key']];
                $item['snoozed_until'] = $until;
                $item['bucket'] = substr($until, 0, 10) === $today ? 'later' : 'snoozed';
            }
            $at = $item['bucket'] === 'later' ? $item['snoozed_until'] : ($item['bucket'] === 'today' ? ($timesToday[$item['ref_key']] ?? null) : null);
            if ($at) {
                $item['time'] = substr($at, 11, 5);
                // set for today = it is for today, not "po terminie"
                if ($item['kind'] === 'task') {
                    $item['meta'] = 'na dziś';
                    $item['late'] = false;
                }
            }
        }
        unset($item);

        usort($items, function ($a, $b) {
            return $b['urgency'] <=> $a['urgency'];
        });
        return $items;
    }

    /** Returns, one per store (a parcel goes back together). */
    private static function returns(PDO $conn, $userId, $today, array &$items)
    {
        $stmt = $conn->prepare("
            SELECT id, store, items, amount,
                   " . PURCHASE_DEADLINE_SQL . " AS deadline,
                   DATEDIFF(" . PURCHASE_DEADLINE_SQL . ", :today) AS days
            FROM purchases
            WHERE user_id = :user_id AND status = 'kept' AND kept_confirmed = 0
              AND DATEDIFF(" . PURCHASE_DEADLINE_SQL . ", :today2) BETWEEN 0 AND 7
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
                // "jak ostatnio": what sending a parcel to this shop cost last time
                'return_cost' => self::lastReturnCost($conn, $userId, $g['store']),
                'url' => '/purchases',
                'bucket' => $days <= 3 ? 'today' : 'week',
                'urgency' => [100, 90, 70, 60][$days] ?? 20,
            ];
        }
    }

    /** Sent back 14+ days ago and the money is not confirmed yet: "Sprawdź konto". */
    private static function refunds(PDO $conn, $userId, $today, array &$items)
    {
        $stmt = $conn->prepare("
            SELECT id, store, returned_amount, return_cost, DATE(returned_at) AS sent
            FROM purchases
            WHERE user_id = :user_id AND status IN ('returned', 'partial') AND refunded_at IS NULL
              AND returned_amount > 0 AND returned_at IS NOT NULL
              AND DATE(returned_at) <= DATE_SUB(:today, INTERVAL " . PURCHASE_REFUND_CHECK_DAYS . " DAY)
            ORDER BY returned_at ASC
        ");
        $stmt->execute(['user_id' => $userId, 'today' => $today]);
        $groups = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $store = trim((string) $row['store']) ?: 'sklep';
            $key = 'refund:' . mb_strtolower($store);
            if (!isset($groups[$key])) {
                $groups[$key] = ['store' => $store, 'ids' => [], 'amount' => 0.0, 'sent' => $row['sent']];
            }
            $groups[$key]['ids'][] = (int) $row['id'];
            $groups[$key]['amount'] += max(0, (float) $row['returned_amount'] - (float) $row['return_cost']);
        }
        foreach ($groups as $key => $g) {
            $waiting = (int) round((strtotime($today) - strtotime($g['sent'])) / 86400);
            $items[] = [
                'kind' => 'refund',
                'ref_key' => $key,
                'title' => 'Sprawdź konto: zwrot z ' . $g['store'],
                'store' => $g['store'],
                'meta' => 'odesłane ' . $waiting . ' dni temu',
                'amount' => round($g['amount'], 2),
                'deadline' => null,
                'days' => $waiting,
                'late' => $waiting > 21,
                'purchase_ids' => $g['ids'],
                'url' => '/purchases',
                'bucket' => 'today',
                'urgency' => $waiting > 21 ? 68 : 52,
            ];
        }
    }

    /** Unpaid after the payment term (publish / work date + N days, 30 by default). */
    private static function payments(PDO $conn, $userId, $today, array &$items)
    {
        $stmt = $conn->prepare("
            SELECT id, brand, amount_gross, payment_status, date, " . COLLAB_DUE_SQL . " AS due,
                   DATEDIFF(:today, " . COLLAB_DUE_SQL . ") AS days_late, DATEDIFF(:today2, date) AS days_waiting
            FROM collaborations
            WHERE user_id = :user_id AND payment_status IN ('pending', 'overdue')
              AND (payment_status = 'overdue' OR " . COLLAB_DUE_SQL . " < :today3)
            ORDER BY due ASC
            LIMIT 10
        ");
        $stmt->execute(['user_id' => $userId, 'today' => $today, 'today2' => $today, 'today3' => $today]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $late = max(0, (int) $row['days_late']);
            $items[] = [
                'kind' => 'payment',
                'ref_key' => 'collab:' . $row['id'],
                'title' => $row['brand'] . ' — upomnij się o płatność',
                'brand' => $row['brand'],
                'meta' => $late > 0 ? 'termin minął ' . $late . ' ' . self::plural($late, 'dzień', 'dni', 'dni') . ' temu' : 'czeka ' . (int) $row['days_waiting'] . ' dni',
                'amount' => (float) $row['amount_gross'],
                'deadline' => $row['due'],
                'days' => (int) $row['days_waiting'],
                'late' => true,
                'collab' => ['id' => (int) $row['id'], 'brand' => $row['brand'], 'payment_status' => $row['payment_status']],
                'url' => '/collaborations/' . $row['id'],
                'bucket' => 'today',
                'urgency' => 80,
            ];
        }
    }

    /** "Opublikuj do ...": deadline of the content, from the form or the contract. */
    private static function publishing(PDO $conn, $userId, $today, array &$items)
    {
        $stmt = $conn->prepare("
            SELECT id, brand, publish_by, DATEDIFF(publish_by, :today) AS days
            FROM collaborations
            WHERE user_id = :user_id AND publish_by IS NOT NULL AND published_at IS NULL
              AND publish_by <= DATE_ADD(:today2, INTERVAL 7 DAY)
            ORDER BY publish_by ASC
            LIMIT 10
        ");
        $stmt->execute(['user_id' => $userId, 'today' => $today, 'today2' => $today]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $days = (int) $row['days'];
            $items[] = [
                'kind' => 'publish',
                'ref_key' => 'publish:' . $row['id'],
                'title' => 'Opublikuj dla ' . $row['brand'],
                'brand' => $row['brand'],
                'meta' => $days < 0 ? 'termin minął' : ($days === 0 ? 'termin dziś' : ($days === 1 ? 'termin jutro' : 'za ' . $days . ' dni')),
                'amount' => null,
                'deadline' => $row['publish_by'],
                'days' => $days,
                'late' => $days < 0,
                'collab_id' => (int) $row['id'],
                'url' => '/collaborations/' . $row['id'],
                'bucket' => $days <= 2 ? 'today' : 'week',
                'urgency' => $days < 0 ? 85 : ([82, 72, 62][$days] ?? 22),
            ];
        }
    }

    /** Contracts waiting for a signature, and dates from contract terms (exclusivity, licence). */
    private static function documents(PDO $conn, $userId, $today, array &$items)
    {
        try {
            require_once __DIR__ . '/../documents/helpers.php';
            documentsEnsureSchema($conn);
        } catch (Exception $e) {
            return; // archive not set up
        }

        $stmt = $conn->prepare("
            SELECT id, title, DATEDIFF(:today, DATE(created_at)) AS waiting
            FROM documents WHERE user_id = :user_id AND status = 'to_sign'
            ORDER BY created_at ASC LIMIT 10
        ");
        $stmt->execute(['user_id' => $userId, 'today' => $today]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $waiting = (int) $row['waiting'];
            $items[] = [
                'kind' => 'sign',
                'ref_key' => 'sign:' . $row['id'],
                'title' => 'Podpisz: ' . $row['title'],
                'meta' => $waiting === 0 ? 'dodane dziś' : 'czeka ' . $waiting . ' ' . self::plural($waiting, 'dzień', 'dni', 'dni'),
                'amount' => null,
                'deadline' => null,
                'days' => $waiting,
                'late' => $waiting > 7,
                'document_id' => (int) $row['id'],
                'url' => '/documents?doc=' . $row['id'],
                'bucket' => $waiting >= 2 ? 'today' : 'week',
                'urgency' => $waiting > 7 ? 58 : 45,
            ];
        }

        $stmt = $conn->prepare("SELECT id, title, brand, counterparty, collaboration_id, terms FROM documents WHERE user_id = :user_id AND terms IS NOT NULL");
        $stmt->execute(['user_id' => $userId]);
        $dismissed = self::dismissedTerms($conn, $userId);
        $soon = date('Y-m-d', strtotime($today . ' +7 days'));
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $doc) {
            $terms = documentsTerms($doc['terms']);
            $who = trim((string) $doc['brand']) ?: (documentsShortName($doc['counterparty']) ?: $doc['title']);
            $dates = [
                'exclusivity' => $terms['exclusivity_until'] ?? null,
                'license' => $terms['license_until'] ?? null,
                // a contract not tied to a collaboration still has its own publish date
                'publish' => empty($doc['collaboration_id']) ? ($terms['publish_by'] ?? null) : null,
            ];
            foreach ($dates as $type => $date) {
                if (!$date || $date < $today || $date > $soon) {
                    continue;
                }
                $key = 'term:' . $doc['id'] . ':' . $type . ':' . $date;
                if (isset($dismissed[$key])) {
                    continue;
                }
                $days = (int) round((strtotime($date) - strtotime($today)) / 86400);
                $when = $days === 0 ? 'dziś' : ($days === 1 ? 'jutro' : date('d.m', strtotime($date)));
                $texts = [
                    'exclusivity' => ['Koniec wyłączności z ' . $who . ' — ' . $when, 'potem możesz brać współprace z konkurencją' . (!empty($terms['exclusivity_scope']) ? ' (' . $terms['exclusivity_scope'] . ')' : '')],
                    'license' => ['Kończy się licencja dla ' . $who . ' — ' . $when, 'potem marka nie może używać Twojego wizerunku'],
                    'publish' => ['Opublikuj dla ' . $who . ' — ' . $when, !empty($terms['deliverables']) ? $terms['deliverables'] : 'termin z umowy'],
                ];
                $items[] = [
                    'kind' => 'term',
                    'term_type' => $type,
                    'ref_key' => $key,
                    'title' => $texts[$type][0],
                    'meta' => $texts[$type][1],
                    'amount' => null,
                    'deadline' => $date,
                    'days' => $days,
                    'late' => false,
                    'document_id' => (int) $doc['id'],
                    'url' => '/documents?doc=' . $doc['id'],
                    // a publish deadline is work to do; the others are just good to know
                    'bucket' => $type === 'publish' && $days <= 2 ? 'today' : 'week',
                    'urgency' => $type === 'publish' ? ([82, 72, 62][$days] ?? 22) : 15,
                ];
            }
        }
    }

    /** Screens shared from the iPhone (or dropped in) that still need a form. */
    private static function inbox(PDO $conn, $userId, array &$items)
    {
        try {
            require_once __DIR__ . '/../inbox/helpers.php';
            $open = inboxOpenItems($conn, $userId);
        } catch (Exception $e) {
            return;
        }
        $labels = ['purchase' => 'zakup — AI uzupełni formularz', 'collaboration' => 'współpraca — AI uzupełni formularz', 'document' => 'dokument do archiwum'];
        foreach ($open as $row) {
            $amount = $row['data']['amount_gross'] ?? ($row['data']['amount'] ?? null);
            $items[] = [
                'kind' => 'inbox',
                'ref_key' => 'inbox:' . $row['id'],
                'title' => $row['kind'] ? 'Ze screena: ' . $row['title'] : 'Nowy screen do sprawdzenia',
                'meta' => $labels[$row['kind']] ?? 'otwórz i zdecyduj, co to',
                'amount' => $amount !== null ? (float) $amount : null,
                'deadline' => null,
                'days' => null,
                'late' => false,
                'inbox' => $row,
                'url' => '/dashboard',
                'bucket' => 'today',
                'urgency' => 58,
            ];
        }
    }

    /** Tasks from "Zrzuć tutaj". */
    private static function tasks(PDO $conn, $userId, $today, array &$items)
    {
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
                $days = $row['due_date'] === null ? null : (int) $row['days'];
                $meta = $days === null ? 'bez terminu' : ($days < 0 ? 'po terminie' : ($days === 0 ? 'na dziś' : ($days === 1 ? 'na jutro' : 'za ' . $days . ' dni')));
                $items[] = [
                    'kind' => 'task',
                    'ref_key' => 'task:' . $row['id'],
                    'title' => $row['title'],
                    'meta' => $meta,
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
    }

    /** Reels planned for today ("Nagram dziś"); a plan not recorded yesterday carries over. */
    private static function ideas(PDO $conn, $userId, $today, array &$items)
    {
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
                $seconds = (int) round((int) $row['words'] / 2.3);
                $length = $seconds > 0 ? '~' . intdiv($seconds, 60) . ':' . str_pad((string) ($seconds % 60), 2, '0', STR_PAD_LEFT) : 'bez scenariusza';
                $carried = $row['planned_for'] < $today;
                $items[] = [
                    'kind' => 'idea',
                    'ref_key' => 'idea:' . $row['id'],
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
    }

    /** ref_key => remind_at of things snoozed for later (done things drop out by their own status). */
    private static function skippedKeys(PDO $conn, $userId)
    {
        $skip = [];
        try {
            Schema::ensure($conn, 'reminders');
            $stmt = $conn->prepare("SELECT ref_key, remind_at FROM reminders WHERE user_id = :user_id AND sent_at IS NULL AND remind_at > :now");
            $stmt->execute(['user_id' => $userId, 'now' => date('Y-m-d H:i:s')]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $skip[$row['ref_key']] = $row['remind_at'];
            }
        } catch (Exception $e) {
            // optional tables
        }
        return $skip;
    }

    /** ref_key => latest reminder time today that already passed (rang or not). */
    private static function timesToday(PDO $conn, $userId)
    {
        $times = [];
        try {
            Schema::ensure($conn, 'reminders');
            $stmt = $conn->prepare("
                SELECT ref_key, MAX(remind_at) AS at FROM reminders
                WHERE user_id = :user_id AND remind_at >= :today AND remind_at <= :now
                GROUP BY ref_key
            ");
            $stmt->execute(['user_id' => $userId, 'today' => date('Y-m-d 00:00:00'), 'now' => date('Y-m-d H:i:s')]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $times[$row['ref_key']] = $row['at'];
            }
        } catch (Exception $e) {
            // optional tables
        }
        return $times;
    }

    /** Contract dates already acknowledged ("OK" on Start) - ref_key => true. */
    private static function dismissedTerms(PDO $conn, $userId)
    {
        try {
            Schema::ensure($conn, 'done_log');
            $stmt = $conn->prepare("SELECT ref_key FROM done_log WHERE user_id = :user_id AND ref_key LIKE 'term:%'");
            $stmt->execute(['user_id' => $userId]);
            return array_fill_keys($stmt->fetchAll(PDO::FETCH_COLUMN), true);
        } catch (Exception $e) {
            return [];
        }
    }

    private static function lastReturnCost(PDO $conn, $userId, $store)
    {
        $stmt = $conn->prepare("
            SELECT return_cost FROM purchases
            WHERE user_id = :user_id AND LOWER(store) = LOWER(:store) AND return_cost IS NOT NULL
            ORDER BY returned_at DESC, id DESC LIMIT 1
        ");
        $stmt->execute(['user_id' => $userId, 'store' => $store]);
        $cost = $stmt->fetchColumn();
        return $cost === false ? null : (float) $cost;
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
