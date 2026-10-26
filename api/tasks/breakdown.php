<?php
/**
 * "Za trudne teraz? Rozbij na kroki" - AI splits a task into 3-6 tiny first steps
 * (Goblin Tools style). Saved on the task; Start shows one step at a time.
 *
 * POST /api/tasks/breakdown.php?id=12 { smaller?: true }  -> { steps: [{ text, done }] }
 * "smaller" asks for even tinier steps (the first ones were still too big).
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/AiSettings.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

try {
    $userId = getCurrentUserId();
    $id = (int) ($_GET['id'] ?? 0);
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $smaller = !empty($input['smaller']);

    $db = new Database();
    $conn = $db->getConnection();
    Schema::ensure($conn, 'tasks');
    Schema::ensureColumn($conn, 'tasks', 'steps');
    AiSettings::apply($conn, $userId);

    $stmt = $conn->prepare("SELECT id, title FROM tasks WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $task = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$task) {
        Response::notFound('Nie ma takiego zadania');
    }
    if (!AiClient::provider()) {
        Response::error('Rozbijanie na kroki wymaga klucza AI (Ustawienia -> Czytanie screenów).', 503);
    }

    $size = $smaller
        ? 'Kroki mają być MALUTKIE - każdy do 2 minut, pierwszy tak prosty, że nie da się go nie zrobić (np. "Otwórz maila od marki").'
        : 'Każdy krok do ok. 5-10 minut, pierwszy bardzo łatwy, żeby łatwo zacząć.';
    $prompt = <<<PROMPT
Pomagasz osobie z ADHD (stylistka, influencerka) zacząć zadanie, które ją przytłacza. Rozbij je na 3-6 konkretnych kroków w kolejności.
{$size}
Każdy krok: krótko, po polsku, zaczyna się od czasownika w trybie rozkazującym, bez numeracji, do 70 znaków. Bez rad i komentarzy - tylko kroki.
PROMPT;
    $schema = [
        'type' => 'object',
        'properties' => ['steps' => ['type' => 'array', 'items' => ['type' => 'string']]],
        'required' => ['steps'],
        'additionalProperties' => false,
    ];
    $result = AiClient::classifyText($prompt, 'Zadanie: ' . $task['title'], $schema);

    $steps = [];
    foreach ((array) ($result['steps'] ?? []) as $text) {
        $text = trim(preg_replace('/^\s*(\d+[.)]|-|•)\s*/u', '', (string) $text));
        if ($text !== '') {
            $steps[] = ['text' => mb_substr($text, 0, 200), 'done' => false];
        }
    }
    $steps = array_slice($steps, 0, 6);
    if (count($steps) < 2) {
        Response::error('AI nie rozbiło tego zadania. Spróbuj jeszcze raz.', 502);
    }
    $conn->prepare("UPDATE tasks SET steps = :steps WHERE id = :id")->execute(['steps' => json_encode($steps, JSON_UNESCAPED_UNICODE), 'id' => $id]);

    Response::success(['steps' => $steps]);
} catch (RuntimeException $e) {
    Response::error($e->getMessage(), 502);
} catch (Exception $e) {
    Response::error('Nie udało się rozbić zadania', 500);
}
