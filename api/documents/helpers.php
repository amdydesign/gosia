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
