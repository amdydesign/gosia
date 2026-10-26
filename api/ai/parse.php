<?php
/**
 * Read screenshots with AI and return form-ready data.
 *
 * POST /api/ai/parse.php
 * body: { mode: "purchase" | "collaboration", images: [{ media_type: "image/jpeg", data: "<base64>" }] }
 *
 * purchase      -> { store, purchase_date, order_number, return_days, items: [{ name, amount }], total }
 * collaboration -> { brand, amount_gross, collab_type, type, date, notes, publish_by, payment_days }
 * insights      -> { views, likes, comments, shares, saves, reach, published_date }  (reel statistics screen)
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../config/AiSettings.php';
require_once __DIR__ . '/../middleware/auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error('Method not allowed', 405);
}

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const BILLING_TYPES = ['umowa_50', 'umowa_20', 'useme_50', 'useme_20', 'gotowka', 'nieznane'];
const COLLAB_TYPES = ['post-instagram', 'story', 'reel', 'sesja', 'event', 'konsultacja', 'inne'];

try {
    $userId = getCurrentUserId();
    @set_time_limit(120);

    $db = new Database();
    AiSettings::apply($db->getConnection(), $userId);
    if (!AiClient::provider()) {
        Response::error('Czytanie screenów jest wyłączone - wpisz klucz AI w Ustawieniach.', 503);
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $mode = $input['mode'] ?? 'purchase';
    if (!in_array($mode, ['purchase', 'collaboration', 'insights'], true)) {
        Response::error('Nieznany tryb', 400);
    }

    $images = [];
    foreach (array_slice($input['images'] ?? [], 0, MAX_IMAGES) as $image) {
        $type = strtolower($image['media_type'] ?? '');
        $data = preg_replace('#^data:[^;]+;base64,#', '', (string) ($image['data'] ?? ''));
        if (!in_array($type, ALLOWED_TYPES, true) || $data === '') {
            continue;
        }
        $bytes = base64_decode($data, true);
        if ($bytes === false || strlen($bytes) > MAX_IMAGE_BYTES) {
            Response::error('Obraz jest za duży lub uszkodzony.', 413);
        }
        $images[] = ['media_type' => $type, 'data' => $data];
    }
    if (!$images) {
        Response::error('Dodaj przynajmniej jeden obraz (JPG, PNG, WEBP).', 400);
    }

    $today = date('Y-m-d');

    if ($mode === 'purchase') {
        $result = AiClient::extract(purchasePrompt($today), $images, purchaseSchema());
        Response::success(normalizePurchase($result));
    }

    if ($mode === 'insights') {
        $result = AiClient::extract(insightsPrompt($today), $images, insightsSchema());
        Response::success(normalizeInsights($result));
    }

    $result = AiClient::extract(collaborationPrompt($today), $images, collaborationSchema());
    Response::success(normalizeCollaboration($result));

} catch (RuntimeException $e) {
    Response::error($e->getMessage(), 502);
} catch (Exception $e) {
    if (($_ENV['APP_DEBUG'] ?? '') === 'true') {
        Response::error('AI parse failed: ' . $e->getMessage(), 500);
    }
    Response::error('Nie udało się odczytać screena', 500);
}

// ---------------------------------------------------------------- purchase

function purchasePrompt($today)
{
    return <<<TXT
Jesteś asystentką stylistki z Polski. Na obrazach jest zrzut ekranu lub zdjęcie zakupu: potwierdzenie zamówienia, e-mail ze sklepu, koszyk, historia zamówień albo paragon. Kilka obrazów to zwykle fragmenty tego samego zamówienia - połącz je i nie dubluj pozycji.

Dzisiaj jest {$today}.

Wypełnij pola:
- is_purchase: false, jeśli obraz w ogóle nie przedstawia zakupu.
- store: nazwa sklepu lub marki, krótko (np. "Zalando", "Zara", "Reserved", "H&M", "Answear").
- purchase_date: data zakupu lub złożenia zamówienia w formacie RRRR-MM-DD. Brak roku -> przyjmij najbliższą przeszłą datę. Brak daty -> pusty tekst.
- order_number: numer zamówienia lub paragonu, pusty tekst jeśli go nie ma.
- return_days: ile dni jest na zwrot. Weź z obrazu, jeśli jest podane. Jeśli nie, a znasz standardową politykę zwrotów tego sklepu w Polsce, podaj ją. W innym razie 0.
- items: każda kupiona rzecz osobno. name: krótka polska nazwa rzeczy (np. "Sukienka midi satynowa"), details: rozmiar i kolor jeśli widoczne (np. "M, czarna"), price: zapłacona kwota za tę pozycję po rabatach w złotych (dla ilości > 1 łączna kwota), quantity: ilość. Nie dodawaj dostawy ani opłat jako rzeczy.
- total: łączna zapłacona kwota zamówienia w złotych (0 jeśli nie widać).
Kwoty podawaj jako liczby (np. 129.99), bez waluty.
TXT;
}

function purchaseSchema()
{
    return [
        'type' => 'object',
        'properties' => [
            'is_purchase' => ['type' => 'boolean'],
            'store' => ['type' => 'string'],
            'purchase_date' => ['type' => 'string'],
            'order_number' => ['type' => 'string'],
            'return_days' => ['type' => 'integer'],
            'items' => [
                'type' => 'array',
                'items' => [
                    'type' => 'object',
                    'properties' => [
                        'name' => ['type' => 'string'],
                        'details' => ['type' => 'string'],
                        'price' => ['type' => 'number'],
                        'quantity' => ['type' => 'integer'],
                    ],
                    'required' => ['name', 'details', 'price', 'quantity'],
                    'additionalProperties' => false,
                ],
            ],
            'total' => ['type' => 'number'],
        ],
        'required' => ['is_purchase', 'store', 'purchase_date', 'order_number', 'return_days', 'items', 'total'],
        'additionalProperties' => false,
    ];
}

function normalizePurchase(array $r)
{
    $items = [];
    foreach ($r['items'] ?? [] as $item) {
        $name = trim((string) ($item['name'] ?? ''));
        if ($name === '') {
            continue;
        }
        $details = trim((string) ($item['details'] ?? ''));
        $qty = max(1, (int) ($item['quantity'] ?? 1));
        if ($details !== '') {
            $name .= ' (' . $details . ')';
        }
        if ($qty > 1) {
            $name .= ' ×' . $qty;
        }
        $items[] = [
            'name' => mb_substr($name, 0, 250),
            'amount' => round(max(0, (float) ($item['price'] ?? 0)), 2),
        ];
    }

    $date = (string) ($r['purchase_date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || strtotime($date) === false || $date > date('Y-m-d')) {
        $date = '';
    }

    return [
        'is_purchase' => !empty($r['is_purchase']) || count($items) > 0,
        'store' => mb_substr(trim((string) ($r['store'] ?? '')), 0, 100),
        'purchase_date' => $date,
        'order_number' => mb_substr(trim((string) ($r['order_number'] ?? '')), 0, 60),
        'return_days' => max(0, min(365, (int) ($r['return_days'] ?? 0))),
        'items' => $items,
        'total' => round(max(0, (float) ($r['total'] ?? 0)), 2),
    ];
}

// ---------------------------------------------------------------- collaboration

function collaborationPrompt($today)
{
    $billing = implode(', ', BILLING_TYPES);
    $types = implode(', ', COLLAB_TYPES);
    return <<<TXT
Jesteś asystentką stylistki i influencerki z Polski. Na obrazach jest zlecenie współpracy: e-mail lub wiadomość od marki, brief, umowa, zlecenie z Use.me albo faktura.

Dzisiaj jest {$today}.

Wypełnij pola:
- brand: nazwa marki lub klienta, krótko.
- amount_gross: kwota wynagrodzenia brutto w złotych jako liczba (0 jeśli nie podano).
- collab_type: forma rozliczenia, jedna z: {$billing}. "umowa_50" = umowa o dzieło z 50% kosztów (prawa autorskie), "umowa_20" = umowa o dzieło 20%, "useme_50"/"useme_20" = rozliczenie przez Use.me, "gotowka" = gotówka. Gdy nie wiadomo -> "nieznane".
- type: rodzaj pracy, jeden z: {$types}. post-instagram = post, story = relacje, reel = rolka, sesja = sesja zdjęciowa.
- date: data realizacji lub publikacji (RRRR-MM-DD), a jeśli jej nie ma - data wiadomości. Pusty tekst, gdy brak daty.
- notes: 1-2 krótkie zdania po polsku: co trzeba zrobić i terminy.
- publish_by: do kiedy trzeba opublikować / oddać materiał (RRRR-MM-DD), pusty tekst gdy nie podano.
- payment_days: w ilu dniach marka zapłaci (np. 14, 30), 0 gdy nie podano.
TXT;
}

function collaborationSchema()
{
    return [
        'type' => 'object',
        'properties' => [
            'brand' => ['type' => 'string'],
            'amount_gross' => ['type' => 'number'],
            'collab_type' => ['type' => 'string', 'enum' => BILLING_TYPES],
            'type' => ['type' => 'string', 'enum' => COLLAB_TYPES],
            'date' => ['type' => 'string'],
            'notes' => ['type' => 'string'],
            'publish_by' => ['type' => 'string'],
            'payment_days' => ['type' => 'integer'],
        ],
        'required' => ['brand', 'amount_gross', 'collab_type', 'type', 'date', 'notes', 'publish_by', 'payment_days'],
        'additionalProperties' => false,
    ];
}

function normalizeCollaboration(array $r)
{
    $date = (string) ($r['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || strtotime($date) === false) {
        $date = '';
    }
    $billing = in_array($r['collab_type'] ?? '', BILLING_TYPES, true) ? $r['collab_type'] : 'nieznane';
    $type = in_array($r['type'] ?? '', COLLAB_TYPES, true) ? $r['type'] : 'inne';

    return [
        'brand' => mb_substr(trim((string) ($r['brand'] ?? '')), 0, 100),
        'amount_gross' => round(max(0, (float) ($r['amount_gross'] ?? 0)), 2),
        'collab_type' => $billing === 'nieznane' ? null : $billing,
        'type' => $type,
        'date' => $date,
        'notes' => mb_substr(trim((string) ($r['notes'] ?? '')), 0, 1000),
        'publish_by' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($r['publish_by'] ?? '')) ? $r['publish_by'] : '',
        'payment_days' => ((int) ($r['payment_days'] ?? 0)) > 0 && ((int) $r['payment_days']) <= 365 ? (int) $r['payment_days'] : null,
    ];
}

function insightsPrompt($today)
{
    return <<<TXT
Na obrazach są statystyki jednej rolki / posta z Instagrama, TikToka albo YouTube (ekran "Statystyki", "Insights", "Analityka").
Dzisiaj jest {$today}.

Przepisz liczby jako liczby całkowite (np. "12,4 tys." = 12400, "1,2 mln" = 1200000). 0, gdy danej liczby nie widać.
- views: wyświetlenia (odtworzenia).
- likes: polubienia.
- comments: komentarze.
- shares: udostępnienia.
- saves: zapisania.
- reach: zasięg (konta, do których dotarła).
- published_date: data publikacji (RRRR-MM-DD), pusty tekst gdy nie widać.
TXT;
}

function insightsSchema()
{
    $int = ['type' => 'integer'];
    return [
        'type' => 'object',
        'properties' => ['views' => $int, 'likes' => $int, 'comments' => $int, 'shares' => $int, 'saves' => $int, 'reach' => $int, 'published_date' => ['type' => 'string']],
        'required' => ['views', 'likes', 'comments', 'shares', 'saves', 'reach', 'published_date'],
        'additionalProperties' => false,
    ];
}

function normalizeInsights(array $r)
{
    $out = [];
    foreach (['views', 'likes', 'comments', 'shares', 'saves', 'reach'] as $key) {
        $out[$key] = max(0, (int) ($r[$key] ?? 0));
    }
    $date = (string) ($r['published_date'] ?? '');
    $out['published_date'] = preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) && $date <= date('Y-m-d') ? $date : '';
    return $out;
}
