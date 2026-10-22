<?php
/**
 * Collaboration suggestions from contracts / bills / invoices (confirmed by the user)
 * GET /api/documents/suggestions.php
 *
 * Documents not yet linked to a collaboration, with a counterparty and a gross amount,
 * are grouped so a contract and its bill (both carry the amount) become ONE suggestion:
 * same company (legal form spelling ignored), same amount (±1 zł), dates within 120 days.
 * At most one contract and one bill per group - several contracts are separate jobs.
 * Each group either matches an existing collaboration (same brand, amount and a close
 * date) -> action "link", or becomes a prefilled new one -> action "create".
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

const SUGGEST_MAX_DAYS = 120;
const SUGGEST_AMOUNT_TOLERANCE = 1.0;

function suggestDays($a, $b)
{
    return abs((strtotime($a) - strtotime($b)) / 86400);
}

/** Which half of a "contract + bill" pair a document is; null = unknown kind (never paired) */
function suggestSlot($kind)
{
    if ($kind === 'umowa') {
        return 'contract';
    }
    return in_array($kind, ['rachunek', 'faktura'], true) ? 'bill' : null;
}

/** "Zalando Polska sp. z o.o." -> "Zalando Polska" (brand-like name for a new collaboration) */
function suggestBrand($counterparty)
{
    $name = preg_replace('/\s*(sp\. z o\.o\.( sp\.k\.)?|S\.A\.|sp\.k\.|sp\.j\.|GmbH|Ltd\.?|LLC|Inc\.?|B\.V\.|AG|SE)\s*$/u', '', $counterparty);
    return mb_substr(trim($name) ?: $counterparty, 0, 100);
}

try {
    $userId = getCurrentUserId();

    $db = new Database();
    $conn = $db->getConnection();
    documentsEnsureSchema($conn);

    $stmt = $conn->prepare("
        SELECT d.id, d.title, d.counterparty, d.doc_kind, d.amount, d.billing,
               COALESCE(d.doc_date, DATE(d.created_at)) AS day
        FROM documents d
        LEFT JOIN collaborations c ON c.id = d.collaboration_id AND c.user_id = d.user_id
        WHERE d.user_id = :user_id AND c.id IS NULL AND d.collab_dismissed = 0
          AND d.amount IS NOT NULL AND d.counterparty IS NOT NULL AND d.counterparty <> ''
          AND (d.doc_kind IS NULL OR d.doc_kind IN ('umowa', 'rachunek', 'faktura'))
        ORDER BY day ASC, d.id ASC
    ");
    $stmt->execute(['user_id' => $userId]);
    $docs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!$docs) {
        Response::success([]);
    }

    $stmt = $conn->prepare("SELECT * FROM collaborations WHERE user_id = :user_id ORDER BY date DESC, id DESC");
    $stmt->execute(['user_id' => $userId]);
    $collabs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // collaborations that already have their contract / bill attached (a second contract is a new job)
    $stmt = $conn->prepare("
        SELECT collaboration_id, doc_kind FROM documents
        WHERE user_id = :user_id AND collaboration_id IS NOT NULL AND doc_kind IN ('umowa', 'rachunek', 'faktura')
    ");
    $stmt->execute(['user_id' => $userId]);
    $taken = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $taken[(int) $row['collaboration_id']][suggestSlot($row['doc_kind'])] = true;
    }

    // Group documents that describe the same job: ONE contract + its ONE bill / invoice.
    // Every other document stays on its own - several contracts (even with the same
    // company and amount) are separate jobs, never merged into one collaboration.
    $groups = [];
    foreach ($docs as $doc) {
        $doc['amount'] = (float) $doc['amount'];
        $doc['counterparty'] = documentsNormalizeCounterparty($doc['counterparty']);
        $slot = suggestSlot($doc['doc_kind']);
        $placed = false;
        foreach ($groups as &$group) {
            if ($slot !== null && !isset($group['slots'][$slot]) && count($group['documents']) === 1
                && suggestSlot($group['documents'][0]['doc_kind']) !== null
                && documentsSameParty($group['counterparty'], $doc['counterparty'])
                && abs($group['amount'] - $doc['amount']) <= SUGGEST_AMOUNT_TOLERANCE
                && suggestDays($group['day'], $doc['day']) <= SUGGEST_MAX_DAYS) {
                $group['documents'][] = $doc;
                $group['slots'][$slot] = true;
                $placed = true;
                break;
            }
        }
        unset($group);
        if (!$placed) {
            $groups[] = [
                'counterparty' => $doc['counterparty'],
                'amount' => $doc['amount'],
                'day' => $doc['day'],
                'slots' => $slot !== null ? [$slot => true] : [],
                'documents' => [$doc],
            ];
        }
    }

    $suggestions = [];
    foreach ($groups as $group) {
        // the contract's date describes the job best; otherwise the earliest document
        $day = $group['day'];
        foreach ($group['documents'] as $doc) {
            if ($doc['doc_kind'] === 'umowa') {
                $day = $doc['day'];
                break;
            }
        }
        $billing = null;
        foreach ($group['documents'] as $doc) {
            $billing = $billing ?: $doc['billing'];
        }

        // An existing collaboration for the same job? (avoids duplicates)
        $match = null;
        $known = null; // most recent collaboration with this brand ("jak ostatnio")
        foreach ($collabs as $collab) {
            if (!documentsSameParty($collab['brand'], $group['counterparty'])) {
                continue;
            }
            $known = $known ?: $collab;
            $busy = false;
            foreach (array_keys($group['slots']) as $slot) {
                $busy = $busy || isset($taken[(int) $collab['id']][$slot]);
            }
            if (!$busy && abs((float) $collab['amount_gross'] - $group['amount']) <= SUGGEST_AMOUNT_TOLERANCE
                && suggestDays($collab['date'], $day) <= SUGGEST_MAX_DAYS
                && (!$match || suggestDays($collab['date'], $day) < suggestDays($match['date'], $day))) {
                $match = $collab;
            }
        }

        if ($match) {
            // the next contract with the same brand and amount must not claim this one too
            foreach (array_keys($group['slots']) as $slot) {
                $taken[(int) $match['id']][$slot] = true;
            }
        }

        $titles = array_map(function ($d) {
            return $d['title'];
        }, $group['documents']);

        $suggestions[] = [
            'key' => implode('-', array_column($group['documents'], 'id')),
            'action' => $match ? 'link' : 'create',
            'counterparty' => $group['counterparty'],
            'amount' => $group['amount'],
            'date' => $day,
            'document_ids' => array_map('intval', array_column($group['documents'], 'id')),
            'documents' => array_map(function ($d) {
                return ['id' => (int) $d['id'], 'title' => $d['title'], 'doc_kind' => $d['doc_kind']];
            }, $group['documents']),
            'collaboration' => $match ? [
                'id' => (int) $match['id'],
                'brand' => $match['brand'],
                'amount_gross' => (float) $match['amount_gross'],
                'date' => $match['date'],
            ] : null,
            'prefill' => $match ? null : [
                // reuse the brand spelling already used in collaborations ("reszta jak ostatnio")
                'brand' => $known ? $known['brand'] : suggestBrand($group['counterparty']),
                'amount_gross' => $group['amount'],
                'date' => $day,
                // from the contract, else as last time with this brand, else UoD 50%
                'collab_type' => $billing && $billing !== 'umowa_praca' ? $billing : (($known['collab_type'] ?? null) ?: 'umowa_50'),
                'type' => ($known['type'] ?? null) ?: 'inne',
                'notes' => 'Z dokumentów: ' . implode(', ', $titles),
            ],
        ];
    }

    Response::success($suggestions);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Suggestions failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się przygotować propozycji współprac', 500);
}
