<?php
/**
 * Create Return
 * POST /api/returns/create.php
 * 
 * Request body: { "store": "...", "items": "...", "purchase_date": "YYYY-MM-DD", ... }
 * Response: { "success": true, "data": { "id": 1, ... } }
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    // Authenticate
    $userId = getCurrentUserId();

    // Get POST data
    $input = json_decode(file_get_contents('php://input'), true);

    // Validate required fields
    $errors = [];
    $store = trim($input['store'] ?? '');
    $items = trim($input['items'] ?? '');
    $purchaseDate = $input['purchase_date'] ?? '';
    $returnDays = intval($input['return_days'] ?? 14);
    $amount = floatval($input['amount'] ?? 0);
    $notes = trim($input['notes'] ?? '');

    if (empty($store)) {
        $errors['store'] = 'Store name is required';
    }

    if (empty($items)) {
        $errors['items'] = 'Items description is required';
    }

    if (empty($purchaseDate) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $purchaseDate)) {
        $errors['purchase_date'] = 'Valid purchase date is required (YYYY-MM-DD)';
    }

    if ($returnDays <= 0 || $returnDays > 365) {
        $errors['return_days'] = 'Return days must be between 1 and 365';
    }

    if (!empty($errors)) {
        Response::validationError($errors);
    }

    // Get database connection
    $db = new Database();
    $conn = $db->getConnection();

    // Insert return
    $stmt = $conn->prepare("
        INSERT INTO returns (user_id, store, items, purchase_date, return_days, amount, notes, status)
        VALUES (:user_id, :store, :items, :purchase_date, :return_days, :amount, :notes, 'pending')
    ");

    $stmt->execute([
        'user_id' => $userId,
        'store' => $store,
        'items' => $items,
        'purchase_date' => $purchaseDate,
        'return_days' => $returnDays,
        'amount' => $amount,
        'notes' => $notes
    ]);

    $id = $conn->lastInsertId();

    // Fetch created record with calculated fields
    $stmt = $conn->prepare("
        SELECT *, 
               DATE_ADD(purchase_date, INTERVAL return_days DAY) as return_deadline,
               DATEDIFF(DATE_ADD(purchase_date, INTERVAL return_days DAY), CURDATE()) as days_remaining
        FROM returns WHERE id = :id
    ");
    $stmt->execute(['id' => $id]);
    $return = $stmt->fetch();

    Response::success($return, 'Return created successfully', 201);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Failed to create return: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to create return', 500);
}
