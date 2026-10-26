<?php
/**
 * Kopie zapasowe (admin only).
 *
 * GET  /api/settings/backup.php                  -> { last_ok, last_error, remote, encrypted, files: [...] }
 * GET  /api/settings/backup.php?download=NAME    -> the file (e.g. to keep a copy on your own disk)
 * POST /api/settings/backup.php                  -> backup now (database + files)
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Response.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../utils/Backup.php';

try {
    $db = new Database();
    $conn = $db->getConnection();
    requireAdminId($conn);

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $report = Backup::run($conn, true);
        if (!$report['ok']) {
            Response::error($report['error'], 500);
        }
        Response::success(Backup::status($conn), 'Kopia zrobiona');
    }

    if (isset($_GET['download'])) {
        $name = (string) $_GET['download'];
        $path = Backup::dir() . '/' . $name;
        if (!preg_match('/^(db|files)-\d{4}-\d{2}-\d{2}\.(sql\.gz|zip)$/', $name) || !is_file($path)) {
            Response::notFound('Nie ma takiej kopii');
        }
        header_remove('Content-Type');
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="gonia-' . $name . '"');
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: no-store');
        readfile($path);
        exit;
    }

    Response::success(Backup::status($conn));
} catch (Exception $e) {
    Response::error('Nie udało się', 500);
}
