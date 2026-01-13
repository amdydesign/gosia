<?php
/**
 * Create Collaboration
 * POST /api/collaborations/create.php
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true);

    $errors = [];
    $brand = trim($input['brand'] ?? '');
    $type = $input['type'] ?? 'inne';
    $amountNet = floatval($input['amount_net'] ?? ($input['amount'] ?? 0));
    $amountGross = floatval($input['amount_gross'] ?? $amountNet);
    $date = $input['date'] ?? '';
    $paymentStatus = $input['payment_status'] ?? 'pending';
    $notes = trim($input['notes'] ?? '');
    $team = $input['team'] ?? []; // Array of { name, role, amount }

    if (empty($brand))
        $errors['brand'] = 'Brand name is required';
    if ($amountNet < 0)
        $errors['amount_net'] = 'Net amount must be positive';
    if (empty($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date))
        $errors['date'] = 'Valid date required';

    if (!empty($errors))
        Response::validationError($errors);

    $db = new Database();
    $conn = $db->getConnection();
    $conn->beginTransaction();

    // Insert collaboration
    $stmt = $conn->prepare("
        INSERT INTO collaborations (user_id, brand, type, amount_net, amount_gross, date, payment_status, notes)
        VALUES (:user_id, :brand, :type, :amount_net, :amount_gross, :date, :payment_status, :notes)
    ");

    $stmt->execute([
        'user_id' => $userId,
        'brand' => $brand,
        'type' => $type,
        'amount_net' => $amountNet,
        'amount_gross' => $amountGross,
        'date' => $date,
        'payment_status' => $paymentStatus,
        'notes' => $notes
    ]);

    $collabId = $conn->lastInsertId();

    // Insert team members
    if (!empty($team) && is_array($team)) {
        $stmtTeam = $conn->prepare("
            INSERT INTO collaboration_team (collaboration_id, name, amount)
            VALUES (:collab_id, :name, :amount)
        ");

        foreach ($team as $member) {
            if (!empty($member['name'])) {
                $stmtTeam->execute([
                    'collab_id' => $collabId,
                    'name' => $member['name'],
                    'amount' => floatval($member['amount'] ?? 0)
                ]);
            }
        }
    }

    $conn->commit();
    Response::success(['id' => $collabId, 'message' => 'Collaboration created'], 'Created', 201);

} catch (Exception $e) {
    if (isset($conn))
        $conn->rollBack();
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Failed to create: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to create collaboration', 500);
}
