<?php
/**
 * Rename a document / edit its notes / change signing status
 * PUT /api/documents/update.php?id=123   body: { title?, notes?, status?, doc_date?, counterparty?, amount?, doc_kind?, billing?, terms? }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = intval($_GET['id'] ?? 0);
    $data = json_decode(file_get_contents('php://input'), true) ?: [];

    if ($id <= 0) {
        Response::validationError(['id' => 'Valid id required']);
    }

    $fields = [];
    $params = ['id' => $id, 'user_id' => $userId];

    if (array_key_exists('title', $data)) {
        $title = trim((string) $data['title']);
        if ($title === '') {
            Response::validationError(['title' => 'Podaj nazwę dokumentu']);
        }
        $fields[] = 'title = :title';
        $params['title'] = mb_substr($title, 0, 255);
    }
    if (array_key_exists('notes', $data)) {
        $notes = trim((string) $data['notes']);
        $fields[] = 'notes = :notes';
        $params['notes'] = $notes === '' ? null : $notes;
    }

    if (array_key_exists('status', $data)) {
        if (!in_array($data['status'], DOCUMENTS_STATUSES, true)) {
            Response::validationError(['status' => 'Must be "signed" or "to_sign"']);
        }
        $fields[] = 'status = :status';
        $params['status'] = $data['status'];
    }

    if (array_key_exists('counterparty', $data)) {
        $counterparty = documentsNormalizeCounterparty($data['counterparty']);
        $fields[] = 'counterparty = :counterparty';
        $params['counterparty'] = $counterparty === '' ? null : mb_substr($counterparty, 0, 255);
    }
    if (array_key_exists('brand', $data)) {
        $brand = trim(preg_replace('/\s+/u', ' ', (string) $data['brand']));
        $fields[] = 'brand = :brand';
        $params['brand'] = $brand === '' ? null : mb_substr($brand, 0, 100);
    }
    if (array_key_exists('amount', $data)) {
        $fields[] = 'amount = :amount';
        $params['amount'] = $data['amount'] === null || $data['amount'] === '' ? null : documentsParseMoney($data['amount']);
    }
    if (array_key_exists('doc_kind', $data)) {
        $fields[] = 'doc_kind = :doc_kind';
        $params['doc_kind'] = in_array($data['doc_kind'], DOCUMENTS_KINDS, true) ? $data['doc_kind'] : null;
    }
    if (array_key_exists('billing', $data)) {
        $fields[] = 'billing = :billing';
        $params['billing'] = in_array($data['billing'], DOCUMENTS_BILLINGS, true) ? $data['billing'] : null;
    }
    if (array_key_exists('doc_date', $data)) {
        $fields[] = 'doc_date = :doc_date';
        $params['doc_date'] = documentsParseDate($data['doc_date']);
    }

    // contract terms edited by hand (dates, payment term, exclusivity...)
    $terms = null;
    if (array_key_exists('terms', $data)) {
        $terms = documentsCleanTerms($data['terms']);
        $fields[] = 'terms = :terms';
        $params['terms'] = $terms ? json_encode($terms, JSON_UNESCAPED_UNICODE) : null;
    }

    if (!$fields) {
        Response::error('No fields to update', 400);
    }

    $db = new Database();
    $conn = $db->getConnection();
    documentsEnsureSchema($conn);

    $stmt = $conn->prepare("SELECT id FROM documents WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    if (!$stmt->fetch()) {
        Response::notFound('Dokument nie istnieje');
    }

    $stmt = $conn->prepare("UPDATE documents SET " . implode(', ', $fields) . " WHERE id = :id AND user_id = :user_id");
    $stmt->execute($params);

    // Brand added to a document already in a collaboration: the brand goes to the front of its name
    if (!empty($params['brand'])) {
        $stmt = $conn->prepare("
            SELECT c.id, c.brand, d.counterparty FROM documents d
            JOIN collaborations c ON c.id = d.collaboration_id AND c.user_id = d.user_id
            WHERE d.id = :id AND d.user_id = :user_id
        ");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $collab = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($collab && mb_strpos(documentsPartyKey($collab['brand']), documentsPartyKey($params['brand'])) !== 0) {
            $conn->prepare("UPDATE collaborations SET brand = :brand WHERE id = :cid AND user_id = :user_id")->execute([
                'brand' => documentsCollabName($params['brand'], $collab['counterparty'] ?: $collab['brand']),
                'cid' => $collab['id'],
                'user_id' => $userId,
            ]);
        }
    }

    if ($terms) {
        $stmt = $conn->prepare("SELECT collaboration_id FROM documents WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        if ($collabId = (int) $stmt->fetchColumn()) {
            require_once __DIR__ . '/../collaborations/helpers.php';
            collabApplyTerms($conn, $userId, $collabId, $terms);
        }
    }

    Response::success(null, 'Zapisano');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Update failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się zapisać zmian', 500);
}
