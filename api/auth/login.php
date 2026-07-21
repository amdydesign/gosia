<?php
/**
 * Login Endpoint
 * POST /api/auth/login.php
 * 
 * Request body: { "username": "...", "password": "..." }
 * Response: { "success": true, "data": { "token": "...", "user": {...} } }
 */

require_once __DIR__ . '/../bootstrap.php';
requireMethod('POST');

// Get POST data
$input = json_decode(file_get_contents('php://input'), true);

$username = trim($input['username'] ?? '');
$password = $input['password'] ?? '';

// Validate input
if (empty($username) || empty($password)) {
    Response::validationError([
        'username' => empty($username) ? 'Username is required' : null,
        'password' => empty($password) ? 'Password is required' : null
    ]);
}

try {
    $conn = db();

    // Rate limiting: max 5 nieudanych prob na login+IP w ciagu 15 minut.
    // try/catch, zeby brak tabeli (niewykonana migracja) nie blokowal logowania.
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $rateLimitAvailable = true;
    try {
        $stmt = $conn->prepare(
            "SELECT COUNT(*) AS cnt FROM login_attempts
             WHERE username = :username AND ip_address = :ip
               AND attempted_at > (NOW() - INTERVAL 15 MINUTE)"
        );
        $stmt->execute(['username' => $username, 'ip' => $ip]);
        $attempts = (int) $stmt->fetch()['cnt'];

        if ($attempts >= 5) {
            Response::error('Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za 15 minut.', 429);
        }
    } catch (PDOException $e) {
        $rateLimitAvailable = false;
    }

    $recordFailedAttempt = function () use ($conn, $username, $ip, $rateLimitAvailable) {
        if (!$rateLimitAvailable) {
            return;
        }
        try {
            $stmt = $conn->prepare("INSERT INTO login_attempts (username, ip_address) VALUES (:username, :ip)");
            $stmt->execute(['username' => $username, 'ip' => $ip]);
            $conn->exec("DELETE FROM login_attempts WHERE attempted_at < (NOW() - INTERVAL 1 DAY)");
        } catch (PDOException $e) {
            // Rate limiting nie moze zablokowac odpowiedzi logowania
        }
    };

    // Find user by username
    $stmt = $conn->prepare("SELECT id, username, password_hash, email, token_version FROM users WHERE username = :username LIMIT 1");
    $stmt->execute(['username' => $username]);
    $user = $stmt->fetch();

    // Check if user exists
    if (!$user) {
        $recordFailedAttempt();
        Response::error('Invalid username or password', 401);
    }

    // Verify password
    if (!password_verify($password, $user['password_hash'])) {
        $recordFailedAttempt();
        Response::error('Invalid username or password', 401);
    }

    // Successful login clears the failure counter for this login+IP
    if ($rateLimitAvailable) {
        try {
            $stmt = $conn->prepare("DELETE FROM login_attempts WHERE username = :username AND ip_address = :ip");
            $stmt->execute(['username' => $username, 'ip' => $ip]);
        } catch (PDOException $e) {
            // ignoruj
        }
    }

    // Update last login
    $updateStmt = $conn->prepare("UPDATE users SET last_login = NOW() WHERE id = :id");
    $updateStmt->execute(['id' => $user['id']]);

    // Generate JWT token
    $jwtHandler = new JWTHandler();
    // Default to 1 if token_version is null
    $tokenVersion = $user['token_version'] ?? 1;
    $token = $jwtHandler->generateToken($user['id'], $user['username'], $tokenVersion);

    // Prepare user data (without password)
    $userData = [
        'id' => $user['id'],
        'username' => $user['username'],
        'email' => $user['email']
    ];

    // Send success response
    Response::success([
        'token' => $token,
        'user' => $userData
    ], 'Login successful');

} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Login failed: ' . $e->getMessage(), 500);
    }
    Response::error('Login failed', 500);
}
