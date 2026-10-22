# Gosia Stylist Manager v2.0

🛍️ System zarządzania współpracami i zwrotami odzieży dla stylistki/influencerki.

## 🚀 Tech Stack

- **Frontend**: React (Vite) - `frontend/`
- **Backend**: PHP REST API - `api/`  
- **Database**: MySQL
- **Auth**: JWT Tokens

## 📁 Struktura Projektu

```
gosia/
├── frontend/          # React app (Vite)
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── context/       # Auth context
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   └── utils/         # Helper functions
│   └── dist/              # Production build
├── api/               # PHP Backend
│   ├── auth/              # Login/logout endpoints
│   ├── collaborations/    # CRUD endpoints
│   ├── returns/           # CRUD endpoints
│   ├── stats/             # Dashboard stats
│   ├── config/            # DB, JWT, CORS config
│   ├── middleware/        # Auth middleware
│   ├── database/          # SQL schema
│   ├── .env               # Environment variables (not in git)
│   └── composer.json
└── README.md
```

## 🔧 Lokalne Uruchomienie

### 1. Backend (PHP)

```bash
cd api
composer install

# Uruchom lokalny serwer PHP
php -S localhost:8000
```

### 2. Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

Otwórz: http://localhost:5173

## 🗄️ Setup Bazy Danych

1. Utwórz bazę MySQL
2. Wykonaj skrypt `api/database/schema.sql` 
3. Ustaw dane dostępowe w `api/.env`

## 🌐 Deployment na dHosting

### 1. Build Frontend i synchronizacja do katalogu głównego
```bash
cd frontend
npm run deploy    # = vite build + kopiowanie build/ do katalogu głównego repo
```

Skrypt `frontend/scripts/sync-root.mjs` kopiuje `build/index.html`, `build/assets/`, `sw.js`,
`manifest.json` i `icons/` do katalogu głównego — to on jest serwowany jako `public_html`.

### 2. Publikacja

```bash
git add . && git commit -m "Opis zmian" && git push
# na serwerze (public_html):
git pull origin main
```

Struktura serwowana z `public_html/`:

```
public_html/
├── index.html          # z build/
├── assets/             # z build/assets/
├── sw.js, manifest.json, icons/   # PWA
├── api/                # cały folder api/
│   ├── (wszystkie pliki PHP)
│   ├── vendor/         # ważne!
│   └── .env            # uzupełnij prawidłowe dane
└── .htaccess           # routing
```

Propozycje dalszego rozwoju i lista zmian z przebudowy UI: [`PROPOZYCJE_UX.md`](PROPOZYCJE_UX.md).

### 3. Plik .htaccess

```apache
RewriteEngine On

# HTTPS redirect
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# API routes - przekaż do PHP
RewriteRule ^api/(.*)$ api/$1 [L]

# React SPA - wszystko inne do index.html
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

## 🔐 Logowanie

**Domyślne dane:**
- Login: `admin`
- Hasło: `password` (zmień w produkcji!)

Aby zmienić hasło, wygeneruj nowy hash:
```php
echo password_hash('nowe_haslo', PASSWORD_BCRYPT);
```

I zaktualizuj w tabeli `users`.

**Nie pamiętasz hasła?** Przez SSH na serwerze (tylko z linii poleceń, z przeglądarki niedostępne):
```bash
cd ~/public_html
php api/utils/reset_password.php          # lista użytkowników
php api/utils/reset_password.php admin    # ustawia losowe hasło i je wypisuje
```
Po zalogowaniu zmień hasło w aplikacji (Ustawienia → Zmień hasło).

## 📱 Funkcje

### Start (skróty do wszystkiego)
- ✅ 4 duże przyciski: Współpraca, Zakup ze screena, Pomysł, Nagraj (prompter)
- ✅ 3 liczby: ten miesiąc na rękę, do zapłaty, do zwrotu
- ✅ Jedna lista „Do ogarnięcia” z akcjami jednym kliknięciem (opłacone / zwrot / zostaje)

### Współprace
- ✅ Dodawanie w jednym arkuszu: marka + kwota, reszta „jak ostatnio” z tą marką
- ✅ Wybór jednym kliknięciem (rozliczenie, rodzaj, data) zamiast list rozwijanych
- ✅ Opcjonalnie: uzupełnienie ze screena maila / zlecenia (AI)
- ✅ Na górze nieopłacone z przyciskiem ✓, historia po miesiącach
- ✅ Spóźniony przelew (> 30 dni) oznacza się sam

### Zakupy i zwroty
- ✅ Dodawanie ze screena zamówienia / paragonu (AI odczytuje sklep, datę, rzeczy i ceny)
- ✅ Wklejanie ze schowka, zdjęcie aparatem, „Udostępnij → Gosia” z galerii (Android)
- ✅ Każda rzecz osobno: „Zwrot” albo „Zostaje” jednym kliknięciem, cofanie z powiadomienia
- ✅ Przypomnienia push przed końcem terminu zwrotu

### Statystyki Social Media
- ✅ **Automatyczne pobieranie** liczby obserwujących z Instagrama, Facebooka, YouTube i TikToka
- ✅ Wystarczy podać nazwy profili w aplikacji (Statystyki → „Profile”), bez kluczy API
- ✅ Odświeżanie w tle raz dziennie (przy otwarciu aplikacji) + opcjonalny cron serwerowy
- ✅ Zmiana liczby obserwujących w ostatnich 7 dniach, status pobierania i błędy per platforma
- ✅ Opcjonalnie: klucz YouTube Data API, OAuth TikTok/Facebook, awaryjne scrapery RapidAPI
- ✅ Ręczna korekta liczby (ołówek na kafelku)

### Statystyki
- ✅ Rok na jednym ekranie: na rękę, brutto, miesiąc po miesiącu, najlepsi klienci
- ✅ Próg podatkowy, gotówka poza PIT, odzyskane ze zwrotów

### Załączniki
- ✅ Pliki przy współpracach (umowy, faktury) i zakupach (paragony)
- ✅ Upload do 10 MB (zdjęcia, PDF, dokumenty)
- ✅ Pliki serwowane tylko po autoryzacji (poza publicznym URL)

### Dokumenty (archiwum umów, NDA)
- ✅ Data dokumentu (np. data podpisania), sortowanie: najnowsze / najstarsze / nazwa A–Z, filtr po roku
- ✅ **AI (Claude Haiku 5.5)**: wystarczy wrzucić plik (można kilka naraz) — AI ustawia nazwę, datę, status i streszczenie, a skany zamienia na tekst do wyszukiwania. Przycisk ✨ przy dokumencie czyta go ponownie. Dokumenty idą tylko do Claude (nigdy do Gemini); model: `ANTHROPIC_DOCS_MODEL` w `api/.env`
- ✅ Status **Podpisane / Do podpisu** — wybór przy dodawaniu, filtr na liście, zmiana jednym kliknięciem w etykietę
- ✅ Upload umowy + własna nazwa i notatka (PDF, Word, ODT, Excel, TXT, zdjęcia, do 20 MB)
- ✅ Wyszukiwarka po nazwie, notatce, nazwie pliku **i treści** dokumentu (bez rozróżniania wielkości liter i polskich znaków)
- ✅ Tekst z PDF odczytywany w przeglądarce (pdf.js), z DOCX/ODT/XLSX/TXT na serwerze — zero kosztów, bez zewnętrznych usług
- ✅ Skany (PDF bez warstwy tekstu, zdjęcia) — szukane po nazwie i notatce
- ✅ Pliki w `api/uploads/documents/` (zablokowane przez `.htaccess`, losowe nazwy), pobieranie tylko przez `api/documents/download.php` po zalogowaniu, `Cache-Control: no-store`
- ✅ Tabela `documents` tworzy się sama przy pierwszym użyciu; na telefonie wejście przez Ustawienia → Dokumenty

### PWA i Powiadomienia Push
- ✅ Aplikacja instalowalna na telefonie (manifest + service worker)
- ✅ Działa offline (cache aplikacji)
- ✅ Powiadomienia push: przypomnienia o terminach zwrotów (bez rzeczy oznaczonych „zostaje”), spóźnionych przelewach (> 30 dni) i pomysłach do nagrania (poniedziałki i czwartki)
- ✅ Włączanie/wyłączanie dzwonkiem w nagłówku aplikacji

### Techniczne
- ✅ Bezpieczne logowanie (JWT)
- ✅ Mobile-first design
- ✅ SPA z React Router
- ✅ Responsywny layout

## 🔔 Konfiguracja Powiadomień Push

1. **Wygeneruj klucze VAPID** (raz, lokalnie lub na serwerze):
   ```bash
   php api/utils/generate_vapid_keys.php
   ```
   Skopiuj wypisane linie do `api/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` z własnym e-mailem).

2. **Utwórz tabele** (nowa instalacja ma je w `schema.sql`; istniejąca baza):
   ```bash
   php api/migrations/add_push_and_attachments.php
   ```

3. **Ustaw dzienny cron** na dHosting (panel → Harmonogram zadań), np. o 9:00:
   ```
   php /ścieżka/do/public_html/api/cron/send_reminders.php
   ```
   Alternatywnie cron przez URL — ustaw `CRON_SECRET` w `api/.env` i wywołuj:
   `https://twoja-domena.pl/api/cron/send_reminders.php?secret=TWÓJ_SEKRET`

4. W aplikacji kliknij **dzwonek** w nagłówku i zaakceptuj zgodę na powiadomienia. Od razu przyjdzie powiadomienie testowe.

## 🤖 Czytanie screenów (AI)

Najprościej w aplikacji: **Ustawienia → Czytanie screenów (AI)** → wybierz Claude albo Gemini, wklej klucz
i „Sprawdź i zapisz”. Klucz jest sprawdzany u dostawcy (bez kosztów), zapisywany w bazie zaszyfrowany
(AES-256-GCM, klucz pochodny od `JWT_SECRET`) i potem pokazywany tylko jako maska.

Alternatywnie w `api/.env` (klucz z aplikacji ma pierwszeństwo):

```
ANTHROPIC_API_KEY=sk-ant-...      # Claude (https://console.anthropic.com)
# albo
GEMINI_API_KEY=...                # Gemini (https://aistudio.google.com/apikey)
```

- Gdy są oba klucze, wybór w Ustawieniach albo `AI_PROVIDER=claude|gemini`.
- Model można zmienić przez `ANTHROPIC_MODEL` / `GEMINI_MODEL` (domyślnie `claude-sonnet-5-5` / `gemini-flash-latest`).
- Bez klucza zakupy działają w trybie ręcznym.
- Zmiana `JWT_SECRET` unieważnia zapisane w aplikacji klucze - trzeba je wpisać ponownie.
- Endpointy: `api/ai/parse.php` (tryby `purchase` i `collaboration`), `api/settings/ai.php` (zapis klucza). Klucz nigdy nie trafia do przeglądarki.
- Tabela `app_settings` i kolumny `purchases.kept_confirmed`, `purchases.returned_at` tworzą się same przy pierwszym użyciu.

## 📈 Automatyczne pobieranie obserwujących

1. W aplikacji: **Statystyki → Profile** — wpisz nazwę profilu Instagram, link do strony na Facebooku, handle kanału YouTube (`@nazwa` lub `UC…`) i nazwę na TikToku. Zapis od razu pobiera liczby.
2. Aplikacja sama odświeża dane **raz dziennie** przy pierwszym otwarciu (w tle, bez blokowania).
3. Dla pewności ustaw też dzienny cron na serwerze (np. 7:30), niezależny od otwierania aplikacji:
   ```
   php /ścieżka/do/public_html/api/cron/refresh_social.php
   ```
   lub przez URL z `CRON_SECRET`: `https://twoja-domena.pl/api/cron/refresh_social.php?secret=TWÓJ_SEKRET`
4. Skąd biorą się dane (kolejność prób w `api/config/SocialFetcher.php`):
   - Instagram: publiczne API webowe → HTML profilu → RapidAPI (jeśli klucz w `social_credentials.php`)
   - Facebook: Graph API (po OAuth) → HTML strony → RapidAPI (jeśli klucz)
   - YouTube: Data API v3 (darmowy klucz `youtube.api_key` — zalecane) → OAuth → HTML kanału
   - TikTok: HTML profilu → OAuth (token odświeżany automatycznie)
5. Nieudana próba jest ponawiana po 3 godzinach; status i treść błędu widać w oknie „Profile”. Zawsze można wpisać liczbę ręcznie.

Tabele `social_profiles` i `social_refresh_log` tworzą się same przy pierwszym użyciu.

Wysyłka push nie wymaga żadnych bibliotek composera — implementacja VAPID (RFC 8292) i szyfrowania aes128gcm (RFC 8291) jest w `api/config/WebPush.php` i korzysta tylko z rozszerzeń `openssl` + `curl`.

## 📝 License

Private project
