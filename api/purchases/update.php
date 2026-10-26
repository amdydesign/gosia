<?php
/**
 * Update Purchase
 * PUT /api/purchases/update.php?id=X
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = isset($_GET['id']) ? intval($_GET['id']) : null;
    $data = json_decode(file_get_contents("php://input"));

    if (!$id) {
        Response::error('Missing purchase ID', 400);
    }

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensurePurchases($conn);

    // Verify ownership
    $stmt = $conn->prepare("SELECT id FROM purchases WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);

    if ($stmt->rowCount() === 0) {
        Response::error('Purchase not found or access denied', 404);
    }

    // Build update query dynamically
    $fields = [];
    $params = ['id' => $id, 'user_id' => $userId];

    if (isset($data->store)) {
        $fields[] = "store = :store";
        $params['store'] = $data->store;
    }
    if (isset($data->items)) {
        $fields[] = "items = :items";
        $params['items'] = $data->items;
    }
    if (isset($data->purchase_date)) {
        $fields[] = "purchase_date = :purchase_date";
        $params['purchase_date'] = $data->purchase_date;
    }
    if (isset($data->return_days)) {
        $fields[] = "return_days = :return_days";
        $params['return_days'] = $data->return_days;
    }
    if (isset($data->amount)) {
        $fields[] = "amount = :amount";
        $params['amount'] = $data->amount;
    }
    if (isset($data->returned_amount)) {
        $fields[] = "returned_amount = :returned_amount";
        $params['returned_amount'] = $data->returned_amount;
    }
    if (isset($data->purchase_url)) {
        $fields[] = "purchase_url = :purchase_url";
        $params['purchase_url'] = $data->purchase_url;
    }
    if (isset($data->notes)) {
        $fields[] = "notes = :notes";
        $params['notes'] = $data->notes;
    }
    // "Paczka przyszła" (the return window counts from delivery), "Pieniądze są" (refund on the account),
    // what sending it back cost - each may be cleared with null
    foreach (['delivered_at', 'refunded_at'] as $column) {
        if (property_exists($data, $column)) {
            $value = $data->$column === 'today' ? date('Y-m-d') : $data->$column;
            $fields[] = "$column = :$column";
            $params[$column] = $value && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $value) ? $value : null;
        }
    }
    if (property_exists($data, 'return_cost')) {
        $fields[] = "return_cost = :return_cost";
        $params['return_cost'] = $data->return_cost === null || $data->return_cost === '' ? null : max(0, (float) $data->return_cost);
    }
    // "Zostawiam" - decided to keep before the deadline (stops reminders)
    if (isset($data->kept_confirmed)) {
        $fields[] = "kept_confirmed = :kept_confirmed";
        $params['kept_confirmed'] = $data->kept_confirmed ? 1 : 0;
    }

    // Status handling - if setting to 'returned', set timestamp
    if (isset($data->status)) {
        if (!in_array($data->status, ['kept', 'returned', 'partial'])) {
            Response::error('Invalid status', 400);
        }
        $fields[] = "status = :status";
        $params['status'] = $data->status;

        if ($data->status === 'returned' || $data->status === 'partial') {
            $fields[] = "returned_at = CURRENT_TIMESTAMP";
            if (!property_exists($data, 'refunded_at')) {
                $fields[] = "refunded_at = NULL"; // a new return: the money is on its way
            }
        } elseif ($data->status === 'kept') {
            $fields[] = "returned_at = NULL";
            $fields[] = "refunded_at = NULL";
        }
    }

    if (empty($fields)) {
        Response::success(['message' => 'No changes provided']);
    }

    $sql = "UPDATE purchases SET " . implode(', ', $fields) . " WHERE id = :id AND user_id = :user_id";
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);

    // Start's "Dziś ogarnięte": one entry per store - a parcel with 3 items is one thing done
    if (isset($data->status) || isset($data->kept_confirmed)) {
        require_once __DIR__ . '/../utils/DoneLog.php';
        $row = $conn->prepare("SELECT store, status, kept_confirmed FROM purchases WHERE id = :id");
        $row->execute(['id' => $params['id']]);
        $p = $row->fetch(PDO::FETCH_ASSOC) ?: [];
        $store = trim((string) ($p['store'] ?? ''));
        $refKey = 'return:' . mb_strtolower($store);
        if (in_array($p['status'] ?? '', ['returned', 'partial'], true)) {
            DoneLog::record($conn, $userId, $refKey, 'Zwrot ' . $store);
        } elseif (!empty($p['kept_confirmed'])) {
            DoneLog::record($conn, $userId, $refKey, 'Zostaje: ' . $store);
        } else {
            DoneLog::forget($conn, $userId, $refKey);
        }
    }

    if (property_exists($data, 'refunded_at')) {
        require_once __DIR__ . '/../utils/DoneLog.php';
        $row = $conn->prepare("SELECT store, refunded_at FROM purchases WHERE id = :id");
        $row->execute(['id' => $params['id']]);
        $p = $row->fetch(PDO::FETCH_ASSOC) ?: [];
        $refKey = 'refund:' . mb_strtolower(trim((string) ($p['store'] ?? '')));
        if (!empty($p['refunded_at'])) {
            DoneLog::record($conn, $userId, $refKey, 'Pieniądze wróciły: ' . trim((string) $p['store']));
        } else {
            DoneLog::forget($conn, $userId, $refKey);
        }
    }

    Response::success(['message' => 'Purchase updated']);

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Update failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to update purchase', 500);
}
