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
