<?php
/**
 * Return window: counts from delivery ("Paczka przyszła") when known, otherwise from the
 * order date - the law and most shops count from receiving the parcel.
 */

require_once __DIR__ . '/../config/Schema.php';

const PURCHASE_DEADLINE_SQL = "DATE_ADD(COALESCE(delivered_at, purchase_date), INTERVAL return_days DAY)";

/** Days the shop has to pay a refund back before it is worth checking the account. */
const PURCHASE_REFUND_CHECK_DAYS = 14;
