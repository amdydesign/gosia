<?php
$content = file_get_contents('debug_output.txt');
// Convert from UTF-16LE to UTF-8
$utf8 = mb_convert_encoding($content, 'UTF-8', 'UTF-16LE');

// Find the start of the Facebook response (it usually starts with {"results")
// We look for the SECOND occurrence if the first one was Instagram (which failed)
// But Instagram failed with 429, so it might return {"message":"..."} or similar.
// Facebook success starts with {"results":...

if (preg_match('/\{"results":.*?\}/s', $utf8, $matches)) {
    echo "Found JSON candidate string (first 200 chars):\n";
    echo substr($matches[0], 0, 200) . "...\n";

    $decoded = json_decode($matches[0], true);
    if ($decoded) {
        print_r($decoded);
    } else {
        echo "JSON Decode FAILED: " . json_last_error_msg() . "\n";
    }
} else {
    echo "No JSON structure found. Raw UTF-8 content:\n";
    echo substr($utf8, 0, 1000);
}
