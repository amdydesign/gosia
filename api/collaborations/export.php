<?php
/**
 * Export Collaborations
 * GET /api/collaborations/export.php?mode=[official|full|private]
 * 
 * Exports collaborations to CSV
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../middleware/auth.php';
require_once __DIR__ . '/../utils/TaxCalculator.php';

// Only allow GET
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    exit('Method not allowed');
}

try {
    // Authenticate
    $userId = getCurrentUserId();
    $mode = $_GET['mode'] ?? 'official';

    // Get database connection
    $db = new Database();
    $conn = $db->getConnection();

    // Prepare query based on mode
    // We select specific columns to be safe, including the new ones
    $query = "
        SELECT 
            date, brand, collab_type, type, 
            amount_gross, amount_net, 
            payment_status, fiscal_tracking 
        FROM collaborations 
        WHERE user_id = :user_id
    ";
    $params = ['user_id' => $userId];

    if ($mode === 'official') {
        $query .= " AND fiscal_tracking = TRUE ORDER BY date DESC";
    } elseif ($mode === 'private') {
        $query .= " AND fiscal_tracking = FALSE ORDER BY date DESC";
    } else {
        // Full mode: All, sorted by fiscal_tracking (official first) then date
        $query .= " ORDER BY fiscal_tracking DESC, date DESC";
    }

    $stmt = $conn->prepare($query);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Set headers for CSV download
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename=wspolprace_' . date('Y') . '_' . $mode . '.csv');

    // Open output stream
    $output = fopen('php://output', 'w');

    // Add BOM for Excel (UTF-8)
    fprintf($output, chr(0xEF) . chr(0xBB) . chr(0xBF));

    // Helper to map types to labels
    $typeLabels = [
        'umowa_50' => 'Umowa o dzieło (50% KUP)',
        'umowa_20' => 'Umowa o dzieło (20% KUP)',
        'useme_50' => 'Use.me (50% KUP)',
        'useme_20' => 'Use.me (20% KUP)',
        'gotowka' => 'Gotówka prywatna'
    ];

    // Helper to get GROSS amount safely (fallback to net if gross is missing/zero on old records)
    $getGross = function ($row) {
        $g = floatval($row['amount_gross']);
        if ($g <= 0) {
            return floatval($row['amount_net']);
        }
        return $g;
    };

    // New Logic for "Full" mode (Separate sections)
    if ($mode === 'full') {
        $officialRows = [];
        $privateRows = [];
        foreach ($rows as $row) {
            if ($row['fiscal_tracking']) {
                $officialRows[] = $row;
            } else {
                $privateRows[] = $row;
            }
        }

        // Section 1: Official
        fputcsv($output, ['=== OFICJALNE (do PIT) ===']);
        fputcsv($output, ['Data', 'Marka', 'Typ', 'Brutto', 'Na rękę', 'Status']);

        $officialTotal = 0;
        foreach ($officialRows as $row) {
            $gross = $getGross($row);
            // Use collab_type, fallback to 'umowa_50' (Standard) or map from old 'type' if needed
            $cType = $row['collab_type'];
            if (!$cType || $cType === 'other')
                $cType = 'umowa_50';

            $net = TaxCalculator::calculateNet($gross, $cType);
            $officialTotal += $net;

            fputcsv($output, [
                $row['date'],
                $row['brand'],
                $typeLabels[$cType] ?? $cType,
                number_format($gross, 2, ',', ' ') . ' zł',
                number_format($net, 2, ',', ' ') . ' zł',
                $row['payment_status']
            ]);
        }
        fputcsv($output, ['', '', '', 'SUMA:', number_format($officialTotal, 2, ',', ' ') . ' zł', '']);
        fputcsv($output, []); // Empty line

        // Section 2: Private
        fputcsv($output, ['=== PRYWATNE (poza rozliczeniami) ===']);
        fputcsv($output, ['Data', 'Marka', 'Typ', 'Kwota', 'Na rękę', 'Status']);

        $privateTotal = 0;
        foreach ($privateRows as $row) {
            $gross = $getGross($row);
            // Private is always 'gotowka' logic for calc
            $net = TaxCalculator::calculateNet($gross, 'gotowka');
            $privateTotal += $net;

            fputcsv($output, [
                $row['date'],
                $row['brand'],
                'Gotówka prywatna',
                number_format($gross, 2, ',', ' ') . ' zł',
                number_format($net, 2, ',', ' ') . ' zł',
                $row['payment_status']
            ]);
        }
        fputcsv($output, ['', '', '', 'SUMA:', number_format($privateTotal, 2, ',', ' ') . ' zł', '']);
        fputcsv($output, []);
        fputcsv($output, ['', '', '', 'ŁĄCZNIE:', number_format($officialTotal + $privateTotal, 2, ',', ' ') . ' zł', '']);

    } else {
        // Standard modes (Official or Private)
        $headers = ['Data', 'Marka', 'Typ', 'Brutto', 'Na rękę', 'Status'];
        fputcsv($output, $headers);

        $totalSum = 0;
        foreach ($rows as $row) {
            $gross = $getGross($row);

            $cType = $row['collab_type'];
            // If private mode, force 'gotowka' logic regardless of DB type if it was somehow mislabeled? 
            // Better to rely on TaxCalculator with the actual type if it exists.
            if ($mode === 'private') {
                $cType = 'gotowka';
            } elseif (!$cType || $cType === 'other') {
                $cType = 'umowa_50';
            }

            $label = $typeLabels[$cType] ?? $cType;
            if ($mode === 'private')
                $label = 'Gotówka prywatna';

            $net = TaxCalculator::calculateNet($gross, $cType);
            $totalSum += $net;

            fputcsv($output, [
                $row['date'],
                $row['brand'],
                $label,
                number_format($gross, 2, ',', ' ') . ' zł',
                number_format($net, 2, ',', ' ') . ' zł',
                $row['payment_status']
            ]);
        }
        fputcsv($output, ['', '', '', 'SUMA:', number_format($totalSum, 2, ',', ' ') . ' zł', '']);
    }

    fclose($output);

} catch (Exception $e) {
    if ($_ENV['APP_DEBUG'] === 'true') {
        http_response_code(500);
        echo 'Export failed: ' . $e->getMessage();
    } else {
        http_response_code(500);
        echo 'Export failed';
    }
}
