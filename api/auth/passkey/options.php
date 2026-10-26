<?php
/**
 * Face ID: options for navigator.credentials.create() / get().
 *
 * POST /api/auth/passkey/options.php { purpose: "register" }  (logged in)
 * POST /api/auth/passkey/options.php { purpose: "login" }     (on the login screen)
 * -> { challenge, state, rp_id, ... } - the app sends "state" back with the answer.
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/Database.php';
require_once __DIR__ . '/../../config/Response.php';
require_once __DIR__ . '/../../config/Passkeys.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$purpose = ($input['purpose'] ?? '') === 'register' ? 'register' : 'login';

try {
    if ($purpose === 'login') {
        list($challenge, $state) = Passkeys::challenge('login');
        Response::success(['challenge' => $challenge, 'state' => $state, 'rp_id' => Passkeys::rpId()]);
    }

    require_once __DIR__ . '/../../middleware/auth.php';
    $userId = (int) getCurrentUserId();
    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'passkeys');
    $user = Users::find($conn, $userId);

    $stmt = $conn->prepare("SELECT credential_id FROM passkeys WHERE user_id = :user_id");
    $stmt->execute(['user_id' => $userId]);
    list($challenge, $state) = Passkeys::challenge('register', $userId);

    Response::success([
        'challenge' => $challenge,
        'state' => $state,
        'rp_id' => Passkeys::rpId(),
        'rp_name' => 'Gonia',
        'user' => [
            'id' => Passkeys::userHandle($userId),
            'name' => $user['username'],
            'display_name' => trim((string) $user['display_name']) ?: $user['username'],
        ],
        'algorithms' => Passkeys::ALGORITHMS,
        'exclude' => $stmt->fetchAll(PDO::FETCH_COLUMN),
    ]);
} catch (Exception $e) {
    Response::error('Nie udało się przygotować Face ID', 500);
}
