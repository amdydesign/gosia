<?php
/**
 * Collaboration deadlines: publish by -> published -> paid within N days.
 *
 * The stage is never stored - it follows from the dates:
 *  - publish_by set, not published yet  -> "do zrobienia" (deadline on Start)
 *  - published / work date passed       -> "czeka na przelew" until the due date
 *  - due date passed, still unpaid      -> "po terminie"
 * Payment is due payment_days after publishing (or the deadline / work date);
 * without payment_days it is the old 30 days.
 */

require_once __DIR__ . '/../config/Schema.php';

const COLLAB_DEFAULT_PAYMENT_DAYS = 30;

/** SQL: the day the payment is due. */
const COLLAB_DUE_SQL = "DATE_ADD(COALESCE(published_at, publish_by, date), INTERVAL COALESCE(payment_days, 30) DAY)";

/** SQL: the day the money counts for (paid on, or the work date for entries from before paid_at existed). */
const COLLAB_PAID_DAY_SQL = "COALESCE(paid_at, date)";

function collabParseDate($value)
{
    $value = trim((string) $value);
    $date = DateTime::createFromFormat('!Y-m-d', $value);
    return $date && $date->format('Y-m-d') === $value ? $value : null;
}

/** payment_days 1-365, or null (empty = default 30). */
function collabParseDays($value)
{
    if ($value === null || $value === '') {
        return null;
    }
    $days = (int) $value;
    return $days >= 1 && $days <= 365 ? $days : null;
}

/**
 * Deadline columns present in the request (only keys that were sent).
 * @return array column => value
 */
function collabDeadlineInput(array $input)
{
    $out = [];
    foreach (['publish_by', 'published_at', 'paid_at'] as $key) {
        if (array_key_exists($key, $input)) {
            $out[$key] = collabParseDate($input[$key]);
        }
    }
    if (array_key_exists('payment_days', $input)) {
        $out['payment_days'] = collabParseDays($input['payment_days']);
    }
    return $out;
}

/** Due date (Y-m-d) of a collaboration row. */
function collabDueDate(array $row)
{
    $base = ($row['published_at'] ?? null) ?: (($row['publish_by'] ?? null) ?: $row['date']);
    $days = (int) ($row['payment_days'] ?? 0) ?: COLLAB_DEFAULT_PAYMENT_DAYS;
    return date('Y-m-d', strtotime($base . ' +' . $days . ' days'));
}

/**
 * Fill empty deadlines of a collaboration from a contract's terms (never overwrites
 * what was typed in). Used when a document is linked or analysed.
 */
function collabApplyTerms(PDO $conn, $userId, $collabId, array $terms)
{
    Schema::ensureCollaborations($conn);
    $stmt = $conn->prepare("SELECT publish_by, payment_days FROM collaborations WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $collabId, 'user_id' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return;
    }
    $set = [];
    $params = ['id' => $collabId, 'user_id' => $userId];
    $publishBy = collabParseDate($terms['publish_by'] ?? '');
    if ($publishBy && !$row['publish_by']) {
        $set[] = 'publish_by = :publish_by';
        $params['publish_by'] = $publishBy;
    }
    $days = collabParseDays($terms['payment_days'] ?? null);
    if ($days && !$row['payment_days']) {
        $set[] = 'payment_days = :payment_days';
        $params['payment_days'] = $days;
    }
    if ($set) {
        $conn->prepare("UPDATE collaborations SET " . implode(', ', $set) . " WHERE id = :id AND user_id = :user_id")->execute($params);
    }
}

// ---------------------------------------------------------------- brief: what to make

const COLLAB_STAGES = ['brief'];
const COLLAB_MAX_DELIVERABLES = 20;

/** 'brief' or null (agreed / normal collaboration). */
function collabParseStage($value)
{
    return in_array($value, COLLAB_STAGES, true) ? $value : null;
}

/**
 * Clean list of things to make: [{label, count, done, due}] (max 20), JSON for the column.
 * Empty list -> null.
 */
function collabEncodeDeliverables($value)
{
    if (!is_array($value)) {
        return null;
    }
    $out = [];
    foreach (array_slice($value, 0, COLLAB_MAX_DELIVERABLES) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $label = mb_substr(trim(preg_replace('/\s+/u', ' ', (string) ($item['label'] ?? ''))), 0, 60);
        if ($label === '') {
            continue;
        }
        $count = max(1, min(50, (int) ($item['count'] ?? 1)));
        $out[] = [
            'label' => $label,
            'count' => $count,
            'done' => max(0, min($count, (int) ($item['done'] ?? 0))),
            'due' => collabParseDate($item['due'] ?? ''),
        ];
    }
    return $out ? json_encode($out, JSON_UNESCAPED_UNICODE) : null;
}

/** Column -> list (always an array). */
function collabDecodeDeliverables($json)
{
    $list = json_decode((string) $json, true);
    return is_array($list) ? $list : [];
}

/** Row ready for the app: deliverables as a list. */
function collabForApp(array $row)
{
    if (array_key_exists('deliverables', $row)) {
        $row['deliverables'] = collabDecodeDeliverables($row['deliverables']);
    }
    return $row;
}

/**
 * The nearest thing still to make: ['index', 'label', 'left', 'due'] or null.
 * Things with a date come first (earliest), then the rest (with the publish deadline as their date).
 */
function collabNextDeliverable(array $deliverables, $publishBy = null)
{
    $best = null;
    foreach ($deliverables as $index => $d) {
        $left = (int) $d['count'] - (int) $d['done'];
        if ($left <= 0) {
            continue;
        }
        $due = ($d['due'] ?? null) ?: $publishBy;
        if ($best === null || ($due && (!$best['due'] || $due < $best['due']))) {
            $best = ['index' => $index, 'label' => $d['label'], 'left' => $left, 'due' => $due];
        }
    }
    return $best;
}

/**
 * Documents linked to a brief: a contract / bill / invoice means the job is agreed -
 * the brief leaves "W przygotowaniu" and takes the amount and billing it did not have yet.
 */
function collabAgreeFromDocuments(PDO $conn, $userId, $collabId, array $documentIds)
{
    Schema::ensureCollaborations($conn);
    $stmt = $conn->prepare("SELECT stage, amount_gross, collab_type, date FROM collaborations WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $collabId, 'user_id' => $userId]);
    $collab = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$collab || $collab['stage'] !== 'brief' || !$documentIds) {
        return;
    }
    $placeholders = implode(',', array_fill(0, count($documentIds), '?'));
    $stmt = $conn->prepare("
        SELECT doc_kind, amount, billing FROM documents
        WHERE user_id = ? AND id IN ($placeholders) AND (doc_kind IS NULL OR doc_kind IN ('umowa', 'rachunek', 'faktura', 'zlecenie'))
        ORDER BY (doc_kind = 'umowa') DESC, id ASC
    ");
    $stmt->execute(array_merge([$userId], array_map('intval', $documentIds)));
    $docs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (!$docs) {
        return; // e.g. only the brief itself was attached
    }

    $set = ['stage = NULL'];
    $params = ['id' => $collabId, 'user_id' => $userId];
    if ((float) $collab['amount_gross'] <= 0) {
        foreach ($docs as $doc) {
            if ((float) $doc['amount'] > 0) {
                require_once __DIR__ . '/../utils/TaxCalculator.php';
                $billing = $doc['billing'] && $doc['billing'] !== 'umowa_praca' ? $doc['billing'] : $collab['collab_type'];
                $set[] = 'amount_gross = :gross';
                $set[] = 'amount_net = :net';
                $set[] = 'collab_type = :collab_type';
                $params['gross'] = round((float) $doc['amount'], 2);
                $params['net'] = round(TaxCalculator::calculateNet((float) $doc['amount'], $billing, $collab['date']), 2);
                $params['collab_type'] = $billing;
                break;
            }
        }
    }
    $conn->prepare("UPDATE collaborations SET " . implode(', ', $set) . " WHERE id = :id AND user_id = :user_id")->execute($params);
}

/** Things from the brief still to make (not marked published) - no payment is due yet, nothing to chase. */
function collabHasWorkLeft(array $row)
{
    if (!empty($row['published_at'])) {
        return false;
    }
    foreach (collabDecodeDeliverables($row['deliverables'] ?? null) as $d) {
        if ((int) ($d['done'] ?? 0) < (int) ($d['count'] ?? 0)) {
            return true;
        }
    }
    return false;
}
