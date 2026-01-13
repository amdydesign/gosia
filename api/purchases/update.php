<?php
/**
 * Update Purchase
 * PUT /api/purchases/update.php?id=X
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
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

    // Status handling - if setting to 'returned', set timestamp
    if (isset($data->status)) {
        if (!in_array($data->status, ['kept', 'returned', 'partial'])) {
            Response::error('Invalid status', 400);
        }
        $fields[] = "status = :status";
        $params['status'] = $data->status;

        if ($data->status === 'returned') {
            $fields[] = "returned_at = CURRENT_TIMESTAMP";
        } elseif ($data->status === 'kept') {
            $fields[] = "returned_at = NULL";
        }
    }

    if (empty($fields)) {
        Response::success(['message' => 'No changes provided']);
    }

    $sql = "UPDATE purchases SET " . implode(', ', $fields) . " WHERE id = :id AND user_id = :user_id";
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);

    Response::success(['message' => 'Purchase updated']);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Update failed: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to update purchase', 500);
}
