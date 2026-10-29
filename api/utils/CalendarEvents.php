<?php
/**
 * "Kalendarz": everything with a date, also far ahead - tasks, reminders,
 * payments due, publish dates, return deadlines, contract dates, planned reels, jobs.
 *
 * Each event: date (YYYY-MM-DD), time (HH:MM|null), kind, title, meta, amount, url,
 * tone: "late" (red) | "money" (payment) | "deadline" (return / publish) | "plan" | "info".
 * Only things still to do - paid, sent back or published drop out.
 */

require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../purchases/helpers.php';
require_once __DIR__ . '/../collaborations/helpers.php';

class CalendarEvents
{
    public static function between(PDO $conn, $userId, $from, $to)
    {
        Schema::ensurePurchases($conn);
        Schema::ensureCollaborations($conn);
        $today = date('Y-m-d');
        $events = [];
        $p = ['user_id' => $userId, 'from' => $from, 'to' => $to];

        // Pending reminders: their own entry, or the time of a task
        $taskTimes = [];
        try {
            Schema::ensure($conn, 'reminders');
            $stmt = $conn->prepare("
                SELECT ref_key, title, url, remind_at FROM reminders
                WHERE user_id = :user_id AND sent_at IS NULL AND remind_at > :now
            ");
            $stmt->execute(['user_id' => $userId, 'now' => date('Y-m-d H:i:s')]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
                if (strpos($r['ref_key'], 'task:') === 0) {
                    $taskTimes[$r['ref_key']] = $r['remind_at'];
                    continue;
                }
                $day = substr($r['remind_at'], 0, 10);
                if ($day < $from || $day > $to) {
                    continue;
                }
                $events[] = self::event($day, substr($r['remind_at'], 11, 5), 'reminder', $r['title'], 'przypomnienie', null, $r['url'] ?: '/dashboard', 'plan');
            }
        } catch (Exception $e) {
            // optional table
        }

        try {
            Schema::ensure($conn, 'tasks');
            $stmt = $conn->prepare("
                SELECT id, title, due_date FROM tasks
                WHERE user_id = :user_id AND done_at IS NULL AND due_date BETWEEN :from AND :to
            ");
            $stmt->execute($p);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $t) {
                $at = $taskTimes['task:' . $t['id']] ?? null;
                $day = $at ? substr($at, 0, 10) : $t['due_date'];
                $late = $day < $today;
                $events[] = self::event($day, $at ? substr($at, 11, 5) : null, 'task', $t['title'], $late ? 'po terminie' : 'zadanie', null, '/dashboard', $late ? 'late' : 'plan', ['task_id' => (int) $t['id']]);
            }
        } catch (Exception $e) {
            // optional table
        }

        // Payments: when the money should come in
        $stmt = $conn->prepare("
            SELECT id, brand, amount_gross, published_at, deliverables, " . COLLAB_DUE_SQL . " AS due FROM collaborations
            WHERE user_id = :user_id AND payment_status IN ('pending', 'overdue') AND (stage IS NULL OR stage <> 'brief')
              AND " . COLLAB_DUE_SQL . " BETWEEN :from AND :to
        ");
        $stmt->execute($p);
        require_once __DIR__ . '/../collaborations/helpers.php';
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $c) {
            if (collabHasWorkLeft($c)) {
                continue; // the payment term starts when the work is published
            }
            $late = $c['due'] < $today;
            $events[] = self::event($c['due'], null, 'payment', 'Płatność: ' . $c['brand'], $late ? 'termin minął — upomnij się' : 'termin płatności', (float) $c['amount_gross'], '/collaborations/' . $c['id'], $late ? 'late' : 'money');
        }

        // Publish by
        $stmt = $conn->prepare("
            SELECT id, brand, publish_by FROM collaborations
            WHERE user_id = :user_id AND publish_by BETWEEN :from AND :to AND published_at IS NULL
        ");
        $stmt->execute($p);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $c) {
            $late = $c['publish_by'] < $today;
            $events[] = self::event($c['publish_by'], null, 'publish', 'Opublikuj dla ' . $c['brand'], $late ? 'termin minął' : 'termin publikacji', null, '/collaborations/' . $c['id'], $late ? 'late' : 'deadline');
        }

        // From a brief: each thing to make that has its own date ("Reels IG 1/2")
        $stmt = $conn->prepare("SELECT id, brand, deliverables FROM collaborations WHERE user_id = :user_id AND deliverables IS NOT NULL AND published_at IS NULL");
        $stmt->execute(['user_id' => $userId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $c) {
            foreach (json_decode((string) $c['deliverables'], true) ?: [] as $d) {
                $due = $d['due'] ?? null;
                if (!$due || $due < $from || $due > $to || (int) $d['done'] >= (int) $d['count']) {
                    continue;
                }
                $late = $due < $today;
                $events[] = self::event($due, null, 'publish', $c['brand'] . ': ' . $d['label'], ((int) $d['done']) . '/' . ((int) $d['count']) . ($late ? ' · termin minął' : ''), null, '/collaborations/' . $c['id'], $late ? 'late' : 'deadline');
            }
        }

        // Jobs planned ahead (the collaboration's date)
        $stmt = $conn->prepare("
            SELECT id, brand, date, amount_gross FROM collaborations
            WHERE user_id = :user_id AND date BETWEEN :from AND :to AND date >= :today AND published_at IS NULL
        ");
        $stmt->execute($p + ['today' => $today]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $c) {
            $events[] = self::event($c['date'], null, 'collab', 'Współpraca: ' . $c['brand'], 'zlecenie', (float) $c['amount_gross'] ?: null, '/collaborations/' . $c['id'], 'plan');
        }

        // Last day to send a return, one per shop and day
        $stmt = $conn->prepare("
            SELECT store, " . PURCHASE_DEADLINE_SQL . " AS deadline, COUNT(*) AS n, SUM(amount) AS amount FROM purchases
            WHERE user_id = :user_id AND status = 'kept' AND kept_confirmed = 0
              AND " . PURCHASE_DEADLINE_SQL . " BETWEEN :from AND :to AND " . PURCHASE_DEADLINE_SQL . " >= :today
            GROUP BY store, deadline
        ");
        $stmt->execute($p + ['today' => $today]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $n = (int) $r['n'];
            $events[] = self::event($r['deadline'], null, 'return', 'Ostatni dzień zwrotu: ' . (trim((string) $r['store']) ?: 'sklep'), $n . ' ' . ($n === 1 ? 'rzecz' : 'rzeczy'), (float) $r['amount'], '/purchases', 'deadline');
        }

        // Reels planned for a day
        try {
            Schema::ensureColumn($conn, 'ideas', 'planned_for');
            $stmt = $conn->prepare("
                SELECT id, title, planned_for FROM ideas
                WHERE user_id = :user_id AND status = 'draft' AND planned_for BETWEEN :from AND :to
            ");
            $stmt->execute($p);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $i) {
                $events[] = self::event($i['planned_for'], null, 'idea', 'Nagraj: ' . $i['title'], 'rolka', null, '/ideas/' . $i['id'], 'plan');
            }
        } catch (Exception $e) {
            // optional
        }

        // Contract dates (end of exclusivity / licence, publish date of a contract on its own)
        try {
            require_once __DIR__ . '/../documents/helpers.php';
            documentsEnsureSchema($conn);
            $stmt = $conn->prepare("SELECT id, title, brand, counterparty, collaboration_id, terms FROM documents WHERE user_id = :user_id AND terms IS NOT NULL");
            $stmt->execute(['user_id' => $userId]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $doc) {
                $terms = documentsTerms($doc['terms']);
                $who = trim((string) $doc['brand']) ?: (documentsShortName($doc['counterparty']) ?: $doc['title']);
                $dates = [
                    ['Koniec wyłączności z ' . $who, $terms['exclusivity_until'] ?? null, 'info'],
                    ['Koniec licencji dla ' . $who, $terms['license_until'] ?? null, 'info'],
                    ['Opublikuj dla ' . $who, empty($doc['collaboration_id']) ? ($terms['publish_by'] ?? null) : null, 'deadline'],
                ];
                foreach ($dates as [$title, $date, $tone]) {
                    if ($date && $date >= $from && $date <= $to) {
                        $events[] = self::event($date, null, 'term', $title, 'z umowy', null, '/documents?doc=' . $doc['id'], $tone);
                    }
                }
            }
        } catch (Exception $e) {
            // archive not set up
        }

        usort($events, function ($a, $b) {
            return [$a['date'], $a['time'] ?? '99:99'] <=> [$b['date'], $b['time'] ?? '99:99'];
        });
        return $events;
    }

    private static function event($date, $time, $kind, $title, $meta, $amount, $url, $tone, array $extra = [])
    {
        return [
            'date' => $date,
            'time' => $time,
            'kind' => $kind,
            'title' => $title,
            'meta' => $meta,
            'amount' => $amount,
            'url' => $url,
            'tone' => $tone,
        ] + $extra;
    }
}
