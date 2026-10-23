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
