<?php
/**
 * Update Collaboration
 * PUT /api/collaborations/update.php?id=1
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
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$id)
        Response::error('ID required', 400);

    $db = new Database();
    $conn = $db->getConnection();

    // Verify ownership
    $stmt = $conn->prepare("SELECT id FROM collaborations WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    if ($stmt->rowCount() == 0)
        Response::error('Not found', 404);

    $conn->beginTransaction();

    // Update main fields
    $fields = [];
    $params = ['id' => $id];

    if (isset($input['brand'])) {
        $fields[] = "brand = :brand";
        $params['brand'] = $input['brand'];
    }
    if (isset($input['type'])) {
        $fields[] = "type = :type";
        $params['type'] = $input['type'];
    }
    if (isset($input['amount_net'])) {
        $fields[] = "amount_net = :amount_net";
        $params['amount_net'] = floatval($input['amount_net']);
    }
    if (isset($input['amount_gross'])) {
        $fields[] = "amount_gross = :amount_gross";
        $params['amount_gross'] = floatval($input['amount_gross']);
    }
    if (isset($input['date'])) {
        $fields[] = "date = :date";
        $params['date'] = $input['date'];
    }
    if (isset($input['payment_status'])) {
        $fields[] = "payment_status = :payment_status";
        $params['payment_status'] = $input['payment_status'];
    }
    if (isset($input['notes'])) {
        $fields[] = "notes = :notes";
        $params['notes'] = $input['notes'];
    }

    if (!empty($fields)) {
        $sql = "UPDATE collaborations SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
    }

    // Update Team (Replace all)
    // Only if team array is provided
    if (isset($input['team']) && is_array($input['team'])) {
        // Delete existing
        $conn->prepare("DELETE FROM collaboration_team WHERE collaboration_id = :id")->execute(['id' => $id]);

        // Insert new
        $stmtTeam = $conn->prepare("
            INSERT INTO collaboration_team (collaboration_id, name, amount)
            VALUES (:collab_id, :name, :amount)
        ");

        foreach ($input['team'] as $member) {
            if (!empty($member['name'])) {
                $stmtTeam->execute([
                    'collab_id' => $id,
                    'name' => $member['name'],
                    'amount' => floatval($member['amount'] ?? 0)
                ]);
            }
        }
    }

    $conn->commit();
    Response::success(['message' => 'Updated successfully']);

} catch (Exception $e) {
    if (isset($conn))
        $conn->rollBack();
    Response::error('Update failed: ' . $e->getMessage(), 500);
}
