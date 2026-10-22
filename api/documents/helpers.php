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
];

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
        // ALL CAPS headings -> sentence case
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
