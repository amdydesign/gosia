# Wdrożenie na serwer - OSTATECZNA WERSJA

## Problem rozwiązany
Document root w dHosting jest na `public_html` i nie można tego zmienić. Dodałem plik `.htaccess`, który automatycznie przekierowuje ruch.

## Co robi .htaccess?
- Gdy wchodzisz na `panel.malgorzatamordarska.pl` → pokazuje aplikację React z `frontend/dist`
- Gdy aplikacja wywołuje `/api/...` → kieruje do folderu `api`

## Deploy - Krok po kroku

### 1. Pierwsza konfiguracja na serwerze (TYLKO RAZ)
```bash
cd ~/public_html
git init
git remote add origin https://github.com/amdydesign/gosia.git
git fetch --all
git reset --hard origin/main
```

### 2. Po zmianach w kodzie (codziennie)
**Na komputerze:**
```bash
cd c:\gosia\frontend
npm run deploy     # build + kopiowanie do katalogu głównego (index.html, assets/, sw.js)
cd ..
git add .
git commit -m "Opis zmian"
git push
```

**Na serwerze:**
```bash
cd ~/public_html
git pull origin main
```

### 3. Sprawdź czy działa
Otwórz przeglądarkę (incognito): `https://panel.malgorzatamordarska.pl`

Powinienś zobaczyć **Gosia 2.0** 🎉

## Powiadomienia push (Gonia 2.0) — cron co 15 minut

Przypomnienia „Przypomnij jutro 9:00”, poranne „Na dziś”, terminy zwrotów i zaległe płatności
wysyła `api/cron/send_reminders.php`. Musi działać **co 15 minut** (sam pilnuje, żeby nic się nie powtórzyło,
i nic nie wysyła w ciszy nocnej ustawionej w aplikacji).

**Panel dHosting → Zadania cron → Dodaj:**
- Harmonogram: `*/15 * * * *` (co 15 minut)
- Polecenie: `php /home/TWOJ_LOGIN/public_html/api/cron/send_reminders.php`

Jeśli panel pozwala tylko na adres URL:
`https://panel.malgorzatamordarska.pl/api/cron/send_reminders.php?secret=CRON_SECRET`
(`CRON_SECRET` ustawiasz w `api/.env`).

Sprawdzenie bez wysyłania: dopisz `&dry=1` do adresu (albo `--dry` w poleceniu) — pokaże, co by wyszło.

Klucze powiadomień (VAPID) serwer tworzy sam przy pierwszym włączeniu powiadomień i trzyma w bazie (tabela `server_settings`). Własne klucze w `api/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) mają pierwszeństwo.
Strefa czasowa: domyślnie `Europe/Warsaw` (zmiana: `APP_TIMEZONE` w `api/.env`).

**iPhone:** powiadomienia działają tylko w aplikacji dodanej do ekranu głównego
(Safari → Udostępnij → „Do ekranu początkowego”), potem w Goni: awatar → Powiadomienia → włącz.

## Udostępnij — linki do rolek (subdomena share.)

W aplikacji: **Menu → Udostępnij** (albo „+” → „Rolka dla marki”). Plik idzie na serwer w kawałkach po 8 MB,
więc limit uploadu PHP na hostingu nie ma znaczenia — domyślnie do **5 GB na plik**
(zmiana: `SHARE_MAX_SIZE_MB=10240` w `api/.env`). Pliki leżą w `api/uploads/share` (bez dostępu z zewnątrz,
nie trafiają do kopii zapasowej), publiczną stronę z odtwarzaczem serwuje `share/index.php`.

Linki mają postać `https://share.malgorzatamordarska.pl/<kod>`. Subdomenę trzeba raz założyć:

1. **Panel dHosting → Domeny / Subdomeny → Dodaj subdomenę** `share.malgorzatamordarska.pl`.
2. Katalog subdomeny ustaw na folder **`share`** w katalogu panelu (np. `public_html/share` — ten sam, w którym jest `api/`).
3. Włącz dla niej **SSL (Let's Encrypt)**.
4. Sprawdź: `https://share.malgorzatamordarska.pl` pokazuje ciemną stronę „Tu nic nie ma” — działa.

Ten sam plik otwiera się też pod `https://panel.malgorzatamordarska.pl/share/<kod>` (zapas, gdyby subdomena nie działała).
Inny adres linków: `SHARE_URL=https://...` w `api/.env`.

Opcjonalnie: `SHARE_BRAND=Małgorzata Mordarska` — nazwa na górze strony z filmem.

**Licznik miejsca** (Udostępnij → „Zajęte miejsce”): suma wszystkiego, co aplikacja trzyma na serwerze —
rolki, dokumenty, załączniki, screeny, kopie zapasowe — na tle pakietu **20 GB** (pasek zielony / żółty / czerwony).
Po zmianie pakietu: `STORAGE_QUOTA_GB=50` w `api/.env`.
Usunięty plik przez 30 dni leży w Koszu („Cofnij” przywraca ten sam link), potem znika z dysku.
