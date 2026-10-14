<?php
/**
 * Create Purchase(s)
 * POST /api/purchases/create.php
 *
 * Single:  { store, items: "Sukienka", amount, purchase_date, return_days, ... }
 * Order:   { store, purchase_date, return_days, notes, items: [{ name, amount }, ...] }
 *          -> one purchase per item, so every item can be returned on its own
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $data = json_decode(file_get_contents('php://input'), true) ?: [];

    $store = trim((string) ($data['store'] ?? ''));
    $purchaseDate = (string) ($data['purchase_date'] ?? '');
    $returnDays = isset($data['return_days']) ? max(0, min(365, intval($data['return_days']))) : 14;
    $notes = isset($data['notes']) ? trim((string) $data['notes']) : null;
    $purchaseUrl = isset($data['purchase_url']) ? trim((string) $data['purchase_url']) : null;

    if (is_array($data['items'] ?? null)) {
        $rows = [];
        foreach ($data['items'] as $item) {
            $name = trim((string) ($item['name'] ?? ''));
            if ($name !== '') {
                $rows[] = ['items' => $name, 'amount' => floatval($item['amount'] ?? 0)];
            }
        }
    } else {
        $rows = [['items' => trim((string) ($data['items'] ?? '')), 'amount' => floatval($data['amount'] ?? 0)]];
    }

    $errors = [];
    if ($store === '') {
        $errors['store'] = 'Podaj sklep';
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $purchaseDate)) {
        $errors['purchase_date'] = 'Podaj datę zakupu';
    }
    if (!$rows || $rows[0]['items'] === '') {
        $errors['items'] = 'Podaj co zostało kupione';
    }
    if ($errors) {
        Response::validationError($errors);
    }

    $status = in_array($data['status'] ?? '', ['kept', 'returned', 'partial'], true) ? $data['status'] : 'kept';

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensurePurchases($conn);
    $conn->beginTransaction();

    $stmt = $conn->prepare("
        INSERT INTO purchases (user_id, store, items, purchase_date, return_days, amount, purchase_url, notes, status)
        VALUES (:user_id, :store, :items, :purchase_date, :return_days, :amount, :purchase_url, :notes, :status)
    ");

    $ids = [];
    foreach ($rows as $row) {
        $stmt->execute([
            'user_id' => $userId,
            'store' => mb_substr($store, 0, 100),
            'items' => mb_substr($row['items'], 0, 255),
            'purchase_date' => $purchaseDate,
            'return_days' => $returnDays,
            'amount' => max(0, $row['amount']),
            'purchase_url' => $purchaseUrl !== '' ? $purchaseUrl : null,
            'notes' => $notes !== '' ? $notes : null,
            'status' => $status,
        ]);
        $ids[] = (int) $conn->lastInsertId();
    }

    $conn->commit();

    Response::success([
        'message' => 'Purchase created',
        'id' => $ids[0],
        'ids' => $ids,
    ], 'Created', 201);

} catch (Exception $e) {
    if (isset($conn) && $conn->inTransaction()) {
        $conn->rollBack();
    }
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Create failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to create purchase', 500);
}
