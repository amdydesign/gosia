<?php
/**
 * Get Collaboration Details
 * GET /api/collaborations/show.php?id=1
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = isset($_GET['id']) ? intval($_GET['id']) : null;

    if (!$id)
        Response::error('ID required', 400);

    $db = new Database();
    $conn = $db->getConnection();

    // Get Collab
    $stmt = $conn->prepare("
        SELECT id, brand, type, collab_type, fiscal_tracking, amount_net, amount_gross, date, payment_status, notes, created_at
        FROM collaborations 
        WHERE id = :id AND user_id = :user_id
    ");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $collab = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$collab)
        Response::error('Collaboration not found', 404);

    // Get Team
    $stmtTeam = $conn->prepare("
        SELECT id, name, amount, is_paid
        FROM collaboration_team 
        WHERE collaboration_id = :collab_id
    ");
    $stmtTeam->execute(['collab_id' => $id]);
    $collab['team'] = $stmtTeam->fetchAll(PDO::FETCH_ASSOC);

    Response::success($collab);

} catch (Exception $e) {
    Response::error('Failed to fetch data', 500);
}
