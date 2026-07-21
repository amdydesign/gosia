<?php
/**
 * Create Collaboration
 * POST /api/collaborations/create.php
 */

require_once __DIR__ . '/../bootstrap.php';
requireMethod('POST');

try {
    $userId = getCurrentUserId();
    $input = json_decode(file_get_contents('php://input'), true);

    $brand = trim($input['brand'] ?? '');
    if (empty($brand)) {
        Response::validationError(['brand' => 'Brand name is required']);
    }

    $type = Validator::requireEnum($input['type'] ?? 'inne', Validator::COLLABORATION_TYPES, 'type');
    $paymentStatus = Validator::requireEnum($input['payment_status'] ?? 'pending', Validator::PAYMENT_STATUSES, 'payment_status');
    $collabType = Validator::requireEnum($input['collab_type'] ?? 'other', Validator::COLLAB_BILLING_TYPES, 'collab_type');
    $amountNet = Validator::requireAmount($input['amount_net'] ?? ($input['amount'] ?? 0), 'amount_net');
    $amountGross = Validator::requireAmount($input['amount_gross'] ?? $amountNet, 'amount_gross');
    $date = Validator::requireDate($input['date'] ?? '', 'date');
    $fiscalTracking = !isset($input['fiscal_tracking']) || $input['fiscal_tracking'] ? 1 : 0;
    $notes = trim($input['notes'] ?? '');
    $team = $input['team'] ?? []; // Array of { name, role, amount }

    $conn = db();
    $conn->beginTransaction();

    // Insert collaboration
    $stmt = $conn->prepare("
        INSERT INTO collaborations (user_id, brand, type, collab_type, fiscal_tracking, amount_net, amount_gross, date, payment_status, notes)
        VALUES (:user_id, :brand, :type, :collab_type, :fiscal_tracking, :amount_net, :amount_gross, :date, :payment_status, :notes)
    ");

    $stmt->execute([
        'user_id' => $userId,
        'brand' => $brand,
        'type' => $type,
        'collab_type' => $collabType,
        'fiscal_tracking' => $fiscalTracking,
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
            INSERT INTO collaboration_team (collaboration_id, name, amount, is_paid)
            VALUES (:collab_id, :name, :amount, :is_paid)
        ");

        foreach ($team as $member) {
            if (!empty($member['name'])) {
                $stmtTeam->execute([
                    'collab_id' => $collabId,
                    'name' => $member['name'],
                    'amount' => floatval($member['amount'] ?? 0),
                    'is_paid' => !empty($member['is_paid']) ? 1 : 0
                ]);
            }
        }
    }

    $conn->commit();
    Response::success(['id' => $collabId, 'message' => 'Collaboration created'], 'Created', 201);

} catch (Exception $e) {
    if (isset($conn))
        $conn->rollBack();
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Failed to create: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to create collaboration', 500);
}
