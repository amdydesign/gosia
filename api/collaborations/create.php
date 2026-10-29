<?php
/**
 * Create Collaboration
 * POST /api/collaborations/create.php
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

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
    $collabType = $input['collab_type'] ?? 'umowa_50';
    // Cash ("gotowka") is always private; everything else counts towards PIT unless explicitly disabled
    $fiscalTracking = array_key_exists('fiscal_tracking', $input)
        ? (!empty($input['fiscal_tracking']) ? 1 : 0)
        : ($collabType === 'gotowka' ? 0 : 1);

    if (empty($brand))
        $errors['brand'] = 'Brand name is required';
    if ($amountNet < 0)
        $errors['amount_net'] = 'Net amount must be positive';
    if (empty($date) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date))
        $errors['date'] = 'Valid date required';

    if (!empty($errors))
        Response::validationError($errors);

    $deadlines = collabDeadlineInput($input);
    // paid on save: the money came in today unless another day was given
    $paidAt = $paymentStatus === 'paid' ? (($deadlines['paid_at'] ?? null) ?: date('Y-m-d')) : null;

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensureCollaborations($conn);
    $conn->beginTransaction();

    // Insert collaboration
    $stmt = $conn->prepare("
        INSERT INTO collaborations (user_id, brand, type, collab_type, fiscal_tracking, amount_net, amount_gross, date, payment_status, notes,
                                    paid_at, publish_by, published_at, payment_days, stage, deliverables)
        VALUES (:user_id, :brand, :type, :collab_type, :fiscal_tracking, :amount_net, :amount_gross, :date, :payment_status, :notes,
                :paid_at, :publish_by, :published_at, :payment_days, :stage, :deliverables)
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
        'notes' => $notes,
        'paid_at' => $paidAt,
        'publish_by' => $deadlines['publish_by'] ?? null,
        'published_at' => $deadlines['published_at'] ?? null,
        'payment_days' => $deadlines['payment_days'] ?? null,
        // a brief is never "paid" yet - it waits in "W przygotowaniu"
        'stage' => $paymentStatus === 'paid' ? null : collabParseStage($input['stage'] ?? null),
        'deliverables' => collabEncodeDeliverables($input['deliverables'] ?? null),
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
    if ($_ENV['APP_DEBUG'] === 'true') {
        Response::error('Failed to create: ' . $e->getMessage(), 500);
    }
    Response::error('Failed to create collaboration', 500);
}
