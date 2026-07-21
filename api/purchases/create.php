<?php
/**
 * Create Purchase
 * POST /api/purchases/create.php
 */

require_once __DIR__ . '/../bootstrap.php';
requireMethod('POST');

try {
    $userId = getCurrentUserId();
    $data = json_decode(file_get_contents("php://input"));

    if (!isset($data->store) || !isset($data->items) || !isset($data->purchase_date)) {
        Response::error('Missing required fields: store, items, purchase_date', 400);
    }

    Validator::requireDate($data->purchase_date, 'purchase_date');
    if (isset($data->amount)) {
        Validator::requireAmount($data->amount, 'amount');
    }

    $conn = db();

    $stmt = $conn->prepare("
        INSERT INTO purchases (
            user_id, store, items, purchase_date, 
            return_days, amount, purchase_url, notes, status
        ) VALUES (
            :user_id, :store, :items, :purchase_date, 
            :return_days, :amount, :purchase_url, :notes, :status
        )
    ");

    $status = isset($data->status)
        ? Validator::requireEnum($data->status, Validator::PURCHASE_STATUSES, 'status')
        : 'kept';

    $stmt->execute([
        'user_id' => $userId,
        'store' => $data->store,
        'items' => $data->items,
        'purchase_date' => $data->purchase_date,
        'return_days' => isset($data->return_days) ? intval($data->return_days) : 14,
        'amount' => isset($data->amount) ? floatval($data->amount) : 0.00,
        'purchase_url' => isset($data->purchase_url) ? $data->purchase_url : null,
        'notes' => isset($data->notes) ? $data->notes : null,
        'status' => $status
    ]);

    $purchaseId = $conn->lastInsertId();

    Response::success([
        'message' => 'Purchase created',
        'id' => $purchaseId
    ], 201);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Create failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to create purchase', 500);
}
