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

/**
 * Create the table / columns added after the first release.
 */
function documentsEnsureSchema(PDO $conn)
{
    Schema::ensure($conn, 'documents');
    Schema::ensureColumn($conn, 'documents', 'status');
    Schema::ensureColumn($conn, 'documents', 'doc_date');
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
    $kinds = 'umowa|aneks|porozumienie|oświadczenie|oswiadczenie|faktura|zlecenie|pełnomocnictwo|pelnomocnictwo|regulamin|oferta|licencja|nda|non-disclosure|zamówienie|zamowienie|protokół|protokol|brief';
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
 * Prefers a date right after "zawarta w dniu", "z dnia", "dnia", "data"; otherwise the first date.
 */
function documentsDateFromText($text)
{
    $text = mb_substr((string) $text, 0, 5000);
    $months = [
        'stycznia' => 1, 'lutego' => 2, 'marca' => 3, 'kwietnia' => 4, 'maja' => 5, 'czerwca' => 6,
        'lipca' => 7, 'sierpnia' => 8, 'września' => 9, 'wrzesnia' => 9, 'października' => 10,
        'pazdziernika' => 10, 'listopada' => 11, 'grudnia' => 12,
    ];
    $date = '(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})|(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\s+(' . implode('|', array_keys($months)) . ')\s+(\d{4})';

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

    $patterns = [
        '/(?:zawart[aey]|sporządzon[aey]|podpisan[aey])\s+(?:w\s+\S+\s+)?(?:w\s+dniu|dnia)\s*:?\s*(?:' . $date . ')/iu',
        '/(?:z\s+dnia|w\s+dniu|dnia|data)\s*:?\s*(?:' . $date . ')/iu',
        '/(?:' . $date . ')/iu',
    ];
    foreach ($patterns as $pattern) {
        if (preg_match_all($pattern, $text, $all, PREG_SET_ORDER)) {
            foreach ($all as $m) {
                // the keyword patterns capture the date groups after group 0
                $ymd = $toYmd($m);
                if ($ymd !== null) {
                    return $ymd;
                }
            }
        }
    }
    return null;
}
