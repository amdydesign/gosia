<?php
/**
 * Mock Password Reset Request
 * Since SMTP is not configured, this will check if email exists and simulate success.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$email = trim($input['email'] ?? '');

if (empty($email)) {
    Response::validationError(['email' => 'Email jest wymagany.']);
}

try {
    $db = new Database();
    $conn = $db->getConnection();

    $stmt = $conn->prepare("SELECT id FROM users WHERE email = :email OR username = :email");
    $stmt->execute(['email' => $email]);
    $user = $stmt->fetch();

    // Always return success to prevent email enumeration (security best practice),
    // unless in debug mode where we might want to know.
    // For this specific user project, I will just return success.

    // In a real app, generate token -> save to DB -> send email.
    // Here we just acknowledge.

    Response::success(null, 'Jeśli konto istnieje, instrukcje resetowania hasła zostały wysłane na podany adres e-mail.');

} catch (Exception $e) {
    Response::error('Wystąpił błąd serwera.', 500);
}
