<?php
// Szyfrowanie tokenów OAuth w social_connections (libsodium, klucz APP_ENCRYPTION_KEY)
return function (PDO $conn) {
    require_once __DIR__ . '/../config/Crypto.php';

    $rows = $conn->query("SELECT id, access_token, refresh_token FROM social_connections")->fetchAll(PDO::FETCH_ASSOC);
    $upd = $conn->prepare("UPDATE social_connections SET access_token = :at, refresh_token = :rt WHERE id = :id");

    $count = 0;
    foreach ($rows as $row) {
        $at = $row['access_token'];
        $rt = $row['refresh_token'];
        $dirty = false;

        if (!empty($at) && !Crypto::isEncrypted($at)) {
            $at = Crypto::encrypt($at);
            $dirty = true;
        }
        if (!empty($rt) && !Crypto::isEncrypted($rt)) {
            $rt = Crypto::encrypt($rt);
            $dirty = true;
        }
        if ($dirty) {
            $upd->execute(['at' => $at, 'rt' => $rt, 'id' => $row['id']]);
            $count++;
        }
    }
    echo "    zaszyfrowano tokeny w $count połączeniach social\n";
};
