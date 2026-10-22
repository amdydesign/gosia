<?php
/**
 * List / search documents
 * GET /api/documents/index.php            -> all documents, newest first
 * GET /api/documents/index.php?q=umowa nda -> every word must appear in the
 *     title, notes, file name or document text (case and accent insensitive)
 * Each document carries status: signed | to_sign and counterparty (also searched)
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

try {
    $userId = getCurrentUserId();
    $words = documentsQueryWords($_GET['q'] ?? '');

    $db = new Database();
    $conn = $db->getConnection();
    documentsEnsureSchema($conn);

    $where = ['user_id = :user_id'];
    $params = ['user_id' => $userId];
    $titleScore = [];

    foreach ($words as $i => $word) {
        $like = documentsLikeEscape($word);
        $where[] = "(title LIKE :t{$i} OR notes LIKE :n{$i} OR counterparty LIKE :k{$i} OR original_name LIKE :o{$i} OR content_text LIKE :c{$i})";
        $params["t{$i}"] = $like;
        $params["n{$i}"] = $like;
        $params["k{$i}"] = $like;
        $params["o{$i}"] = $like;
        $params["c{$i}"] = $like;
        $params["s{$i}"] = $like;
        $titleScore[] = "(title LIKE :s{$i})";
    }

    // Name matches first, then newest
    $order = $titleScore ? '(' . implode(' + ', $titleScore) . ') DESC, created_at DESC' : 'created_at DESC';
    $textColumn = $words ? 'content_text' : 'NULL AS content_text';

    $stmt = $conn->prepare("
        SELECT id, title, notes, status, doc_date, counterparty, doc_kind, amount, billing, collaboration_id, original_name, mime_type, size, created_at, updated_at,
               (content_text IS NOT NULL AND content_text <> '') AS has_text,
               {$textColumn}
        FROM documents
        WHERE " . implode(' AND ', $where) . "
        ORDER BY {$order}, id DESC
        LIMIT 300
    ");
    $stmt->execute($params);

    $documents = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $row['id'] = (int) $row['id'];
        $row['size'] = (int) $row['size'];
        $row['has_text'] = (bool) $row['has_text'];
        $row['amount'] = $row['amount'] === null ? null : (float) $row['amount'];
        $row['collaboration_id'] = $row['collaboration_id'] === null ? null : (int) $row['collaboration_id'];
        // one spelling per company + a key so "sp. z o.o." and the long form group together
        $row['counterparty'] = $row['counterparty'] === null ? null : documentsNormalizeCounterparty($row['counterparty']);
        $row['counterparty_key'] = $row['counterparty'] ? documentsPartyKey($row['counterparty']) : null;
        $row['snippet'] = $words ? documentsSnippet($row['content_text'], $words) : null;
        unset($row['content_text']);
        $documents[] = $row;
    }

    Response::success($documents);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Failed to list documents: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się pobrać dokumentów', 500);
}
