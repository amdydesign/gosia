<?php
/**
 * Update Collaboration
 * PUT /api/collaborations/update.php?id=1
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

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

    Schema::ensureCollaborations($conn);

    // Verify ownership
    $stmt = $conn->prepare("SELECT id, brand, payment_status, paid_at, published_at, deliverables FROM collaborations WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $current = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$current)
        Response::error('Not found', 404);

    // "Zrobione" on one thing from the brief: { tick: { index, delta: 1 | -1 } }.
    // The last one made marks the collaboration published (payment term starts) - unless it already is.
    $autoPublished = false;
    if (isset($input['tick']) && is_array($input['tick'])) {
        $list = collabDecodeDeliverables($current['deliverables']);
        $index = (int) ($input['tick']['index'] ?? -1);
        if (!isset($list[$index])) {
            Response::notFound('Tej pozycji już nie ma');
        }
        $delta = ((int) ($input['tick']['delta'] ?? 1)) < 0 ? -1 : 1;
        $list[$index]['done'] = max(0, min((int) $list[$index]['count'], (int) $list[$index]['done'] + $delta));
        $input['deliverables'] = $list;
        $allDone = !array_filter($list, function ($d) {
            return (int) $d['done'] < (int) $d['count'];
        });
        if ($allDone && !$current['published_at'] && !array_key_exists('published_at', $input)) {
            $input['published_at'] = date('Y-m-d');
            $autoPublished = true;
        }
    }

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
    if (isset($input['collab_type'])) {
        $fields[] = "collab_type = :collab_type";
        $params['collab_type'] = $input['collab_type'];
    }
    if (isset($input['fiscal_tracking'])) {
        $fields[] = "fiscal_tracking = :fiscal_tracking";
        $params['fiscal_tracking'] = $input['fiscal_tracking'] ? 1 : 0;
    }

    if (array_key_exists('stage', $input)) {
        $fields[] = "stage = :stage";
        $params['stage'] = collabParseStage($input['stage']);
    } elseif (($input['payment_status'] ?? '') === 'paid') {
        $fields[] = "stage = NULL"; // paid = agreed, no longer a brief
    }
    if (array_key_exists('deliverables', $input)) {
        $fields[] = "deliverables = :deliverables";
        $params['deliverables'] = collabEncodeDeliverables($input['deliverables']);
    }

    $deadlines = collabDeadlineInput($input);
    // "Opłacone" stamps the day the money came in; back to unpaid clears it
    if (isset($input['payment_status'])) {
        if ($input['payment_status'] !== 'paid') {
            $deadlines['paid_at'] = null;
        } elseif (empty($deadlines['paid_at'])) {
            $deadlines['paid_at'] = $current['payment_status'] === 'paid' && $current['paid_at'] ? $current['paid_at'] : date('Y-m-d');
        }
    }
    foreach ($deadlines as $column => $value) {
        $fields[] = "$column = :$column";
        $params[$column] = $value;
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
            INSERT INTO collaboration_team (collaboration_id, name, amount, is_paid)
            VALUES (:collab_id, :name, :amount, :is_paid)
        ");

        foreach ($input['team'] as $member) {
            if (!empty($member['name'])) {
                $stmtTeam->execute([
                    'collab_id' => $id,
                    'name' => $member['name'],
                    'amount' => floatval($member['amount'] ?? 0),
                    'is_paid' => !empty($member['is_paid']) ? 1 : 0
                ]);
            }
        }
    }

    $conn->commit();

    if (isset($input['payment_status'])) {
        require_once __DIR__ . '/../utils/DoneLog.php';
        if ($input['payment_status'] === 'paid') {
            $row = $conn->prepare("SELECT brand FROM collaborations WHERE id = :id");
            $row->execute(['id' => $id]);
            DoneLog::record($conn, $userId, 'collab:' . $id, 'Płatność ' . ($row->fetchColumn() ?: ''));
        } else {
            DoneLog::forget($conn, $userId, 'collab:' . $id);
        }
    }
    if (array_key_exists('published_at', $deadlines)) {
        require_once __DIR__ . '/../utils/DoneLog.php';
        if ($deadlines['published_at']) {
            $row = $conn->prepare("SELECT brand FROM collaborations WHERE id = :id");
            $row->execute(['id' => $id]);
            DoneLog::record($conn, $userId, 'publish:' . $id, 'Opublikowane dla ' . ($row->fetchColumn() ?: ''));
        } else {
            DoneLog::forget($conn, $userId, 'publish:' . $id);
        }
    }

    $result = ['message' => 'Updated successfully'];
    if (isset($input['tick'])) {
        $result['deliverables'] = $input['deliverables'];
        $result['auto_published'] = $autoPublished;
    }
    Response::success($result);

} catch (Exception $e) {
    if (isset($conn))
        $conn->rollBack();
    Response::error('Update failed: ' . $e->getMessage(), 500);
}
