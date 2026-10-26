<?php
/**
 * Recognised text of a document
 * GET  /api/documents/text.php?id=123  -> { id, content_text }
 * POST /api/documents/text.php?id=123  body: { content_text }
 *      Stores text read again in the browser (OCR) and re-guesses the date and
 *      counterparty from it (kept as they were when nothing is found).
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET' && $method !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = intval($_GET['id'] ?? 0);
    if ($id <= 0) {
        Response::validationError(['id' => 'Valid id required']);
    }

    $db = new Database();
    $conn = $db->getConnection();
    documentsEnsureSchema($conn);

    $stmt = $conn->prepare("SELECT id, content_text, doc_date, counterparty, doc_kind, amount, billing, terms FROM documents WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $document = $stmt->fetch();
    if (!$document) {
        Response::notFound('Dokument nie istnieje');
    }

    if ($method === 'GET') {
        Response::success(['id' => (int) $document['id'], 'content_text' => (string) $document['content_text']]);
    }

    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $text = documentsCleanText($data['content_text'] ?? '');
    $docDate = documentsDateFromText($text) ?: $document['doc_date'];
    $counterparty = documentsNormalizeCounterparty(documentsCounterpartyFromText($text) ?: $document['counterparty']) ?: null;
    $collab = documentsCollabFields($text);
    $kind = $collab['doc_kind'] ?: $document['doc_kind'];
    $amount = $collab['amount'] ?? $document['amount'];
    $billing = $collab['billing'] ?: $document['billing'];
    // payment term read from the text, unless the contract terms already have one (e.g. from AI)
    $terms = documentsTerms($document['terms'] ?? null);
    if (empty($terms['payment_days']) && ($days = documentsPaymentDaysFromText($text))) {
        $terms['payment_days'] = $days;
    }

    $conn->prepare("
        UPDATE documents SET content_text = :content_text, doc_date = :doc_date, counterparty = :counterparty,
               doc_kind = :doc_kind, amount = :amount, billing = :billing, terms = :terms
        WHERE id = :id AND user_id = :user_id
    ")->execute([
        'content_text' => $text === '' ? null : $text,
        'doc_date' => $docDate,
        'counterparty' => $counterparty,
        'doc_kind' => $kind,
        'amount' => $amount,
        'billing' => $billing,
        'terms' => $terms ? json_encode($terms, JSON_UNESCAPED_UNICODE) : null,
        'id' => $id,
        'user_id' => $userId,
    ]);

    Response::success([
        'id' => $id,
        'content_text' => $text,
        'doc_date' => $docDate,
        'counterparty' => $counterparty,
        'doc_kind' => $kind,
        'amount' => $amount === null ? null : (float) $amount,
        'billing' => $billing,
        'has_text' => $text !== '',
    ], 'Tekst zapisany');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Text failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się odczytać tekstu dokumentu', 500);
}
