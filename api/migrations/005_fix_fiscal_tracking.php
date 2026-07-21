<?php
// Naprawa danych: gotówka = prywatne (0), reszta = oficjalne (1)
return function (PDO $conn) {
    $conn->exec("UPDATE collaborations SET fiscal_tracking = 0 WHERE collab_type = 'gotowka'");
    $conn->exec("UPDATE collaborations SET fiscal_tracking = 1 WHERE collab_type != 'gotowka'");
    echo "    zaktualizowano fiscal_tracking wg collab_type\n";
};
