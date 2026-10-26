<?php
/**
 * OPTIONAL: read a stored document with AI (Claude Sonnet) and fill in its details
 * POST /api/documents/analyze.php?id=123
 *
 * Runs only when the user asks for it (switch when adding, button in the editor),
 * because the document is sent to Anthropic. Never sent to Gemini (see
 * AiClient::extractDocument).
 *
 * Sets: title, counterparty, doc_date, status (signed | to_sign), notes (summary +
 * parties), terms (deadlines, exclusivity, licence - reminders on Start; copied into a
 * linked collaboration) and, when the AI reads the text better than the device OCR, content_text.
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/AiSettings.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/helpers.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

const DOCUMENTS_AI_IMAGE_MAX = 5 * 1024 * 1024;   // API limit per image
const DOCUMENTS_AI_TEXT_MAX = 200000;              // characters sent for Word/Excel/TXT

try {
    $userId = getCurrentUserId();
    $id = intval($_GET['id'] ?? 0);
    if ($id <= 0) {
        Response::validationError(['id' => 'Valid id required']);
    }
    @set_time_limit(300);

    $db = new Database();
    $conn = $db->getConnection();
    documentsEnsureSchema($conn);
    AiSettings::apply($conn, $userId);

    $stmt = $conn->prepare("SELECT id, stored_name, mime_type, original_name, content_text FROM documents WHERE id = :id AND user_id = :user_id");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $document = $stmt->fetch();
    if (!$document) {
        Response::notFound('Dokument nie istnieje');
    }

    $path = documentsUploadDir() . '/' . $document['stored_name'];
    if (!is_file($path)) {
        Response::notFound('Plik nie istnieje na serwerze');
    }

    $mime = $document['mime_type'];
    $hasText = trim((string) $document['content_text']) !== '';
    $parts = [];

    if ($mime === 'application/pdf') {
        $parts[] = ['media_type' => 'application/pdf', 'data' => base64_encode(file_get_contents($path))];
    } elseif (in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        if (filesize($path) > DOCUMENTS_AI_IMAGE_MAX) {
            Response::error('Zdjęcie jest za duże dla AI (max 5 MB). Zapisz je jako PDF albo zmniejsz.', 413);
        }
        $parts[] = ['media_type' => $mime, 'data' => base64_encode(file_get_contents($path))];
    } elseif ($hasText) {
        $parts[] = ['text' => "<dokument nazwa=\"" . htmlspecialchars($document['original_name']) . "\">\n"
            . mb_substr($document['content_text'], 0, DOCUMENTS_AI_TEXT_MAX) . "\n</dokument>"];
    } else {
        Response::error('AI nie odczyta tego formatu. Zapisz dokument jako PDF albo DOCX.', 422);
    }

    // Full text is requested for PDFs/photos: the AI reads scans better than the device OCR
    $needsText = !$hasText || $mime === 'application/pdf' || strpos($mime, 'image/') === 0;
    $result = AiClient::extractDocument(documentsAnalyzePrompt(date('Y-m-d'), $needsText), $parts, documentsAnalyzeSchema());

    $title = trim((string) ($result['title'] ?? ''));
    $docDate = documentsParseDate($result['doc_date'] ?? '');
    if ($docDate !== null && $docDate > date('Y-m-d', strtotime('+1 year'))) {
        $docDate = null;
    }
    $status = in_array($result['status'] ?? '', DOCUMENTS_STATUSES, true) ? $result['status'] : 'signed';

    $notes = trim((string) ($result['summary'] ?? ''));
    $parties = array_filter(array_map('trim', (array) ($result['parties'] ?? [])));
    if ($parties) {
        $notes .= ($notes !== '' ? "\n" : '') . 'Strony: ' . implode(', ', $parties);
    }
    $counterparty = documentsNormalizeCounterparty($result['counterparty'] ?? '');
    $aiAmount = documentsParseMoney($result['amount_gross'] ?? '');
    $aiKind = in_array($result['kind'] ?? '', DOCUMENTS_KINDS, true) ? $result['kind'] : null;

    $fields = ['status = :status', 'analyzed_at = NOW()'];
    $params = ['id' => $id, 'user_id' => $userId, 'status' => $status];
    if ($title !== '') {
        $fields[] = 'title = :title';
        $params['title'] = mb_substr($title, 0, 255);
    }
    if ($docDate !== null) {
        $fields[] = 'doc_date = :doc_date';
        $params['doc_date'] = $docDate;
    }
    if ($notes !== '') {
        $fields[] = 'notes = :notes';
        $params['notes'] = $notes;
    }
    if ($counterparty !== '') {
        $fields[] = 'counterparty = :counterparty';
        $params['counterparty'] = mb_substr($counterparty, 0, 255);
    }
    if ($aiAmount !== null) {
        $fields[] = 'amount = :amount';
        $params['amount'] = $aiAmount;
    }
    if ($aiKind !== null) {
        $fields[] = 'doc_kind = :doc_kind';
        $params['doc_kind'] = $aiKind;
    }
    $terms = documentsCleanTerms($result['terms'] ?? null);
    $fields[] = 'terms = :terms';
    $params['terms'] = $terms ? json_encode($terms, JSON_UNESCAPED_UNICODE) : null;

    $text = $needsText ? documentsCleanText($result['text'] ?? '') : '';
    // keep the device OCR when the AI returned much less text
    if ($text !== '' && mb_strlen($text) >= mb_strlen((string) $document['content_text']) * 0.6) {
        $fields[] = 'content_text = :content_text';
        $params['content_text'] = $text;
    }

    $conn->prepare("UPDATE documents SET " . implode(', ', $fields) . " WHERE id = :id AND user_id = :user_id")->execute($params);

    // A contract already linked to a collaboration fills its empty deadlines
    $linked = $conn->prepare("SELECT collaboration_id FROM documents WHERE id = :id AND user_id = :user_id");
    $linked->execute(['id' => $id, 'user_id' => $userId]);
    $collabId = (int) $linked->fetchColumn();
    if ($terms && $collabId) {
        require_once __DIR__ . '/../collaborations/helpers.php';
        collabApplyTerms($conn, $userId, $collabId, $terms);
    }

    $stmt = $conn->prepare("
        SELECT id, title, notes, status, doc_date, counterparty, doc_kind, amount, analyzed_at, terms, (content_text IS NOT NULL AND content_text <> '') AS has_text
        FROM documents WHERE id = :id AND user_id = :user_id
    ");
    $stmt->execute(['id' => $id, 'user_id' => $userId]);
    $row = $stmt->fetch();
    $row['id'] = (int) $row['id'];
    $row['has_text'] = (bool) $row['has_text'];
    $row['terms'] = documentsTerms($row['terms']);

    Response::success($row, 'Dokument rozpoznany');

} catch (RuntimeException $e) {
    Response::error($e->getMessage(), 502);
} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('Analyze failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się rozpoznać dokumentu', 500);
}

function documentsAnalyzePrompt($today, $needsText)
{
    $textRule = $needsText
        ? '- text: pełny tekst dokumentu przepisany dokładnie, strona po stronie, razem z pismem odręcznym (tekst posłuży do wyszukiwania). Pomiń powtarzające się stopki.'
        : '- text: pusty tekst (treść już mamy).';

    return <<<TXT
Jesteś asystentką influencerki i stylistki z Polski. Dostajesz jej dokument: najczęściej umowę (współpraca z marką, NDA, umowa o dzieło, licencja), aneks, zlecenie, ofertę lub fakturę. Uzupełnij dane do jej archiwum dokumentów.

Dzisiaj jest {$today}.

Pola:
- title: krótka nazwa do listy: rodzaj dokumentu + druga strona (marka/firma) + rok, np. "Umowa NDA — Zalando 2026", "Umowa o dzieło — LPP (Reserved) 2025", "Aneks nr 2 — Answear". Bez numerów i dat dziennych.
- doc_date: data zawarcia lub podpisania (RRRR-MM-DD). Gdy jej brak - data sporządzenia z nagłówka. Pusty tekst, gdy nie ma żadnej daty.
- status: "signed", jeśli widać podpisy (odręczne, elektroniczne, kwalifikowane, adnotację o podpisaniu) przynajmniej jednej strony i dokument wygląda na zawarty; "to_sign", jeśli to projekt/wzór, pola podpisów są puste albo dokument czeka na podpis. Gdy nie da się ocenić (np. faktura) - "signed".
- parties: strony dokumentu (nazwy firm lub imiona i nazwiska), maksymalnie 4.
- kind: "umowa" (umowa, aneks, porozumienie), "rachunek" (rachunek do umowy), "faktura" albo "inne".
- amount_gross: łączna kwota wynagrodzenia BRUTTO w złotych jako liczba (z umowy albo rachunku/faktury: kwota brutto / do zapłaty). 0, gdy brak kwoty. Nie podawaj kwoty netto ani "do wypłaty".
- counterparty: druga strona - firma lub osoba, z którą właścicielka archiwum zawiera dokument (nie ona sama). Pełna nazwa z formą prawną, np. "Zalando Polska sp. z o.o.". Pusty tekst, gdy nie wiadomo.
- summary: 2-4 krótkie zdania po polsku: czego dotyczy, wynagrodzenie i terminy płatności, okres obowiązywania lub termin realizacji, najważniejsze obowiązki, kary umowne, poufność i wyłączność (do kiedy). Tylko to, co jest w dokumencie.
- terms: terminy i ograniczenia z umowy - z nich powstaną przypomnienia, więc tylko to, co wprost wynika z dokumentu:
  - publish_by: do kiedy trzeba opublikować / oddać materiał (RRRR-MM-DD), pusty tekst gdy brak.
  - payment_days: w ilu dniach marka ma zapłacić (np. 14, 30), 0 gdy brak.
  - payment_due: konkretna data płatności, jeśli podana (RRRR-MM-DD), inaczej pusty tekst.
  - exclusivity_until: do kiedy obowiązuje wyłączność / zakaz współpracy z konkurencją (RRRR-MM-DD). Gdy umowa podaje okres (np. "3 miesiące od publikacji"), wylicz datę od terminu publikacji albo daty umowy. Pusty tekst, gdy brak wyłączności.
  - exclusivity_scope: czego dotyczy wyłączność (np. "kosmetyki do włosów", "odzież sportowa"), krótko; pusty tekst, gdy brak.
  - license_until: do kiedy marka może używać jej wizerunku / materiałów (RRRR-MM-DD), wyliczone jak wyżej; pusty tekst, gdy bezterminowo lub brak.
  - revisions: ile rund poprawek jest w cenie, 0 gdy nie podano.
  - penalty: kary umowne jednym krótkim zdaniem (np. "500 zł za każdy dzień opóźnienia"), pusty tekst gdy brak.
  - deliverables: co dokładnie trzeba zrobić, krótko (np. "1 rolka + 3 stories"), pusty tekst gdy nie wiadomo.
{$textRule}
TXT;
}

function documentsAnalyzeSchema()
{
    return [
        'type' => 'object',
        'properties' => [
            'title' => ['type' => 'string'],
            'doc_date' => ['type' => 'string'],
            'status' => ['type' => 'string', 'enum' => DOCUMENTS_STATUSES],
            'parties' => ['type' => 'array', 'items' => ['type' => 'string']],
            'counterparty' => ['type' => 'string'],
            'kind' => ['type' => 'string', 'enum' => DOCUMENTS_KINDS],
            'amount_gross' => ['type' => 'number'],
            'summary' => ['type' => 'string'],
            'terms' => [
                'type' => 'object',
                'properties' => [
                    'publish_by' => ['type' => 'string'],
                    'payment_days' => ['type' => 'integer'],
                    'payment_due' => ['type' => 'string'],
                    'exclusivity_until' => ['type' => 'string'],
                    'exclusivity_scope' => ['type' => 'string'],
                    'license_until' => ['type' => 'string'],
                    'revisions' => ['type' => 'integer'],
                    'penalty' => ['type' => 'string'],
                    'deliverables' => ['type' => 'string'],
                ],
                'required' => DOCUMENTS_TERM_KEYS,
                'additionalProperties' => false,
            ],
            'text' => ['type' => 'string'],
        ],
        'required' => ['title', 'doc_date', 'status', 'parties', 'counterparty', 'kind', 'amount_gross', 'summary', 'terms', 'text'],
        'additionalProperties' => false,
    ];
}
