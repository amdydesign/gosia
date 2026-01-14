<?php
require_once __DIR__ . '/config/Database.php';

header('Content-Type: text/plain');

try {
    $db = new Database();
    $conn = $db->getConnection();

    echo "--- DIAGNOSTIC REPORT ---\n";
    echo "Server Date: " . date('Y-m-d H:i:s') . "\n";
    echo "Current Year (PHP): " . date('Y') . "\n\n";

    // 1. Check Years present in DB
    echo "1. Collaborations by Year:\n";
    $stmt = $conn->query("SELECT YEAR(date) as y, COUNT(*) as c FROM collaborations GROUP BY YEAR(date)");
    $years = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (empty($years)) {
        echo "[!] No collaborations found in DB.\n";
    } else {
        foreach ($years as $row) {
            echo "   " . $row['y'] . ": " . $row['c'] . " entries\n";
        }
    }
    echo "\n";

    // 2. Check Payment Statuses
    echo "2. Valid Payment Statuses (All Years):\n";
    $stmt = $conn->query("SELECT payment_status, COUNT(*) as c FROM collaborations GROUP BY payment_status");
    $statuses = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($statuses as $row) {
        echo "   '" . $row['payment_status'] . "': " . $row['c'] . "\n";
    }
    echo "\n";

    // 3. Check Fiscal Tracking Distribution
    echo "3. Fiscal Tracking (All Years):\n";
    try {
        $stmt = $conn->query("SELECT fiscal_tracking, COUNT(*) as c FROM collaborations GROUP BY fiscal_tracking");
        $ft = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($ft as $row) {
            echo "   Value [" . $row['fiscal_tracking'] . "]: " . $row['c'] . "\n";
        }
    } catch (Exception $e) {
        echo "[!] Error querying fiscal_tracking: " . $e->getMessage() . "\n";
    }
    echo "\n";

    // 4. Financial Sums for Current Year (The Main Dashboard Query Logic)
    $currentYear = date('Y');
    echo "4. Simulation of Dashboard Query for Year $currentYear:\n";

    $sql = "SELECT Count(*) as count, SUM(amount_net) as sum_net, SUM(amount_gross) as sum_gross 
            FROM collaborations 
            WHERE payment_status = 'paid' 
            AND YEAR(date) = :y";

    $stmt = $conn->prepare($sql);
    $stmt->execute(['y' => $currentYear]);
    $res = $stmt->fetch(PDO::FETCH_ASSOC);

    echo "   Criteria: payment_status='paid' AND YEAR=$currentYear\n";
    echo "   Found: " . $res['count'] . " rows\n";
    echo "   Sum Net: " . $res['sum_net'] . "\n";
    echo "   Sum Gross: " . $res['sum_gross'] . "\n";

    if ($res['count'] == 0) {
        echo "\n   [!] WHY 0? Checking if we have PAID items in OTHER years:\n";
        $stmt = $conn->query("SELECT YEAR(date) as y, COUNT(*) as c FROM collaborations WHERE payment_status='paid' GROUP BY YEAR(date)");
        $otherYears = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($otherYears as $oy) {
            echo "   Year " . $oy['y'] . " has " . $oy['c'] . " paid items.\n";
        }
    }

} catch (Exception $e) {
    echo "CRITICAL ERROR: " . $e->getMessage();
}
