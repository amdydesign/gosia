<?php
/**
 * Tax Calculator - Net Amount Calculations
 * Calculates net amounts after KUP, taxes, and Use.me commission
 */

class TaxCalculator
{

    /**
     * Calculate net amount based on collaboration type
     * 
     * @param float $gross Gross amount (brutto)
     * @param string $type Collaboration type
     * @return float Net amount after all deductions
     */
    public static function calculateNet($gross, $type)
    {
        switch ($type) {
            case 'umowa_50':
                // 50% KUP, 12% tax on income
                $kup = $gross * 0.50;
                $income = $gross - $kup;
                $tax = $income * 0.12;
                return $gross - $tax;

            case 'umowa_20':
                // 20% KUP, 12% tax on income
                $kup = $gross * 0.20;
                $income = $gross - $kup;
                $tax = $income * 0.12;
                return $gross - $tax;

            case 'useme_50':
                // Use.me commission (7.8%, min 29zł) + 50% KUP + 12% tax
                $commission = max(29, $gross * 0.078);
                $afterCommission = $gross - $commission;
                $kup = $gross * 0.50;
                $income = $gross - $kup;
                $tax = $income * 0.12;
                return $afterCommission - $tax;

            case 'useme_20':
                // Use.me commission (7.8%, min 29zł) + 20% KUP + 12% tax
                $commission = max(29, $gross * 0.078);
                $afterCommission = $gross - $commission;
                $kup = $gross * 0.20;
                $income = $gross - $kup;
                $tax = $income * 0.12;
                return $afterCommission - $tax;

            case 'gotowka':
                // No deductions
                return $gross;

            default:
                return $gross;
        }
    }

    /**
     * Get breakdown of all deductions
     * 
     * @param float $gross
     * @param string $type
     * @return array Breakdown with commission, kup, tax, net
     */
    public static function getBreakdown($gross, $type)
    {
        $breakdown = [
            'gross' => $gross,
            'commission' => 0,
            'kup' => 0,
            'tax' => 0,
            'net' => 0
        ];

        switch ($type) {
            case 'umowa_50':
            case 'umowa_20':
                $kupPercent = ($type === 'umowa_50') ? 0.50 : 0.20;
                $breakdown['kup'] = $gross * $kupPercent;
                $income = $gross - $breakdown['kup'];
                $breakdown['tax'] = $income * 0.12;
                $breakdown['net'] = $gross - $breakdown['tax'];
                break;

            case 'useme_50':
            case 'useme_20':
                $breakdown['commission'] = max(29, $gross * 0.078);
                $kupPercent = ($type === 'useme_50') ? 0.50 : 0.20;
                $breakdown['kup'] = $gross * $kupPercent;
                $income = $gross - $breakdown['kup'];
                $breakdown['tax'] = $income * 0.12;
                $breakdown['net'] = $gross - $breakdown['commission'] - $breakdown['tax'];
                break;

            case 'gotowka':
                $breakdown['net'] = $gross;
                break;
        }

        return $breakdown;
    }
}
