<?php
/**
 * "Asystent": tools Claude calls to read her panel (and add a task).
 *
 * Everything is read-only except dodaj_zadanie / dodaj_pomysl / edytuj_pomysl - each can be undone from the toast.
 * Results are small JSON documents in Polish field names, so the model can quote them.
 */

require_once __DIR__ . '/../config/Schema.php';
require_once __DIR__ . '/../purchases/helpers.php';
require_once __DIR__ . '/../collaborations/helpers.php';
require_once __DIR__ . '/../documents/helpers.php';
require_once __DIR__ . '/TodayAgenda.php';
require_once __DIR__ . '/CapturePrompts.php';
require_once __DIR__ . '/TaskReminder.php';
require_once __DIR__ . '/ReelPrompts.php';
require_once __DIR__ . '/WritingStyle.php';

class AssistantTools
{
    const MAX_ROWS = 60;
    const MAX_DOC_TEXT = 30000;

    /** Tool definitions for the Messages API. */
    public static function definitions()
    {
        $date = ['type' => 'string', 'description' => 'Data RRRR-MM-DD'];
        $tools = [
            [
                'name' => 'plan_dnia',
                'description' => 'Co Gosia ma dziś i w tym tygodniu do zrobienia: zwroty do wysłania, przelewy do sprawdzenia, publikacje z terminem, umowy do podpisu, zadania, rolki zaplanowane na dziś. Ta sama lista co na ekranie Start. Używaj przy pytaniach typu "co mam dziś", "co jest pilne", "od czego zacząć".',
                'input_schema' => ['type' => 'object', 'properties' => new stdClass()],
            ],
            [
                'name' => 'wspolprace',
                'description' => 'Współprace z markami: marka, rodzaj, data, kwoty brutto/netto, status płatności, termin przelewu, termin publikacji, co jest do zrobienia (deliverables). Domyślnie aktywne (nieopłacone albo z pracą do zrobienia).',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'zakres' => ['type' => 'string', 'enum' => ['aktywne', 'nieoplacone', 'po_terminie', 'wszystkie'], 'description' => 'Które współprace'],
                        'marka' => ['type' => 'string', 'description' => 'Fragment nazwy marki'],
                        'od' => $date,
                        'do' => $date,
                    ],
                ],
            ],
            [
                'name' => 'zarobki',
                'description' => 'Podsumowanie zarobków ze współprac w okresie: suma opłaconych (brutto i netto) liczona wg dnia wpływu, ile jeszcze czeka na przelew, podział na miesiące i najlepsze marki. Używaj zamiast liczyć samemu.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => ['od' => $date, 'do' => $date],
                    'required' => ['od', 'do'],
                ],
            ],
            [
                'name' => 'zakupy',
                'description' => 'Zakupy ubrań (do stylizacji) i zwroty: sklep, rzeczy, kwota, termin zwrotu i ile dni zostało, status. "do_zwrotu" = trzymane rzeczy z otwartym terminem zwrotu; "czeka_na_pieniadze" = odesłane, sklep jeszcze nie oddał pieniędzy.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'zakres' => ['type' => 'string', 'enum' => ['do_zwrotu', 'czeka_na_pieniadze', 'wszystkie']],
                        'sklep' => ['type' => 'string', 'description' => 'Fragment nazwy sklepu'],
                    ],
                ],
            ],
            [
                'name' => 'pomysly',
                'description' => 'Pomysły i scenariusze rolek (Instagram/TikTok): tytuł, status (do nagrania / nagrane), plan na dzień, wyświetlenia. Podaj id, żeby dostać pełny scenariusz jednej rolki.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'szukaj' => ['type' => 'string', 'description' => 'Fragment tytułu lub treści'],
                        'status' => ['type' => 'string', 'enum' => ['do_nagrania', 'nagrane', 'wszystkie']],
                        'id' => ['type' => 'integer', 'description' => 'Id pomysłu - zwraca pełną treść'],
                    ],
                ],
            ],
            [
                'name' => 'dokumenty',
                'description' => 'Umowy i dokumenty (poufne): tytuł, druga strona, marka, rodzaj, data, kwota, czy podpisane. Podaj id, żeby dostać pełny tekst jednego dokumentu (np. żeby sprawdzić warunki umowy).',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'szukaj' => ['type' => 'string', 'description' => 'Fragment tytułu, marki lub drugiej strony'],
                        'id' => ['type' => 'integer', 'description' => 'Id dokumentu - zwraca jego tekst'],
                    ],
                ],
            ],
            [
                'name' => 'dodaj_zadanie',
                'description' => 'Dodaje zadanie do listy Gosi (pojawi się na Start w dniu terminu). Gdy poda godzinę, telefon przypomni powiadomieniem. Używaj, gdy prosi "przypomnij mi", "zapisz", "dodaj do zrobienia". Jedno zadanie na wywołanie.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'tytul' => ['type' => 'string', 'description' => 'Krótko, od czasownika, np. "Odpisać Zarze w sprawie briefu"'],
                        'termin' => ['type' => 'string', 'description' => 'Dzień RRRR-MM-DD; bez terminu = dziś'],
                        'przypomnij' => ['type' => 'string', 'description' => 'Powiadomienie "RRRR-MM-DD GG:MM" - tylko gdy podała godzinę'],
                    ],
                    'required' => ['tytul'],
                ],
            ],
            [
                'name' => 'dodaj_pomysl',
                'description' => 'Zapisuje pomysł / scenariusz rolki w Pomysłach Gosi (status "do nagrania"). Używaj, gdy prosi "dodaj do pomysłów", "zapisz ten scenariusz", "wrzuć to do pomysłów". Wpisz pełną treść scenariusza dokładnie tak, jak ma się znaleźć w prompterze - bez komentarzy od siebie. Jeden pomysł na wywołanie.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'tytul' => ['type' => 'string', 'description' => 'Krótki tytuł rolki'],
                        'tresc' => ['type' => 'string', 'description' => 'Pełny scenariusz / treść pomysłu'],
                        'nagrac_dnia' => ['type' => 'string', 'description' => 'RRRR-MM-DD - tylko gdy poda, kiedy chce nagrać'],
                    ],
                    'required' => ['tytul', 'tresc'],
                ],
            ],
            [
                'name' => 'edytuj_pomysl',
                'description' => 'Zmienia istniejący pomysł w Pomysłach: tytuł, treść scenariusza (podmienia całą treść - wpisz pełną nową wersję), dzień nagrania albo status. Id znajdziesz narzędziem pomysly (lub z dodaj_pomysl). Podaj tylko pola, które się zmieniają. Gosia może cofnąć zmianę jednym stuknięciem.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'id' => ['type' => 'integer', 'description' => 'Id pomysłu'],
                        'tytul' => ['type' => 'string', 'description' => 'Nowy tytuł'],
                        'tresc' => ['type' => 'string', 'description' => 'Pełna nowa treść scenariusza'],
                        'nagrac_dnia' => ['type' => 'string', 'description' => 'RRRR-MM-DD, albo "" żeby zdjąć z planu'],
                        'status' => ['type' => 'string', 'enum' => ['do_nagrania', 'nagrane']],
                    ],
                    'required' => ['id'],
                ],
            ],
            [
                'name' => 'moj_styl',
                'description' => 'Styl Gosi: jej najlepsze scenariusze rolek (najpierw te z największą liczbą wyświetleń), jej uwagi do stylu i zasady, żeby tekst nie brzmiał jak AI. ZAWSZE wywołaj przed napisaniem lub poprawieniem scenariusza rolki, opisu posta, captionu, maila, wiadomości do marki albo innego tekstu w jej imieniu - i pisz potem dokładnie jej głosem.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => [
                        'rodzaj' => ['type' => 'string', 'enum' => ['scenariusz', 'opis_posta', 'wiadomosc', 'inne'], 'description' => 'Co będziesz pisać'],
                        'odswiez' => ['type' => 'boolean', 'description' => 'true tylko gdy Gosia prosi o odświeżenie / ponowne nauczenie się jej stylu'],
                    ],
                ],
            ],
            [
                'name' => 'zapamietaj_styl',
                'description' => 'Zapamiętuje na stałe uwagę Gosi o jej stylu pisania (np. "nie używam słowa stylówka", "zawsze kończę pytaniem do widzów", "piszę krócej"). Używaj, gdy poprawia Twój tekst albo mówi, jak pisze - jedna krótka uwaga na wywołanie, jej słowami.',
                'input_schema' => [
                    'type' => 'object',
                    'properties' => ['uwaga' => ['type' => 'string', 'description' => 'Krótka, konkretna uwaga']],
                    'required' => ['uwaga'],
                ],
            ],
        ];
        // stream tool arguments as they are written; run() checks them before use
        foreach ($tools as &$tool) {
            $tool['eager_input_streaming'] = true;
        }
        return $tools;
    }

    /** Short "what I am doing" line for the app while a tool runs. */
    public static function statusText($name)
    {
        $labels = [
            'plan_dnia' => 'Sprawdzam plan dnia…',
            'wspolprace' => 'Sprawdzam współprace…',
            'zarobki' => 'Liczę zarobki…',
            'zakupy' => 'Sprawdzam zakupy i zwroty…',
            'pomysly' => 'Przeglądam pomysły…',
            'dokumenty' => 'Czytam dokumenty…',
            'dodaj_zadanie' => 'Dodaję zadanie…',
            'dodaj_pomysl' => 'Zapisuję w Pomysłach…',
            'edytuj_pomysl' => 'Poprawiam pomysł…',
            'moj_styl' => 'Czytam Twoje scenariusze…',
            'zapamietaj_styl' => 'Zapamiętuję…',
            'web_search' => 'Szukam w internecie…',
            'web_fetch' => 'Czytam stronę…',
        ];
        return $labels[$name] ?? 'Sprawdzam…';
    }

    /**
     * @param array $input decoded tool input (assoc)
     * @param array $events filled with app events (e.g. a created task for "Cofnij")
     * @return array [string $json, bool $isError]
     */
    public static function run(PDO $conn, $userId, $name, $input, array &$events)
    {
        if (!is_array($input)) {
            return [self::json(['blad' => 'Nieprawidłowe argumenty narzędzia - spróbuj jeszcze raz.']), true];
        }
        try {
            switch ($name) {
                case 'plan_dnia':
                    return [self::json(self::agenda($conn, $userId)), false];
                case 'wspolprace':
                    return [self::json(self::collaborations($conn, $userId, $input)), false];
                case 'zarobki':
                    return [self::json(self::earnings($conn, $userId, $input)), false];
                case 'zakupy':
                    return [self::json(self::purchases($conn, $userId, $input)), false];
                case 'pomysly':
                    return [self::json(self::ideas($conn, $userId, $input)), false];
                case 'dokumenty':
                    return [self::json(self::documents($conn, $userId, $input)), false];
                case 'dodaj_zadanie':
                    return [self::json(self::addTask($conn, $userId, $input, $events)), false];
                case 'dodaj_pomysl':
                    return [self::json(self::addIdea($conn, $userId, $input, $events)), false];
                case 'edytuj_pomysl':
                    return [self::json(self::editIdea($conn, $userId, $input, $events)), false];
                case 'moj_styl':
                    return [self::styleGuide($conn, $userId, $input, $events), false];
                case 'zapamietaj_styl':
                    return [self::json(self::rememberStyle($conn, $userId, $input, $events)), false];
            }
            return [self::json(['blad' => 'Nie ma takiego narzędzia.']), true];
        } catch (InvalidArgumentException $e) {
            return [self::json(['blad' => $e->getMessage()]), true];
        } catch (Exception $e) {
            return [self::json(['blad' => 'Nie udało się odczytać danych z panelu.']), true];
        }
    }

    // ---------------------------------------------------------------- tools

    private static function agenda(PDO $conn, $userId)
    {
        $buckets = ['today' => 'dzis', 'later' => 'dzis_pozniej', 'week' => 'ten_tydzien', 'snoozed' => 'odlozone'];
        $out = [];
        foreach (TodayAgenda::build($conn, $userId) as $item) {
            $out[] = array_filter([
                'co' => $item['title'] ?? '',
                'szczegoly' => $item['meta'] ?? null,
                'rodzaj' => $item['kind'] ?? null,
                'kiedy' => $buckets[$item['bucket'] ?? ''] ?? ($item['bucket'] ?? null),
                'termin' => $item['deadline'] ?? null,
                'dni_do_terminu' => $item['days'] ?? null,
                'godzina' => $item['time'] ?? null,
                'kwota' => $item['amount'] ?? null,
                'po_terminie' => !empty($item['late']) ? true : null,
            ], function ($v) {
                return $v !== null && $v !== '';
            });
        }
        return ['dzis' => date('Y-m-d'), 'pozycje' => $out, 'liczba' => count($out)];
    }

    private static function collaborations(PDO $conn, $userId, array $input)
    {
        Schema::ensureCollaborations($conn);
        $scope = $input['zakres'] ?? 'aktywne';
        $where = ['user_id = :user_id'];
        $params = ['user_id' => $userId];

        if ($scope === 'aktywne') {
            $where[] = "(payment_status <> 'paid' OR (publish_by IS NOT NULL AND published_at IS NULL) OR stage = 'brief')";
        } elseif ($scope === 'nieoplacone') {
            $where[] = "payment_status <> 'paid'";
        } elseif ($scope === 'po_terminie') {
            $where[] = "payment_status <> 'paid' AND " . COLLAB_DUE_SQL . " < CURDATE()";
        }
        if (!empty($input['marka'])) {
            $where[] = 'brand LIKE :brand';
            $params['brand'] = '%' . self::like($input['marka']) . '%';
        }
        if ($from = self::date($input['od'] ?? null)) {
            $where[] = 'date >= :from';
            $params['from'] = $from;
        }
        if ($to = self::date($input['do'] ?? null)) {
            $where[] = 'date <= :to';
            $params['to'] = $to;
        }

        $stmt = $conn->prepare("
            SELECT *, " . COLLAB_DUE_SQL . " AS payment_due
            FROM collaborations
            WHERE " . implode(' AND ', $where) . "
            ORDER BY date DESC, id DESC
            LIMIT " . (self::MAX_ROWS + 1)
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $more = count($rows) > self::MAX_ROWS;

        $status = ['pending' => 'czeka na przelew', 'paid' => 'opłacona', 'overdue' => 'po terminie'];
        $list = [];
        foreach (array_slice($rows, 0, self::MAX_ROWS) as $row) {
            $deliverables = [];
            foreach (collabDecodeDeliverables($row['deliverables'] ?? null) as $d) {
                $deliverables[] = array_filter([
                    'co' => $d['label'] ?? '',
                    'ile' => (int) ($d['count'] ?? 0),
                    'zrobione' => (int) ($d['done'] ?? 0),
                    'termin' => $d['due'] ?? null,
                ], function ($v) {
                    return $v !== null;
                });
            }
            $list[] = array_filter([
                'id' => (int) $row['id'],
                'marka' => $row['brand'],
                'rodzaj' => $row['type'] ?? null,
                'forma_rozliczenia' => $row['collab_type'] ?? null,
                'data' => $row['date'],
                'brutto' => (float) $row['amount_gross'],
                'netto' => (float) $row['amount_net'],
                'platnosc' => $status[$row['payment_status']] ?? $row['payment_status'],
                'termin_przelewu' => $row['payment_status'] !== 'paid' ? ($row['payment_due'] ?? null) : null,
                'oplacona_dnia' => $row['paid_at'] ?? null,
                'opublikowac_do' => $row['publish_by'] ?? null,
                'opublikowano' => $row['published_at'] ?? null,
                'w_przygotowaniu' => ($row['stage'] ?? null) === 'brief' ? true : null,
                'do_zrobienia' => $deliverables ?: null,
                'notatki' => self::short($row['notes'] ?? '', 300),
            ], function ($v) {
                return $v !== null && $v !== '';
            });
        }
        return ['zakres' => $scope, 'wspolprace' => $list, 'liczba' => count($list), 'jest_wiecej' => $more];
    }

    private static function earnings(PDO $conn, $userId, array $input)
    {
        Schema::ensureCollaborations($conn);
        $from = self::date($input['od'] ?? null);
        $to = self::date($input['do'] ?? null);
        if (!$from || !$to) {
            throw new InvalidArgumentException('Podaj daty "od" i "do" (RRRR-MM-DD).');
        }

        $stmt = $conn->prepare("
            SELECT brand, amount_gross, amount_net, payment_status, date, " . COLLAB_PAID_DAY_SQL . " AS paid_day
            FROM collaborations
            WHERE user_id = :user_id
              AND ((payment_status = 'paid' AND " . COLLAB_PAID_DAY_SQL . " BETWEEN :from AND :to)
                   OR (payment_status <> 'paid' AND date BETWEEN :from2 AND :to2))
        ");
        $stmt->execute(['user_id' => $userId, 'from' => $from, 'to' => $to, 'from2' => $from, 'to2' => $to]);

        $paid = ['brutto' => 0.0, 'netto' => 0.0, 'liczba' => 0];
        $pending = ['brutto' => 0.0, 'netto' => 0.0, 'liczba' => 0];
        $months = [];
        $brands = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $gross = (float) $row['amount_gross'];
            $net = (float) $row['amount_net'];
            if ($row['payment_status'] !== 'paid') {
                $pending['brutto'] += $gross;
                $pending['netto'] += $net;
                $pending['liczba']++;
                continue;
            }
            $paid['brutto'] += $gross;
            $paid['netto'] += $net;
            $paid['liczba']++;
            $month = substr($row['paid_day'], 0, 7);
            $months[$month] = ($months[$month] ?? 0) + $net;
            $brands[$row['brand']] = ($brands[$row['brand']] ?? 0) + $net;
        }
        ksort($months);
        arsort($brands);
        $round = function ($v) {
            return round($v, 2);
        };

        return [
            'okres' => ['od' => $from, 'do' => $to],
            'oplacone' => array_map($round, $paid),
            'czeka_na_przelew' => array_map($round, $pending),
            'netto_wg_miesiaca' => array_map($round, $months),
            'najlepsze_marki_netto' => array_map($round, array_slice($brands, 0, 8, true)),
            'uwaga' => 'Opłacone liczone wg dnia wpływu pieniędzy, nieopłacone wg daty współpracy.',
        ];
    }

    private static function purchases(PDO $conn, $userId, array $input)
    {
        Schema::ensurePurchases($conn);
        $scope = $input['zakres'] ?? 'do_zwrotu';
        $where = ['user_id = :user_id'];
        $params = ['user_id' => $userId];

        if ($scope === 'do_zwrotu') {
            $where[] = "status = 'kept' AND kept_confirmed = 0 AND DATEDIFF(" . PURCHASE_DEADLINE_SQL . ", CURDATE()) >= 0";
        } elseif ($scope === 'czeka_na_pieniadze') {
            $where[] = "status IN ('returned', 'partial') AND refunded_at IS NULL";
        }
        if (!empty($input['sklep'])) {
            $where[] = 'store LIKE :store';
            $params['store'] = '%' . self::like($input['sklep']) . '%';
        }

        $order = $scope === 'do_zwrotu' ? 'days_remaining ASC' : 'purchase_date DESC';
        $stmt = $conn->prepare("
            SELECT id, store, items, purchase_date, amount, returned_amount, status, kept_confirmed,
                   delivered_at, returned_at, refunded_at, return_cost, notes,
                   " . PURCHASE_DEADLINE_SQL . " AS return_deadline,
                   DATEDIFF(" . PURCHASE_DEADLINE_SQL . ", CURDATE()) AS days_remaining
            FROM purchases
            WHERE " . implode(' AND ', $where) . "
            ORDER BY {$order}, id DESC
            LIMIT " . (self::MAX_ROWS + 1)
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $more = count($rows) > self::MAX_ROWS;

        $status = ['kept' => 'u niej', 'returned' => 'zwrócone', 'partial' => 'zwrócone częściowo'];
        $list = [];
        $total = 0.0;
        foreach (array_slice($rows, 0, self::MAX_ROWS) as $row) {
            $total += (float) $row['amount'];
            $list[] = array_filter([
                'id' => (int) $row['id'],
                'sklep' => $row['store'],
                'rzeczy' => $row['items'],
                'kupione' => $row['purchase_date'],
                'kwota' => (float) $row['amount'],
                'status' => (int) $row['kept_confirmed'] === 1 ? 'zostaje (zatrzymane)' : ($status[$row['status']] ?? $row['status']),
                'termin_zwrotu' => $row['status'] === 'kept' ? $row['return_deadline'] : null,
                'dni_do_terminu' => $row['status'] === 'kept' ? (int) $row['days_remaining'] : null,
                'paczka_doszla' => $row['delivered_at'] ?: null,
                'odeslane' => $row['returned_at'] ? substr($row['returned_at'], 0, 10) : null,
                'zwrocono_kwote' => $row['status'] !== 'kept' ? (float) $row['returned_amount'] : null,
                'pieniadze_wrocily' => $row['refunded_at'] ?: null,
                'notatki' => self::short($row['notes'] ?? '', 200),
            ], function ($v) {
                return $v !== null && $v !== '';
            });
        }
        return ['zakres' => $scope, 'zakupy' => $list, 'liczba' => count($list), 'suma_kwot' => round($total, 2), 'jest_wiecej' => $more];
    }

    private static function ideas(PDO $conn, $userId, array $input)
    {
        Schema::ensureColumns($conn, 'ideas');
        $id = (int) ($input['id'] ?? 0);
        if ($id > 0) {
            $stmt = $conn->prepare("SELECT id, title, content, status, planned_for, published_at, views FROM ideas WHERE id = :id AND user_id = :user_id");
            $stmt->execute(['id' => $id, 'user_id' => $userId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                throw new InvalidArgumentException('Nie ma pomysłu o tym id.');
            }
            return self::idea($row, true);
        }

        $where = ['user_id = :user_id'];
        $params = ['user_id' => $userId];
        $status = $input['status'] ?? 'wszystkie';
        if ($status === 'do_nagrania') {
            $where[] = "status = 'draft'";
        } elseif ($status === 'nagrane') {
            $where[] = "status = 'recorded'";
        }
        if (!empty($input['szukaj'])) {
            $where[] = '(title LIKE :q OR content LIKE :q2)';
            $params['q'] = $params['q2'] = '%' . self::like($input['szukaj']) . '%';
        }
        $stmt = $conn->prepare("
            SELECT id, title, content, status, planned_for, published_at, views
            FROM ideas WHERE " . implode(' AND ', $where) . "
            ORDER BY updated_at DESC LIMIT " . self::MAX_ROWS
        );
        $stmt->execute($params);
        $list = array_map(function ($row) {
            return self::idea($row, false);
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));
        return ['pomysly' => $list, 'liczba' => count($list)];
    }

    private static function idea(array $row, $full)
    {
        return array_filter([
            'id' => (int) $row['id'],
            'tytul' => $row['title'],
            'status' => $row['status'] === 'recorded' ? 'nagrane' : 'do nagrania',
            'nagrac_dnia' => $row['planned_for'] ?? null,
            'opublikowano' => $row['published_at'] ?? null,
            'wyswietlenia' => isset($row['views']) ? (int) $row['views'] : null,
            'tresc' => $full ? (string) $row['content'] : self::short($row['content'] ?? '', 160),
        ], function ($v) {
            return $v !== null && $v !== '';
        });
    }

    private static function documents(PDO $conn, $userId, array $input)
    {
        documentsEnsureSchema($conn);
        $id = (int) ($input['id'] ?? 0);
        if ($id > 0) {
            $stmt = $conn->prepare("SELECT id, title, notes, status, doc_date, counterparty, brand, doc_kind, amount, content_text FROM documents WHERE id = :id AND user_id = :user_id");
            $stmt->execute(['id' => $id, 'user_id' => $userId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                throw new InvalidArgumentException('Nie ma dokumentu o tym id.');
            }
            $text = (string) $row['content_text'];
            return self::document($row) + [
                'tekst' => $text !== '' ? mb_substr($text, 0, self::MAX_DOC_TEXT) : '(brak odczytanego tekstu - dokument jest tylko jako plik)',
                'tekst_przyciety' => mb_strlen($text) > self::MAX_DOC_TEXT,
            ];
        }

        $where = ['user_id = :user_id'];
        $params = ['user_id' => $userId];
        if (!empty($input['szukaj'])) {
            $where[] = '(title LIKE :q OR counterparty LIKE :q2 OR brand LIKE :q3)';
            $params['q'] = $params['q2'] = $params['q3'] = '%' . self::like($input['szukaj']) . '%';
        }
        $stmt = $conn->prepare("
            SELECT id, title, notes, status, doc_date, counterparty, brand, doc_kind, amount
            FROM documents WHERE " . implode(' AND ', $where) . "
            ORDER BY COALESCE(doc_date, DATE(created_at)) DESC, id DESC LIMIT " . self::MAX_ROWS
        );
        $stmt->execute($params);
        $list = array_map([self::class, 'document'], $stmt->fetchAll(PDO::FETCH_ASSOC));
        return ['dokumenty' => $list, 'liczba' => count($list)];
    }

    private static function document(array $row)
    {
        return array_filter([
            'id' => (int) $row['id'],
            'tytul' => $row['title'],
            'druga_strona' => $row['counterparty'] ?? null,
            'marka' => $row['brand'] ?? null,
            'rodzaj' => $row['doc_kind'] ?? null,
            'data' => $row['doc_date'] ?? null,
            'kwota' => $row['amount'] !== null ? (float) $row['amount'] : null,
            'podpisany' => ($row['status'] ?? '') === 'signed',
            'notatki' => self::short($row['notes'] ?? '', 200),
        ], function ($v) {
            return $v !== null && $v !== '';
        });
    }

    private static function addTask(PDO $conn, $userId, array $input, array &$events)
    {
        $title = trim((string) ($input['tytul'] ?? ''));
        if ($title === '') {
            throw new InvalidArgumentException('Brak tytułu zadania.');
        }
        $title = mb_substr($title, 0, 255);
        $due = self::date($input['termin'] ?? null) ?: date('Y-m-d');
        $remindAt = captureRemindAt($input['przypomnij'] ?? '');
        if ($remindAt) {
            $due = substr($remindAt, 0, 10);
        }

        Schema::ensure($conn, 'tasks');
        $conn->prepare("INSERT INTO tasks (user_id, title, due_date) VALUES (:user_id, :title, :due_date)")
            ->execute(['user_id' => $userId, 'title' => $title, 'due_date' => $due]);
        $id = (int) $conn->lastInsertId();
        if ($remindAt) {
            setTaskReminder($conn, $userId, $id, $title, $remindAt);
        }

        $events[] = ['type' => 'task', 'id' => $id, 'title' => $title, 'due_date' => $due, 'remind_at' => $remindAt];
        return ['dodano' => true, 'tytul' => $title, 'termin' => $due, 'przypomnienie' => $remindAt];
    }

    private static function addIdea(PDO $conn, $userId, array $input, array &$events)
    {
        $title = trim((string) ($input['tytul'] ?? ''));
        $content = trim((string) ($input['tresc'] ?? ''));
        if ($title === '') {
            throw new InvalidArgumentException('Brak tytułu pomysłu.');
        }
        $title = mb_substr($title, 0, 255);
        $planned = self::date($input['nagrac_dnia'] ?? null);

        Schema::ensureColumns($conn, 'ideas');
        $conn->prepare("INSERT INTO ideas (user_id, title, content, status, planned_for) VALUES (:user_id, :title, :content, 'draft', :planned)")
            ->execute(['user_id' => $userId, 'title' => $title, 'content' => mb_substr($content, 0, 60000), 'planned' => $planned]);
        $id = (int) $conn->lastInsertId();

        $events[] = ['type' => 'idea', 'id' => $id, 'title' => $title, 'planned_for' => $planned];
        return ['dodano' => true, 'id' => $id, 'tytul' => $title, 'nagrac_dnia' => $planned];
    }

    private static function editIdea(PDO $conn, $userId, array $input, array &$events)
    {
        Schema::ensureColumns($conn, 'ideas');
        $id = (int) ($input['id'] ?? 0);
        $stmt = $conn->prepare("SELECT id, title, content, status, planned_for FROM ideas WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $before = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$before) {
            throw new InvalidArgumentException('Nie ma pomysłu o tym id - sprawdź narzędziem pomysly.');
        }

        $fields = [];
        $params = ['id' => $id, 'user_id' => $userId];
        if (isset($input['tytul']) && trim((string) $input['tytul']) !== '') {
            $fields[] = 'title = :title';
            $params['title'] = mb_substr(trim((string) $input['tytul']), 0, 255);
        }
        if (isset($input['tresc']) && trim((string) $input['tresc']) !== '') {
            $fields[] = 'content = :content';
            $params['content'] = mb_substr(trim((string) $input['tresc']), 0, 60000);
        }
        if (array_key_exists('nagrac_dnia', $input)) {
            $fields[] = 'planned_for = :planned';
            $params['planned'] = self::date($input['nagrac_dnia']);
        }
        if (in_array($input['status'] ?? null, ['do_nagrania', 'nagrane'], true)) {
            $fields[] = 'status = :status';
            $params['status'] = $input['status'] === 'nagrane' ? 'recorded' : 'draft';
        }
        if (!$fields) {
            throw new InvalidArgumentException('Nic do zmiany - podaj tytul, tresc, nagrac_dnia albo status.');
        }
        $conn->prepare("UPDATE ideas SET " . implode(', ', $fields) . " WHERE id = :id AND user_id = :user_id")->execute($params);

        $title = $params['title'] ?? $before['title'];
        // the app's "Cofnij" puts the previous version back
        $events[] = ['type' => 'idea_updated', 'id' => $id, 'title' => $title, 'previous' => [
            'title' => $before['title'],
            'content' => (string) $before['content'],
            'status' => $before['status'],
            'planned_for' => $before['planned_for'],
        ]];
        return ['zmieniono' => true, 'id' => $id, 'tytul' => $title];
    }

    /** Plain text, not JSON - the scripts read better as they are. */
    private static function styleGuide(PDO $conn, $userId, array $input, array &$events)
    {
        // the saved profile + her best few scripts, instead of every script each time
        [$profile, $examples, $made, $usage] = styleProfile($conn, $userId, !empty($input['odswiez']));
        if ($usage) {
            $events[] = ['type' => 'cost', 'model' => $usage['model'] ?? STYLE_PROFILE_MODEL, 'usage' => $usage];
        }
        $kind = $input['rodzaj'] ?? 'scenariusz';
        $parts = [];
        if ($profile) {
            $parts[] = styleProfileText($profile);
            $parts[] = "Jej najlepsze rolki w całości:\n\n" . $examples
                . "Tak Gosia mówi i pisze. Weź z tego słownictwo, długość zdań, sposób zaczynania i kończenia. Nie kopiuj całych zdań.";
            if ($made) {
                $parts[] = '(Profil stylu został właśnie odświeżony na podstawie jej scenariuszy.)';
            }
        } else {
            $parts[] = $examples !== ''
                ? $examples . "Tak Gosia mówi i pisze. Weź z tego słownictwo, długość zdań, sposób zaczynania i kończenia. Nie kopiuj całych zdań."
                : 'Gosia nie ma jeszcze zapisanych scenariuszy - pisz potocznie, w pierwszej osobie, forma żeńska, jak do koleżanki.';
        }
        if ($kind === 'scenariusz') {
            $parts[] = "Scenariusz rolki: sam tekst do powiedzenia do kamery, mocne pierwsze zdanie w pierwszych 2 sekundach, zwykłe akapity, bez nagłówków, emoji, hashtagów, opisów ujęć i wskazówek w nawiasach. Zwykle 60-150 słów, chyba że jej scenariusze są krótsze albo prosi o inną długość.";
        } elseif ($kind === 'wiadomosc') {
            $parts[] = "Wiadomość lub mail: jej głosem, ale do marki - uprzejmie, konkretnie, krótko, bez korpo-języka i bez przesadnej słodyczy.";
        }
        $notes = styleNotesText($conn, $userId);
        if ($notes !== '') {
            $parts[] = $notes;
        }
        $parts[] = humanStyleRules();
        return implode("\n\n", $parts);
    }

    private static function rememberStyle(PDO $conn, $userId, array $input, array &$events)
    {
        $note = trim(preg_replace('/\s+/u', ' ', (string) ($input['uwaga'] ?? '')));
        if ($note === '') {
            throw new InvalidArgumentException('Pusta uwaga.');
        }
        $note = mb_substr($note, 0, 300);
        $notes = styleNotes($conn, $userId);
        $notes[] = $note;
        saveStyleNotes($conn, $userId, $notes);
        $events[] = ['type' => 'style_note', 'note' => $note];
        return ['zapamietano' => $note];
    }

    // ---------------------------------------------------------------- helpers

    private static function date($value)
    {
        $value = trim((string) $value);
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) ? $value : null;
    }

    private static function like($value)
    {
        return addcslashes(mb_substr(trim((string) $value), 0, 100), '%_\\');
    }

    private static function short($text, $max)
    {
        $text = trim(preg_replace('/\s+/u', ' ', (string) $text));
        return mb_strlen($text) > $max ? mb_substr($text, 0, $max - 1) . '…' : $text;
    }

    private static function json($data)
    {
        return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
