<?php
/**
 * Shared helpers for the document archive (contracts, NDA files).
 *
 * Files live in api/uploads/documents/ under random names. The whole
 * api/uploads tree is denied by .htaccess, so they are reachable only through
 * api/documents/download.php after a JWT + ownership check.
 */

const DOCUMENTS_MAX_SIZE = 20 * 1024 * 1024; // 20 MB

// Extracted text is capped so one huge file cannot bloat the table
const DOCUMENTS_MAX_TEXT = 1000000; // characters

const DOCUMENTS_ALLOWED = [
    'pdf' => 'application/pdf',
    'doc' => 'application/msword',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'odt' => 'application/vnd.oasis.opendocument.text',
    'rtf' => 'application/rtf',
    'xls' => 'application/vnd.ms-excel',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt' => 'text/plain',
    'csv' => 'text/csv',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'webp' => 'image/webp',
    'heic' => 'image/heic',
];

// Signing status: signed = "Podpisane", to_sign = "Do podpisu"
const DOCUMENTS_STATUSES = ['signed', 'to_sign'];

// Columns added after the first release of the archive
const DOCUMENTS_LATE_COLUMNS = [
    'status' => "ALTER TABLE documents ADD COLUMN status ENUM('signed', 'to_sign') NOT NULL DEFAULT 'signed'",
    'doc_date' => "ALTER TABLE documents ADD COLUMN doc_date DATE NULL",
    'counterparty' => "ALTER TABLE documents ADD COLUMN counterparty VARCHAR(255) NULL",
    'analyzed_at' => "ALTER TABLE documents ADD COLUMN analyzed_at TIMESTAMP NULL DEFAULT NULL",
    // link to collaborations (suggested from contracts / bills, confirmed by the user)
    'doc_kind' => "ALTER TABLE documents ADD COLUMN doc_kind VARCHAR(20) NULL",
    'amount' => "ALTER TABLE documents ADD COLUMN amount DECIMAL(10, 2) NULL",
    'billing' => "ALTER TABLE documents ADD COLUMN billing VARCHAR(20) NULL",
    'collaboration_id' => "ALTER TABLE documents ADD COLUMN collaboration_id INT NULL",
    'collab_dismissed' => "ALTER TABLE documents ADD COLUMN collab_dismissed TINYINT(1) NOT NULL DEFAULT 0",
    // duplicate check: the same file, or the same text (the same PDF saved again)
    'file_hash' => "ALTER TABLE documents ADD COLUMN file_hash CHAR(64) NULL",
    'text_hash' => "ALTER TABLE documents ADD COLUMN text_hash CHAR(64) NULL",
    // the brand the job is for - the counterparty is often an agency
    'brand' => "ALTER TABLE documents ADD COLUMN brand VARCHAR(100) NULL",
];

const DOCUMENTS_KINDS = ['umowa', 'rachunek', 'faktura', 'inne'];
const DOCUMENTS_BILLINGS = ['umowa_50', 'umowa_20', 'useme_50', 'useme_20', 'umowa_praca', 'gotowka'];

/**
 * Create the table and add any missing column. Reads the real column list on
 * every request (one cheap query), so it never trusts a stale flag.
 */
function documentsEnsureSchema(PDO $conn)
{
    static $done = false;
    if ($done) {
        return;
    }
    Schema::ensure($conn, 'documents');
    $have = array_column($conn->query("SHOW COLUMNS FROM documents")->fetchAll(PDO::FETCH_ASSOC), 'Field');
    foreach (DOCUMENTS_LATE_COLUMNS as $column => $sql) {
        if (!in_array($column, $have, true)) {
            $conn->exec($sql);
        }
    }
    $done = true;
}

/**
 * Document date (e.g. signing date) as Y-m-d, or null when empty/invalid.
 */
function documentsParseDate($value)
{
    $value = trim((string) $value);
    $date = DateTime::createFromFormat('!Y-m-d', $value);
    return $date && $date->format('Y-m-d') === $value ? $value : null;
}

function documentsUploadDir()
{
    return __DIR__ . '/../uploads/documents';
}

/**
 * Fingerprint of a document's text: letters and digits only, lower case, so the same
 * contract saved again as another PDF (other file bytes, the same words) is recognised.
 * Null for short texts - a few words are not enough to call two documents the same.
 */
function documentsTextHash($text)
{
    $plain = preg_replace('/[^\p{L}\p{N}]+/u', '', mb_strtolower((string) $text, 'UTF-8'));
    return mb_strlen($plain) >= 300 ? hash('sha256', $plain) : null;
}

/**
 * A document of this user that is the same file or has the same text, or null.
 * Documents added before the check existed get their fingerprints filled in here once.
 */
function documentsFindDuplicate($conn, $userId, $fileHash, $textHash)
{
    $stmt = $conn->prepare("SELECT id, stored_name, content_text FROM documents WHERE user_id = :user_id AND file_hash IS NULL");
    $stmt->execute(['user_id' => $userId]);
    $fill = $conn->prepare("UPDATE documents SET file_hash = :file_hash, text_hash = :text_hash WHERE id = :id");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $old) {
        $path = documentsUploadDir() . '/' . basename($old['stored_name']);
        $fill->execute([
            'file_hash' => is_file($path) ? hash_file('sha256', $path) : '',
            'text_hash' => documentsTextHash($old['content_text']),
            'id' => $old['id'],
        ]);
    }

    $stmt = $conn->prepare("
        SELECT id, title, created_at FROM documents
        WHERE user_id = :user_id AND (file_hash = :file_hash OR (:has_text = 1 AND text_hash = :text_hash))
        ORDER BY id ASC LIMIT 1
    ");
    $stmt->execute([
        'user_id' => $userId,
        'file_hash' => $fileHash,
        'has_text' => $textHash ? 1 : 0,
        'text_hash' => (string) $textHash,
    ]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

/**
 * Normalize extracted text: single spaces, max 2 newlines, capped length.
 */
function documentsCleanText($text)
{
    $text = (string) $text;
    if ($text === '') {
        return '';
    }
    if (!mb_check_encoding($text, 'UTF-8')) {
        $text = mb_convert_encoding($text, 'UTF-8', 'Windows-1250');
    }
    $text = str_replace("\r", '', $text);
    $text = preg_replace('/[^\S\n]+/u', ' ', $text);
    $text = preg_replace('/ *\n */u', "\n", $text);
    $text = preg_replace('/\n{3,}/u', "\n\n", $text);
    return mb_substr(trim($text), 0, DOCUMENTS_MAX_TEXT);
}

/**
 * Extract searchable text on the server for formats that need no extra
 * libraries (Office XML / ODF are zip files, txt/csv are plain).
 * PDF text is extracted in the browser (pdf.js) and sent with the upload.
 */
function documentsExtractText($path, $ext)
{
    if ($ext === 'txt' || $ext === 'csv') {
        return documentsCleanText(file_get_contents($path, false, null, 0, DOCUMENTS_MAX_TEXT * 2));
    }

    $xmlParts = [
        'docx' => ['word/document.xml'],
        'odt' => ['content.xml'],
        'xlsx' => ['xl/sharedStrings.xml'],
    ];
    if (!isset($xmlParts[$ext]) || !class_exists('ZipArchive')) {
        return '';
    }

    $zip = new ZipArchive();
    if ($zip->open($path) !== true) {
        return '';
    }
    $text = '';
    foreach ($xmlParts[$ext] as $part) {
        $xml = $zip->getFromName($part);
        if ($xml === false) {
            continue;
        }
        // Paragraph / cell ends become line breaks before tags are dropped
        $xml = preg_replace('#</(w:p|text:p|text:h|si)>#', "\n", $xml);
        $xml = preg_replace('#<(w:tab|text:tab|w:br|text:line-break)[^>]*/>#', ' ', $xml);
        $text .= html_entity_decode(strip_tags($xml), ENT_QUOTES | ENT_XML1, 'UTF-8') . "\n";
    }
    $zip->close();

    return documentsCleanText($text);
}

/**
 * Lowercase + strip Polish diacritics (1:1 characters, so offsets match the original).
 */
function documentsFold($text)
{
    return strtr(mb_strtolower($text, 'UTF-8'), [
        'ą' => 'a', 'ć' => 'c', 'ę' => 'e', 'ł' => 'l', 'ń' => 'n',
        'ó' => 'o', 'ś' => 's', 'ź' => 'z', 'ż' => 'z',
    ]);
}

/**
 * Short fragment of the text around the first matching search word.
 */
function documentsSnippet($text, array $words, $radius = 90)
{
    if ($text === null || $text === '') {
        return null;
    }
    $folded = documentsFold($text);
    foreach ($words as $word) {
        $pos = mb_strpos($folded, documentsFold($word), 0, 'UTF-8');
        if ($pos === false) {
            continue;
        }
        $start = max(0, $pos - $radius);
        $length = $radius * 2 + mb_strlen($word, 'UTF-8');
        $snippet = preg_replace('/\s+/u', ' ', mb_substr($text, $start, $length, 'UTF-8'));
        return ($start > 0 ? '…' : '') . trim($snippet) . ($start + $length < mb_strlen($text, 'UTF-8') ? '…' : '');
    }
    return null;
}

/**
 * Split the search query into words (max 8, 2+ characters each).
 */
function documentsQueryWords($query)
{
    $words = preg_split('/\s+/u', trim((string) $query), -1, PREG_SPLIT_NO_EMPTY);
    $words = array_filter($words, function ($w) {
        return mb_strlen($w, 'UTF-8') >= 2;
    });
    return array_slice(array_values(array_unique($words)), 0, 8);
}

function documentsLikeEscape($word)
{
    return '%' . addcslashes($word, '\\%_') . '%';
}

/**
 * Readable name from the file name: "NDA_Zalando-2026_final.pdf" -> "NDA Zalando 2026 final".
 * Returns '' for generic scanner/camera names (scan0001, IMG_2034, document(3)).
 */
function documentsTitleFromFileName($fileName)
{
    $name = pathinfo($fileName, PATHINFO_FILENAME);
    $name = trim(preg_replace('/\s+/u', ' ', str_replace(['_', '+'], ' ', $name)));
    $name = preg_replace('/\s*\(\d+\)$/u', '', $name);
    $generic = '/^(scan|skan|img|image|dsc|pxl|photo|zdj(ę|e)cie|document|dokument|doc|plik|file|untitled|bez nazwy|cam|whatsapp image)(?:[\d\s\-_.:]+|\bat\b)*$/iu';
    if ($name === '' || preg_match($generic, $name) || preg_match('/^[\d\s\-_.]+$/u', $name)) {
        return '';
    }
    return mb_substr($name, 0, 255);
}

/**
 * Document heading from its text, e.g. "Umowa o zachowaniu poufności" (first lines only).
 */
function documentsTitleFromText($text)
{
    $kinds = 'umowa|aneks|porozumienie|kwestionariusz|formularz|wniosek|deklaracja|zaświadczenie|zaswiadczenie|potwierdzenie|certyfikat|rachunek|nota|oświadczenie|oswiadczenie|faktura|zlecenie|pełnomocnictwo|pelnomocnictwo|regulamin|oferta|licencja|nda|non-disclosure|zamówienie|zamowienie|protokół|protokol|brief';
    $lines = array_slice(preg_split('/\n+/u', (string) $text), 0, 25);
    foreach ($lines as $line) {
        $line = trim(preg_replace('/\s+/u', ' ', $line));
        $length = mb_strlen($line);
        if ($length < 4 || $length > 120 || !preg_match('/^(' . $kinds . ')\b/iu', $line)) {
            continue;
        }
        // ALL CAPS headings (or an ALL CAPS first word: "RACHUNEK nr 3/2026") -> sentence case
        if (preg_match('/^(\p{Lu}{4,})\b/u', $line, $first) && $line !== mb_strtoupper($line)) {
            $line = mb_substr($first[1], 0, 1) . mb_strtolower(mb_substr($first[1], 1)) . mb_substr($line, mb_strlen($first[1]));
        }
        if ($line === mb_strtoupper($line)) {
            $line = mb_strtoupper(mb_substr($line, 0, 1)) . mb_strtolower(mb_substr($line, 1));
            $line = preg_replace_callback('/\b(nda|rodo|vat|nip|krs)\b/u', function ($m) {
                return strtoupper($m[1]);
            }, $line);
        }
        return rtrim($line, " .:,;");
    }
    return '';
}

/**
 * Date of the document from its text (Y-m-d) or null.
 * Only dates that clearly describe the document are used, in this order:
 *   1. "zawarta / podpisana w dniu ...", "sporządzona dnia ..."
 *   2. "Kraków, 14.10.2026" - place and date, how documents are signed
 *   3. "z dnia ...", "dnia ...", "data: ..." - except birth dates, payment
 *      deadlines and validity dates
 * No date is better than a wrong one: random dates in the text are ignored.
 */
function documentsDateFromText($text)
{
    $text = mb_substr((string) $text, 0, 12000);
    $months = [
        'stycznia' => 1, 'lutego' => 2, 'marca' => 3, 'kwietnia' => 4, 'maja' => 5, 'czerwca' => 6,
        'lipca' => 7, 'sierpnia' => 8, 'września' => 9, 'wrzesnia' => 9, 'października' => 10,
        'pazdziernika' => 10, 'listopada' => 11, 'grudnia' => 12,
    ];
    // OCR often adds spaces around the separators ("14. 10. 2026")
    $date = '(\d{1,2})\s?[.\-\/]\s?(\d{1,2})\s?[.\-\/]\s?(\d{4})|(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\s+(' . implode('|', array_keys($months)) . ')\s+(\d{4})';

    $toYmd = function (array $m) use ($months) {
        if (!empty($m[3])) {
            [$d, $mo, $y] = [(int) $m[1], (int) $m[2], (int) $m[3]];
        } elseif (!empty($m[4])) {
            [$y, $mo, $d] = [(int) $m[4], (int) $m[5], (int) $m[6]];
        } else {
            [$d, $mo, $y] = [(int) $m[7], $months[mb_strtolower($m[8])] ?? 0, (int) $m[9]];
        }
        if ($y < 2000 || $y > (int) date('Y') + 1 || !checkdate($mo, $d, $y)) {
            return null;
        }
        return sprintf('%04d-%02d-%02d', $y, $mo, $d);
    };

    // Dates that describe something else than the document itself
    $excluded = '/(urodz|p[lł]atno|termin|wa[zż]n|wyga[sś]|obowi[aą]zuje\s+do|do\s+dnia|nie\s+p[oó][zź]niej|zap[lł]at|wydan|PESEL)/iu';

    $patterns = [
        '/(?:zawart[aey]|sporz[aą]dzon[aey]|podpisan[aey])[^\n\d]{0,40}?(?:w\s+dniu|dnia|dn\.)\s*:?\s*(?:' . $date . ')/iu',
        '/(?:^|\n)[^\S\n]*[\p{Lu}][\p{L}\-]{2,}(?:[^\S\n]+[\p{Lu}][\p{L}\-]+)?[^\S\n]*,[^\S\n]*(?:dnia[^\S\n]*|dn\.[^\S\n]*)?(?:' . $date . ')/u',
        '/(?:z\s+dnia|w\s+dniu|dnia|data(?:\s+(?:wystawienia|zawarcia|podpisania|sporz[aą]dzenia|dokumentu))?)\s*:?\s*(?:' . $date . ')/iu',
    ];
    foreach ($patterns as $pattern) {
        if (!preg_match_all($pattern, $text, $all, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) {
            continue;
        }
        foreach ($all as $match) {
            // only the same line counts as context ("Data urodzenia" above must not block it)
            $offset = $match[0][1] + strspn($match[0][0], "\n");
            $lineStart = strrpos(substr($text, 0, $offset), "\n");
            $before = substr($text, $lineStart === false ? 0 : $lineStart + 1, $offset - ($lineStart === false ? 0 : $lineStart + 1));
            if (preg_match($excluded, $before . $match[0][0])) {
                continue;
            }
            $groups = array_map(function ($g) {
                return is_array($g) ? $g[0] : $g;
            }, $match);
            $ymd = $toYmd($groups);
            if ($ymd !== null) {
                return $ymd;
            }
        }
    }
    return null;
}

/**
 * The other party of a contract (brand / company) from the document text, or ''.
 * Looks for labelled parties ("Zleceniodawca: ...") and company legal forms
 * (sp. z o.o., S.A., GmbH ...). Names listed in DOCUMENTS_OWN_NAMES (.env,
 * comma separated) are skipped, so the archive owner is never picked.
 */
function documentsCounterpartyFromText($text)
{
    $text = mb_substr((string) $text, 0, 8000);
    if (trim($text) === '') {
        return '';
    }
    $own = array_filter(array_map(function ($n) {
        return documentsFold(trim($n));
    }, explode(',', $_ENV['DOCUMENTS_OWN_NAMES'] ?? '')));

    $isOwn = function ($name) use ($own) {
        $folded = documentsFold($name);
        foreach ($own as $o) {
            if ($o !== '' && mb_strpos($folded, $o) !== false) {
                return true;
            }
        }
        return false;
    };

    $clean = function ($name) {
        $name = preg_replace('/\s+/u', ' ', $name);
        // drop leading connectors / numbering: "pomiędzy:", "a", "1.", "firmą", "spółką"
        $name = preg_replace('/^(?:\d+[.)]\s*|pomi[eę]dzy\s*:?\s*|oraz\s+|a\s+|firm[aąy]\s+|sp[oó][lł]k[aąi]\s+|przez\s+|z\s+)+/iu', '', trim($name));
        $name = trim($name, " \t,;:-–—\"'„”«»()");
        // normalise legal forms
        $name = preg_replace('/(?<![\p{L}])sp(?:[oó][lł]k[aąię])?\.?\s*z\s*(?:ograniczon[aą]\s+odpowiedzialno[sś]ci[aą]|o\.?\s*o\.?)/iu', 'sp. z o.o.', $name);
        $name = preg_replace('/\bsp[oó][lł]ka\s+akcyjna\b/iu', 'S.A.', $name);
        return mb_substr(trim($name), 0, 120);
    };

    // 1. Labelled party: "Zleceniodawca: Marka sp. z o.o." / "Zamawiający - ..."
    $labels = 'zleceniodawc[aą]|zamawiaj[aą]c[ya]|klient|nabywc[aą]|licencjobiorc[aą]|kontrahent|marka|reklamodawc[aą]|partner|agencj[aą]';
    if (preg_match_all('/(?:^|\n)\s*(?:' . $labels . ')\s*[:\-–]\s*([^\n]{3,120})/iu', $text, $m)) {
        foreach ($m[1] as $candidate) {
            $candidate = preg_split('/\s*(?:,\s*(?:ul\.|z siedzib|NIP|KRS|adres)|\bz siedzib[aą]|\bNIP\b|\bKRS\b|\bREGON\b)/iu', $candidate)[0];
            $name = $clean($candidate);
            if (mb_strlen($name) >= 2 && !$isOwn($name)) {
                return $name;
            }
        }
    }

    // 2. Company with a legal form; take the words before it on the same line
    $forms = '(?i:sp\.?\s*z\s*o\.?\s*o\.?(?:\s*sp\.?\s*k\.?)?|sp[oó][lł]k[aąię]\s+z\s+ograniczon[aą]\s+odpowiedzialno[sś]ci[aą]|sp[oó][lł]k[aąię]\s+akcyjn[aąe]|sp\.\s?k\.|sp\.\s?j\.)|S\.\s?A\.|GmbH|Ltd\.?|LLC|Inc\.?|B\.V\.|S\.r\.l\.|S\.L\.|SE\b|AB\b|ApS\b|AG\b';
    if (preg_match_all('/([^\n:;]{2,70}?)\s*(' . $forms . ')/u', $text, $m, PREG_SET_ORDER)) {
        foreach ($m as $match) {
            // keep at most the last 6 words before the legal form
            $words = preg_split('/\s+/u', trim($match[1]));
            $before = implode(' ', array_slice($words, -6));
            $before = preg_replace('/^.*(?<![\p{L}\d])(?:pomi[eę]dzy|oraz|a|firm[aąy]|sp[oó][lł]k[aąi]|przez|z|between|and|with|by)(?![\p{L}\d])\s*:?\s*/iu', '', $before);
            $name = $clean($before . ' ' . $match[2]);
            if (mb_strlen($name) >= 4 && !$isOwn($name) && !preg_match('/^(sp\.|S\.A\.)/u', $name)) {
                return $name;
            }
        }
    }

    return '';
}

/**
 * Kind of document from its text: umowa (contract / annex), rachunek (bill to a
 * contract), faktura (invoice) or inne.
 */
function documentsKindFromText($text)
{
    $head = documentsFold(mb_substr((string) $text, 0, 1500));
    if (preg_match('/\bfaktura\b|\bfaktury vat\b|\binvoice\b/u', $head)) {
        return 'faktura';
    }
    if (preg_match('/\brachunek\b|\brachunku\b/u', $head)) {
        return 'rachunek';
    }
    if (preg_match('/\bumow[ayie]\b|\baneks\b|\bporozumienie\b|\bagreement\b/u', $head)) {
        return 'umowa';
    }
    return $head === '' ? null : 'inne';
}

/** "5 000,00" / "5.000,00" / "5000.50" -> 5000.5 (or null). */
function documentsParseMoney($value)
{
    $v = preg_replace('/[\s\x{00A0}]/u', '', (string) $value);
    if (preg_match('/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/', $v)) {
        $v = str_replace('.', '', $v);
    }
    $v = str_replace(',', '.', $v);
    if (!is_numeric($v)) {
        return null;
    }
    $amount = round((float) $v, 2);
    return $amount >= 100 && $amount <= 1000000 ? $amount : null;
}

/**
 * Gross amount of a contract / bill / invoice from its text, or null.
 * Labelled gross totals win ("brutto", "do zapłaty", "razem"), then the
 * remuneration of a contract ("wynagrodzenie ... X zł"); net-only amounts
 * ("do wypłaty", "netto") are ignored so a bill and its contract match.
 */
function documentsAmountFromText($text)
{
    $text = mb_substr((string) $text, 0, 20000);
    // a number that is not a percentage or part of a longer number
    $num = '(\d{1,3}(?:[ \x{00A0}.]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d%]|\s%)';
    $currency = '\s*(?:zł|zl|pln|złotych)';
    $rules = [
        // "5 000,00 zł brutto" - the most explicit form
        3 => '/' . $num . $currency . '\s*\(?\s*brutto/iu',
        // "kwota brutto: 5 000,00", "razem do zapłaty 6 150,00 zł", "wartość brutto 1230,00"
        2 => '/(?:brutto|do\s+zap[lł]aty|razem|suma|og[oó][lł]em|warto[sś][cć]\s+brutto)[^\d\n]{0,40}' . $num . '/iu',
        // "wynagrodzenie ... w kwocie 5000 zł"
        1 => '/wynagrodzeni[ea][^\n]{0,120}?' . $num . $currency . '/iu',
    ];
    $best = null;
    $bestRank = 0;
    foreach ($rules as $rank => $pattern) {
        if (!preg_match_all($pattern, $text, $all, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) {
            continue;
        }
        foreach ($all as $match) {
            $m = array_map(function ($g) {
                return $g[0];
            }, $match);
            // look a little past the amount too ("2500 zł netto")
            $after = strtok(substr($text, $match[0][1] + strlen($match[0][0]), 25) . "\n", "\n");
            $context = mb_strtolower($m[0] . ($after === false ? '' : $after));
            if (preg_match('/netto|do\s+wyp[lł]aty|podatek|vat\s+\d|zaliczk/u', $context) && $rank !== 3) {
                continue;
            }
            $amount = documentsParseMoney($m[1]);
            // the largest labelled total of the best rule is the document total
            if ($amount !== null && ($rank > $bestRank || ($rank === $bestRank && $amount > $best))) {
                $best = $amount;
                $bestRank = $rank;
            }
        }
        if ($best !== null) {
            break;
        }
    }
    return $best;
}

/**
 * How a contract is settled, in the collaboration's terms, or null:
 * umowa o dzieło 50% / 20% costs, Use.me, umowa o pracę.
 */
function documentsBillingFromText($text)
{
    $t = documentsFold(mb_substr((string) $text, 0, 20000));
    if ($t === '') {
        return null;
    }
    $fifty = (bool) preg_match('/50\s?%|praw(a|ami|o)? autorsk|przeniesieni[ae] (autorskich )?praw|licencj/u', $t);
    if (strpos($t, 'useme') !== false || strpos($t, 'use.me') !== false) {
        return $fifty ? 'useme_50' : 'useme_20';
    }
    if (preg_match('/umow[ayie] o dzielo/u', $t)) {
        return preg_match('/20\s?%/u', $t) && !$fifty ? 'umowa_20' : 'umowa_50';
    }
    if (preg_match('/umow[ayie] o prace/u', $t)) {
        return 'umowa_praca';
    }
    return null;
}

/**
 * One spelling for company legal forms, so "XX Spółka z ograniczoną odpowiedzialnością",
 * "XX SP. Z O.O." and "XX sp. z o.o." are stored and shown the same way.
 */
function documentsNormalizeCounterparty($name)
{
    $name = trim(preg_replace('/\s+/u', ' ', (string) $name), " \t,;:-–—\"'„”");
    if ($name === '') {
        return '';
    }
    $forms = [
        '/\bsp(?:[oó][lł]k[aąię])?\.?\s*z\s*(?:ograniczon[aąej]{1,2}\s+odpowiedzialno[sś]ci[aą]|o\.?\s*o\.?)(?:\s*sp(?:[oó][lł]k[aąię])?\.?\s*k(?:omandytow[aąej]{1,2})?\.?)?/iu' => null,
        '/\bsp[oó][lł]k[aąię]\s+akcyjn[aąej]{1,2}\b|\bS\.\s?A\.?(?=\s|$)/iu' => 'S.A.',
        '/\bsp[oó][lł]k[aąię]\s+komandytow[aąej]{1,2}\b|\bsp\.\s?k\.?(?=\s|$)/iu' => 'sp.k.',
        '/\bsp[oó][lł]k[aąię]\s+jawn[aąej]{1,2}\b|\bsp\.\s?j\.?(?=\s|$)/iu' => 'sp.j.',
    ];
    foreach ($forms as $pattern => $short) {
        $name = preg_replace_callback($pattern, function ($m) use ($short) {
            if ($short !== null) {
                return $short;
            }
            return preg_match('/k(omandytow|\.)|\bk$/iu', mb_substr($m[0], -14)) ? 'sp. z o.o. sp.k.' : 'sp. z o.o.';
        }, $name);
    }
    // ALL CAPS names -> Title Case (legal forms keep their spelling)
    $letters = preg_replace('/sp\. z o\.o\.|S\.A\.|sp\.[kj]\./u', '', $name);
    if ($letters === mb_strtoupper($letters) && preg_match('/\p{L}{4,}/u', $letters)) {
        $name = preg_replace_callback('/\p{L}[\p{L}\-]*/u', function ($m) {
            $word = $m[0];
            return in_array($word, ['sp', 'z', 'o', 'S', 'A', 'k', 'j'], true) ? $word : mb_convert_case($word, MB_CASE_TITLE);
        }, $name);
    }
    return mb_substr(trim($name), 0, 255);
}

/** Key for matching a counterparty with a collaboration brand: "Zalando Polska sp. z o.o." -> "zalando polska". */
function documentsPartyKey($name)
{
    $k = documentsFold((string) $name);
    $k = preg_replace('/\b(sp\.?\s*z\s*o\.?\s*o\.?|spolka(\s+z\s+ograniczona\s+odpowiedzialnoscia|\s+akcyjna|\s+komandytowa|\s+jawna)?|s\.?\s?a\.?|sp\.?\s?k\.?|sp\.?\s?j\.?|gmbh|ltd\.?|llc|inc\.?|b\.?v\.?|s\.?r\.?l\.?|ag|se)\b/u', ' ', $k);
    $k = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $k);
    return trim(preg_replace('/\s+/u', ' ', $k));
}

/** Do two party names mean the same company? ("Zalando" vs "Zalando Polska sp. z o.o.") */
function documentsSameParty($a, $b)
{
    $ka = documentsPartyKey($a);
    $kb = documentsPartyKey($b);
    if ($ka === '' || $kb === '') {
        return false;
    }
    if ($ka === $kb) {
        return true;
    }
    $first = function ($k) {
        return explode(' ', $k)[0];
    };
    return mb_strlen($first($ka)) >= 3 && $first($ka) === $first($kb);
}

/** "Zalando Polska sp. z o.o." -> "Zalando Polska" (a name without the legal form) */
function documentsShortName($name)
{
    $short = preg_replace('/\s*(sp\. z o\.o\.( sp\.k\.)?|S\.A\.|sp\.k\.|sp\.j\.|GmbH|Ltd\.?|LLC|Inc\.?|B\.V\.|AG|SE)\s*$/u', '', (string) $name);
    return trim($short) ?: trim((string) $name);
}

/**
 * Name of a collaboration made from a document: the brand first, then the agency
 * ("Reserved – Agencja Gwiazd"); just the company when there is no separate brand.
 */
function documentsCollabName($brand, $counterparty)
{
    $brand = trim((string) $brand);
    $party = documentsShortName($counterparty);
    if ($brand === '') {
        $name = $party;
    } elseif ($party === '' || documentsSameParty($brand, $party)) {
        $name = $brand;
    } else {
        $name = $brand . ' – ' . $party;
    }
    return mb_substr($name, 0, 100);
}

/** Collaboration details guessed from the document text (no external services). */
function documentsCollabFields($text)
{
    return [
        'doc_kind' => documentsKindFromText($text),
        'amount' => documentsAmountFromText($text),
        'billing' => documentsBillingFromText($text),
    ];
}
