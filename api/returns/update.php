<?php
/**
 * Update Return
 * PUT /api/returns/update.php?id=1
 * 
 * Request body: { "store": "...", "items": "...", "status": "pending|returned", ... }
 * Response: { "success": true, "data": { ... } }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

// Only allow PUT
if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
    Response::error('Method not allowed', 405);
}

try {
    // Authenticate
    $userId = getCurrentUserId();

    // Get return ID
    $id = intval($_GET['id'] ?? 0);
    if ($id <= 0) {
        Response::error('Invalid return ID', 400);
    }

    // Get database connection
    $db = new Database();
    $conn = $db->getConnection();

    // Check if return exists and belongs to user
    $stmt = $conn->prepare("SELECT * FROM returns WHERE id = :id AND user_id = :user_id LIMIT 1");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $existing = $stmt->fetch();

    if (!$existing) {
        Response::notFound('Return not found');
    }

    // Get PUT data
    $input = json_decode(file_get_contents('php://input'), true);

    // Merge with existing data
    $store = trim($input['store'] ?? $existing['store']);
    $items = trim($input['items'] ?? $existing['items']);
    $purchaseDate = $input['purchase_date'] ?? $existing['purchase_date'];
    $returnDays = isset($input['return_days']) ? intval($input['return_days']) : $existing['return_days'];
    $amount = isset($input['amount']) ? floatval($input['amount']) : $existing['amount'];
    $notes = isset($input['notes']) ? trim($input['notes']) : $existing['notes'];
    $status = $input['status'] ?? $existing['status'];

    // Validate
    $errors = [];
    if (empty($store)) {
        $errors['store'] = 'Store name is required';
    }
    if (empty($items)) {
        $errors['items'] = 'Items description is required';
    }
    if ($returnDays <= 0 || $returnDays > 365) {
        $errors['return_days'] = 'Return days must be between 1 and 365';
    }
    if (!in_array($status, ['pending', 'returned'])) {
        $errors['status'] = 'Invalid status';
    }

    if (!empty($errors)) {
        Response::validationError($errors);
    }

    // Set returned_at if status changed to returned
    $returnedAt = $existing['returned_at'];
    if ($status === 'returned' && $existing['status'] !== 'returned') {
        $returnedAt = date('Y-m-d H:i:s');
    }

    // Update return
    $stmt = $conn->prepare("
        UPDATE returns 
        SET store = :store, items = :items, purchase_date = :purchase_date, 
            return_days = :return_days, amount = :amount, notes = :notes, 
            status = :status, returned_at = :returned_at
        WHERE id = :id AND user_id = :user_id
    ");

    $stmt->execute([
        'id' => $id,
        'user_id' => $userId,
        'store' => $store,
        'items' => $items,
        'purchase_date' => $purchaseDate,
        'return_days' => $returnDays,
        'amount' => $amount,
        'notes' => $notes,
        'status' => $status,
        'returned_at' => $returnedAt
    ]);

    // Fetch updated record
    $stmt = $conn->prepare("
        SELECT *, 
               DATE_ADD(purchase_date, INTERVAL return_days DAY) as return_deadline,
               DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) as days_remaining
        FROM returns WHERE id = :id
    ");
    $stmt->execute(['id' => $id]);
    $return = $stmt->fetch();

    Response::success($return, 'Return updated successfully');

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Failed to update return: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to update return', 500);
}
