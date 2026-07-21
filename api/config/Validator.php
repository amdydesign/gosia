<?php
/**
 * Centralna walidacja wejścia + jedyne źródło prawdy dla list dozwolonych wartości.
 *
 * Listy muszą być zgodne z ENUM-ami w database/schema.sql
 * oraz z logiką utils/TaxCalculator.php (COLLAB_BILLING_TYPES).
 */

class Validator
{
    /** collaborations.type — kategoria merytoryczna współpracy (ENUM w DB) */
    public const COLLABORATION_TYPES = [
        'post-instagram', 'story', 'reel', 'sesja', 'konsultacja', 'event', 'umowa-praca', 'inne',
    ];

    /** collaborations.payment_status (ENUM w DB) */
    public const PAYMENT_STATUSES = ['pending', 'paid', 'overdue'];

    /** collaborations.collab_type — sposób rozliczenia (musi pokrywać się z TaxCalculator) */
    public const COLLAB_BILLING_TYPES = [
        'umowa_50', 'umowa_20', 'useme_50', 'useme_20', 'umowa_praca', 'gotowka', 'barter', 'other',
    ];

    /** purchases.status (ENUM w DB) */
    public const PURCHASE_STATUSES = ['kept', 'returned', 'partial'];

    /** ideas.status (ENUM w DB) */
    public const IDEA_STATUSES = ['draft', 'recorded'];

    /**
     * Zwraca $value, jeśli jest na liście dozwolonych; inaczej kończy request 422.
     */
    public static function requireEnum($value, array $allowed, $field)
    {
        if (!in_array($value, $allowed, true)) {
            Response::validationError([
                $field => "Niedozwolona wartość '$value' (dozwolone: " . implode(', ', $allowed) . ')',
            ]);
        }
        return $value;
    }

    /**
     * Data w formacie YYYY-MM-DD i faktycznie istniejąca w kalendarzu.
     */
    public static function requireDate($value, $field)
    {
        $d = is_string($value) ? DateTime::createFromFormat('Y-m-d', $value) : false;
        if (!$d || $d->format('Y-m-d') !== $value) {
            Response::validationError([$field => 'Wymagana poprawna data w formacie RRRR-MM-DD']);
        }
        return $value;
    }

    /**
     * Kwota nieujemna; zwraca float.
     */
    public static function requireAmount($value, $field)
    {
        if (!is_numeric($value) || floatval($value) < 0) {
            Response::validationError([$field => 'Kwota musi być liczbą nieujemną']);
        }
        return floatval($value);
    }
}
