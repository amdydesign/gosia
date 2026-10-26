<?php
/**
 * "Nie pamiętasz hasła?" - e-mail with a one-time link (valid 1 hour).
 *
 * POST /api/auth/reset_password_request.php { email }  (e-mail or login)
 * Always the same answer, whether the account exists or not (no account guessing).
 * The account needs an e-mail (Ustawienia -> E-mail do odzyskiwania hasła);
 * otherwise the admin sets a new password in Ustawienia -> Konta.
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Users.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/RateLimit.php';
require_once __DIR__ . '/../config/Mailer.php';

const RESET_VALID_MINUTES = 60;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$email = trim((string) ($input['email'] ?? ''));

if ($email === '') {
    Response::validationError(['email' => 'Wpisz e-mail albo login.']);
}

$answer = 'Jeśli konto ma ten e-mail, wysłałam link do ustawienia nowego hasła (ważny godzinę). Nie widzisz go? Sprawdź spam albo poproś administratora o nowe hasło.';

try {
    $db = new Database();
    $conn = $db->getConnection();
    Users::ensure($conn);
    Schema::ensure($conn, 'password_resets');

    $ip = RateLimit::ip();
    if (RateLimit::wait($conn, 'reset', $ip, 5, 60) > 0 || RateLimit::wait($conn, 'reset_to', mb_strtolower($email), 3, 60) > 0) {
        Response::success(null, $answer);
    }
    RateLimit::hit($conn, 'reset', $ip);
    RateLimit::hit($conn, 'reset_to', mb_strtolower($email));

    $stmt = $conn->prepare("SELECT id, username, email, display_name FROM users WHERE (email = :email OR username = :login) AND is_active = 1 LIMIT 1");
    $stmt->execute(['email' => $email, 'login' => $email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user && filter_var($user['email'], FILTER_VALIDATE_EMAIL)) {
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $conn->prepare("DELETE FROM password_resets WHERE user_id = :user_id OR expires_at < NOW()")->execute(['user_id' => $user['id']]);
        $conn->prepare("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (:user_id, :hash, :expires)")
            ->execute([
                'user_id' => $user['id'],
                'hash' => hash('sha256', $token),
                'expires' => date('Y-m-d H:i:s', time() + RESET_VALID_MINUTES * 60),
            ]);
        $name = trim((string) $user['display_name']) ?: $user['username'];
        $link = Mailer::appUrl() . '/reset-password?token=' . $token;
        Mailer::send(
            $user['email'],
            'Nowe hasło do Goni',
            "Cześć {$name}!\n\nKliknij, żeby ustawić nowe hasło (link działa godzinę):\n{$link}\n\n"
            . "Login: {$user['username']}\n\nTo nie Ty? Zignoruj tę wiadomość - hasło się nie zmieni.\n"
        );
    }

    Response::success(null, $answer);

} catch (Exception $e) {
    Response::error('Wystąpił błąd serwera.', 500);
}
