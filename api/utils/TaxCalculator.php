<?php
/**
 * Tax Calculator - Net Amount Calculations
 * Calculates net amounts after KUP, taxes, and Use.me commission
 */

class TaxCalculator
{


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
            'zus' => 0,      // Added for UoP
            'health' => 0,   // Added for UoP
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

            case 'umowa_praca':
                // Standard Employment Contract (Simplified)
                // 1. Social Security (ZUS): 13.71%
                $breakdown['zus'] = $gross * 0.1371;

                // 2. Health Insurance Base
                $healthBase = $gross - $breakdown['zus'];

                // 3. Health Insurance (9%)
                $breakdown['health'] = $healthBase * 0.09;

                // 4. KUP (Standard 250 PLN)
                $breakdown['kup'] = 250;

                // 5. Tax Base
                $taxBase = max(0, $gross - $breakdown['zus'] - $breakdown['kup']);

                // 6. Tax (12% minus 300 PLN free amount)
                $taxCalculated = ($taxBase * 0.12) - 300;
                $breakdown['tax'] = max(0, $taxCalculated);

                // 7. Net
                $breakdown['net'] = $gross - $breakdown['zus'] - $breakdown['health'] - $breakdown['tax'];
                break;

            case 'gotowka':
                $breakdown['net'] = $gross;
                break;
        }

        return $breakdown;
    }

    /**
     * Calculate net amount based on collaboration type
     * Wrapper for getBreakdown
     */
    public static function calculateNet($gross, $type)
    {
        $breakdown = self::getBreakdown($gross, $type);
        return $breakdown['net'];
    }
}
