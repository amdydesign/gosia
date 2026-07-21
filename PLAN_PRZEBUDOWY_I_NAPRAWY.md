# Plan przebudowy i naprawy — Gosia Stylist Manager

> Dokument powstał na podstawie pełnego audytu kodu (backend `api/`, frontend `frontend/`, struktura buildów i deploymentu) wykonanego 2026-07-21. Zawiera listę znalezionych problemów oraz plan naprawy podzielony na fazy — od pilnych łatek bezpieczeństwa po docelową przebudowę architektury.

## Spis treści

1. [Diagnoza — najważniejsze problemy](#1-diagnoza--najważniejsze-problemy)
2. [Faza 0 — Pilne łatki bezpieczeństwa (~1 dzień)](#2-faza-0--pilne-łatki-bezpieczeństwa)
3. [Faza 1 — Porządki w repozytorium i deployu (~1 dzień)](#3-faza-1--porządki-w-repozytorium-i-deployu)
4. [Faza 2 — Przebudowa backendu (~2–4 dni)](#4-faza-2--przebudowa-backendu)
5. [Faza 3 — Przebudowa frontendu (~3–5 dni)](#5-faza-3--przebudowa-frontendu)
6. [Faza 4 — PWA i wykończenie (~1 dzień)](#6-faza-4--pwa-i-wykończenie)
7. [Co celowo zostawiamy bez zmian](#7-co-celowo-zostawiamy-bez-zmian)
8. [Weryfikacja po każdej fazie](#8-weryfikacja-po-każdej-fazie)

---

## 1. Diagnoza — najważniejsze problemy

### 1.1 Bezpieczeństwo (krytyczne)

| # | Problem | Gdzie |
|---|---------|-------|
| B1 | Endpointy scraperów **bez żadnej autoryzacji**, z `Access-Control-Allow-Origin: *` i hardcodowanym `userId = 1`. Każde anonimowe wywołanie zużywa płatne zapytanie RapidAPI i zapisuje dane do bazy. | `api/social/scrape_facebook.php`, `api/social/scrape_instagram.php` |
| B2 | **Skrypty migracji wykonywalne z internetu** — każdy może wejść na `…/api/migrations/xxx.php` i zmienić schemat bazy (`ALTER TABLE`/`CREATE TABLE`). Brak guardu CLI i brak blokady w `.htaccess`. | `api/migrations/*.php` |
| B3 | **Wyłączona weryfikacja TLS** (`CURLOPT_SSL_VERIFYPEER = false`) przy wymianie kodów OAuth — podatność na MITM i kradzież tokenów. | `api/auth/facebook/exchange.php:47,63,81`, `api/auth/tiktok/exchange.php:56,83` |
| B4 | Parametr OAuth **`state` jest generowany, ale nigdy nie walidowany** w `exchange.php` → OAuth CSRF. | `api/auth/*/get_auth_url.php` + `exchange.php` |
| B5 | **Tokeny dostępowe social media trzymane plaintext** w tabeli `social_connections`. | `api/auth/facebook/exchange.php:101` i analogiczne |
| B6 | `.env.example` **niekompletny** — brak `JWT_SECRET`, `APP_URL` i wszystkich `SOCIAL_*`. Wdrożenie z przykładu = JWT podpisywany pustym sekretem. | `api/.env.example`, `api/config/JWTHandler.php:25` |
| B7 | Seedowany użytkownik **`admin` ze znanym hasłem `password`**. | `api/database/schema.sql:183` |
| B8 | **Brak rate-limitingu** logowania (nieograniczony credential stuffing) i słaba polityka haseł (min. 6 znaków). | `api/auth/login.php`, `api/auth/change_password.php:24` |
| B9 | **Niespójne ujawnianie błędów** — część endpointów zwraca surowy `$e->getMessage()` bez bramki `APP_DEBUG`. | m.in. `api/collaborations/update.php:112`, `api/auth/facebook/exchange.php:136`, `api/stats/social/refresh.php:145`, `api/auth/change_password.php:59` |
| B10 | `reset_password_request.php` to **atrapa** — zawsze zwraca sukces, nic nie wysyła. Użytkownik myśli, że reset zadziałał. | `api/auth/reset_password_request.php:33-36` |

### 1.2 Martwy / zepsuty kod

- **Cały katalog `api/returns/`** odwołuje się do tabeli `returns`, która została przemianowana na `purchases` — każde wywołanie kończy się błędem SQL. Żywą reimplementacją jest `api/purchases/`.
- Frontend: `components/layout/BottomNav.jsx` (nieimportowany nigdzie, linkuje do nieistniejącej trasy `/returns`), `src/App.css` i `src/assets/react.svg` (pozostałości startera Vite), `authService.verifyToken()` (nigdy niewywoływany), `Database::getInstance()` (martwy singleton).

### 1.3 Architektura backendu

- **Brak wspólnego bootstrapu** — blok `require cors.php / Database / Response / auth` + guard metody + `try/catch` jest skopiowany do ~40 plików endpointów. Zmiana np. CORS wymaga edycji 40+ plików.
- **Dryf schematu bazy**: `schema.sql` nie zawiera kolumn dodawanych migracjami (`users.token_version`, `collaborations.fiscal_tracking`, `collaborations.collab_type`) — świeża instalacja ze `schema.sql` **psuje logowanie** (kod wymaga `token_version`). Migracje są nienumerowane, bez tabeli śledzącej i bez wymuszonej kolejności; `add_push_and_attachments.php` duplikuje DDL już obecny w `schema.sql`.
- **Dwie nakładające się kolumny typu współpracy**: ścisły ENUM `type` + wolny `VARCHAR collab_type` z magicznymi stringami (`umowa_50`, `useme_20`, `gotowka`…) zdefiniowanymi tylko w `api/utils/TaxCalculator.php` i `export.php`.
- `api/purchases/index.php:47` — `LIMIT` wstawiany przez `str_replace` zamiast bindowania (jedyne odstępstwo od prepared statements; obecnie niegroźne dzięki `intval`, ale to zły wzorzec).
- Brak walidacji wejścia: `collaborations/create.php`/`update.php` nie walidują `type`/`payment_status`/`collab_type`; `update.php` nie waliduje formatu daty.

### 1.4 Architektura frontendu

- **Dwie równoległe, niekompatybilne warstwy API**:
  - `services/api.js` (axios) — token z interceptora, zwraca pełną kopertę `{success, data}`, 401 czyści localStorage + sessionStorage;
  - `utils/api.js` (fetch) — token przekazywany ręcznie jako argument, zwraca rozpakowane `data.data`, 401 czyści **tylko** localStorage.
  Komponenty konsumują dwa różne kształty odpowiedzi; `services/ideas.js` miesza obie warstwy.
- **Brak odświeżania sesji** — po wygaśnięciu JWT (24 h) twardy redirect do `/login`; `verifyToken()` istnieje, ale nie jest używany.
- **Zduplikowane formularze**: `CollaborationNew.jsx` (506 linii) vs `CollaborationEdit.jsx` (537) oraz analogiczna para Purchase — te same formularze i logika finansowa skopiowane.
- `Statistics.jsx` (540 linii) — wszystko w jednym pliku; przycisk „Odśwież" **blankuje całą stronę** (kolizja stanu `loading` z bramką renderowania, linie ~191/306); UX na `window.alert()`/`prompt()`.
- `/stats/dashboard.php` odpytywany **do 3× równocześnie** (Dashboard + `useUrgentReturns` w `Sidebar` i `MobileBottomNav`, każdy z własnym interwałem 60 s); brak `AbortController` → `setState` po odmontowaniu.
- **Niezweryfikowana logika podatkowa** w `utils/format.js:128-196` — stawki (ZUS 13,71%, zdrowotna 9%, KUP 250, prowizja Useme 7,8%, podatek 12%…) z komentarzami przyznającymi, że to założenia.
- `getCollabTypeLabel` (`format.js:34-44`) nie mapuje `umowa-praca`, choć formularz oferuje ten typ → w UI renderuje się surowy klucz.
- ~30 `console.log/error` w kodzie produkcyjnym; brak code-splittingu — jeden bundle 480–557 KB (Chart.js ładowany zawsze).
- `IdeaView.loadIdea` przekierowuje do `/ideas` przy **każdym** błędzie (nawet chwilowym problemie z siecią), bez komunikatu.

### 1.5 Build i deployment (największy chaos)

- **Cztery zacommitowane drzewa buildów w dwóch różnych generacjach**:
  | Lokalizacja | Generacja | Status |
  |---|---|---|
  | `/index.html` + `/assets/` (root) | NOWA | **to serwuje `.htaccess`** |
  | `/build/` (outDir Vite) | NOWA | identyczna z rootem |
  | `/public_build/` | STARA | przestarzała |
  | `/frontend/dist/` | STARA | przestarzała, a **`DEPLOY.md` i `SERVER_CONFIG.md` wskazują właśnie na nią** |
- `frontend/.gitignore` ignoruje `dist`, ale katalog był zacommitowany wcześniej i wciąż jest śledzony.
- `backup_to_github.bat` robi ślepe `git add . && commit && push` — stąd nagromadzenie starych buildów.
- Service worker: cache `gosia-v1` nigdy nie bumpowany; brak promptu „dostępna nowa wersja"; `sw.js` zduplikowany (root + `frontend/public/`); poprawność aktualizacji zależy wyłącznie od nagłówka `no-cache` w `.htaccess`.
- Rozjazd kolorów motywu: Tailwind `#c084a0` vs `#9333ea` w `index.html`/`manifest.json` vs `rgba(124,58,237)` w wykresach.

---

## 2. Faza 0 — Pilne łatki bezpieczeństwa

**Cel: zamknąć dziury, które są exploitowalne dziś, bez ruszania architektury. Wdrożyć na produkcję od razu.**

1. **Scrapery** (`api/social/scrape_facebook.php`, `scrape_instagram.php`):
   - dodać `requireAuth()` i brać `userId` z tokenu zamiast hardcodowanej `1`;
   - usunąć `Access-Control-Allow-Origin: *` — używać wspólnego `config/cors.php`;
   - usunąć zakomentowany debug `file_put_contents('debug_response.json', …)`.
2. **Migracje** (`api/migrations/*.php`): na początku każdego pliku guard `if (php_sapi_name() !== 'cli') { http_response_code(403); exit; }` (wzorzec już istnieje w `api/utils/generate_vapid_keys.php:8`) **oraz** `Deny from all` / `Require all denied` w nowym `api/migrations/.htaccess`.
3. **TLS w OAuth**: usunąć wszystkie `CURLOPT_SSL_VERIFYPEER => false` (`auth/facebook/exchange.php`, `auth/tiktok/exchange.php`).
4. **OAuth `state`**: zapisywać `state` po stronie serwera (tabela lub podpisany token z TTL) w `get_auth_url.php` i walidować w `exchange.php`; odrzucać wymianę bez poprawnego `state`.
5. **`.env.example`**: dopisać `JWT_SECRET`, `APP_URL`, `CRON_SECRET`, komplet `SOCIAL_*` (z komentarzami skąd wziąć wartości).
6. **Admin**: usunąć seed ze znanym hasłem ze `schema.sql` (zastąpić instrukcją generowania hasha) i **zmienić hasło na produkcji**.
7. **Błędy**: przejść po wszystkich endpointach i ujednolicić — komunikat wyjątku tylko przy `($_ENV['APP_DEBUG'] ?? '') === 'true'`, w przeciwnym razie generyczny komunikat (wzorzec z `attachments/upload.php:91`).
8. **Rate-limiting logowania**: prosty licznik prób per login+IP w tabeli (np. 5 prób / 15 min) w `auth/login.php`.

**Efekt:** żaden anonimowy użytkownik nie może wywołać płatnego API, zmienić schematu bazy ani przechwycić tokenów OAuth.

## 3. Faza 1 — Porządki w repozytorium i deployu

**Cel: jedno źródło prawdy dla buildu, brak martwego kodu, dokumentacja zgodna z rzeczywistością.**

1. **Usunąć martwy backend**: cały katalog `api/returns/` (zepsuty duplikat `purchases/`).
2. **Jedna ścieżka buildu** — decyzja: build serwowany z **rootu** (`/index.html` + `/assets/`), bo tak działa obecny `.htaccess`:
   - `frontend/vite.config.js`: `outDir: '..'` jest ryzykowne, więc zostawić `outDir: '../build'` i dodać skrypt `deploy` kopiujący `build/index.html` + `build/assets/` do rootu (albo prościej: skrypt `npm run build && rsync do rootu`);
   - usunąć z repo: `public_build/`, `frontend/dist/` (`git rm -r --cached` + wpisy w `.gitignore`), `build/` dodać do `.gitignore` (artefakt pośredni);
   - usunąć duplikat `sw.js` — źródłem jest `frontend/public/sw.js`, root dostaje kopię przy buildzie.
3. **Usunąć martwy frontend**: `BottomNav.jsx` (+ nieużywane części `BottomNav.css`), `src/App.css`, `src/assets/react.svg`.
4. **Dokumentacja**: poprawić `DEPLOY.md` i `SERVER_CONFIG.md`, żeby opisywały wyłącznie faktyczny mechanizm (git pull do `public_html`, serwowanie z rootu); usunąć trzy sprzeczne warianty.
5. **Zastąpić `backup_to_github.bat`** skryptem deployu, który builduje, kopiuje artefakty i commituje tylko świadomie wybrane pliki.

## 4. Faza 2 — Przebudowa backendu

**Cel: zlikwidować duplikację, ustabilizować schemat bazy, dodać walidację — bez zmiany stacku (PHP bez frameworka jest OK na dHosting).**

1. **Wspólny bootstrap `api/bootstrap.php`**:
   - jednokrotne ładowanie `.env` (`safeLoad`), rejestracja autoloadera, `cors.php`, globalny handler wyjątków z bramką `APP_DEBUG`;
   - helper `requireMethod('POST')` i `requireAuth()`;
   - współdzielona instancja PDO — wykorzystać istniejący, martwy dziś `Database::getInstance()` (`api/config/Database.php:63`) zamiast `new Database()` w każdym pliku;
   - przepiąć wszystkie ~40 endpointów na `require_once __DIR__.'/../bootstrap.php';` — każdy endpoint chudnie o ~20 linii boilerplate'u.
2. **Schemat bazy — jedno źródło prawdy**:
   - zaktualizować `api/database/schema.sql` o wszystko, co dodały migracje (`users.token_version`, `collaborations.fiscal_tracking`, `collaborations.collab_type`, tabele push/attachments — bez duplikacji);
   - wprowadzić **numerowane migracje** (`migrations/001_….php`, `002_…`) + tabelę `migrations` śledzącą wykonane + prosty runner CLI `php api/migrations/run.php`;
   - dodać indeksy na kolumnach filtrowanych w `export.php`/`dashboard.php` (`collab_type`, `fiscal_tracking`).
3. **Walidacja wejścia**: centralny helper (np. `config/Validator.php`) z listami dozwolonych wartości `type`/`payment_status`/`collab_type` (jedno miejsce, współdzielone z `TaxCalculator`), walidacją dat i kwot; użyć w `collaborations/create|update`, `purchases/create|update|index` (parametr `status`).
4. **Naprawić `LIMIT`** w `api/purchases/index.php:47` — bindować przez `PDO::PARAM_INT`.
5. **Ujednolicić model typów współpracy**: `collab_type` jako jedyne pole rozliczeniowe ze zdefiniowaną listą wartości (walidacja + docelowo ENUM w DB), `type` pozostaje kategorią merytoryczną; udokumentować w README.
6. **Szyfrowanie tokenów social** w `social_connections` (libsodium `sodium_crypto_secretbox`, klucz w `.env`); migracja szyfrująca istniejące rekordy.
7. **Reset hasła**: albo wdrożyć naprawdę (token w DB + wysyłka mailem przez SMTP dHosting), albo usunąć endpoint i stronę `ForgotPassword` — do decyzji właścicielki; obecna atrapa jest gorsza niż brak funkcji.

## 5. Faza 3 — Przebudowa frontendu

**Cel: jedna warstwa API, brak duplikacji formularzy, mniejszy bundle, poprawne stany ładowania.**

1. **Jeden klient API**: zostaje lekki wrapper na `fetch` (rozbudowany `utils/api.js`); usunąć axios z zależności.
   - jeden kształt odpowiedzi (rozpakowane `data`), jeden punkt obsługi 401 (czyści localStorage **i** sessionStorage, redirect przez router, nie `window.location`);
   - token pobierany w jednym miejscu (z `AuthContext`/storage), nie przekazywany ręcznie przez każdą stronę;
   - przepiąć: `Dashboard`, `Statistics`, `auth`, `push`, `ideas`, `SocialCallback`, `ChangePasswordModal`, `PushToggle`, `ForgotPassword`.
2. **Routing** (`src/App.jsx`): jeden layout route (`<Route element={<ProtectedRoute><AppLayout/></ProtectedRoute>}>` + trasy zagnieżdżone) zamiast 15 powtórzeń wrappera; `React.lazy()` dla stron — szczególnie `Statistics` (wydzieli Chart.js z głównego bundle'a).
3. **Deduplikacja formularzy**: wspólne `CollaborationForm.jsx` i `PurchaseForm.jsx` używane przez New/Edit (tryb przez props) — likwiduje ~700 linii duplikacji; wydzielić komponent podsumowania finansowego.
4. **`Statistics.jsx`**: rozbić na podkomponenty (karty platform, wykresy, sekcja odświeżania); osobny stan `refreshing` (spinner inline zamiast blankowania strony); zastąpić `alert()`/`prompt()` UI w komponencie; usunąć auto-scrape z efektu montowania na rzecz jawnego przycisku lub jednego kontrolowanego efektu.
5. **Pilne zwroty**: jeden współdzielony poller (context/provider) zamiast dwóch niezależnych interwałów w `Sidebar` i `MobileBottomNav`; `AbortController` we wszystkich fetchach efektowych.
6. **Poprawki błędów**:
   - `getCollabTypeLabel` — dodać `umowa-praca` (`utils/format.js:34-44`);
   - `IdeaView` — stan błędu zamiast redirectu przy problemie z siecią;
   - obsługa błędów widoczna dla użytkownika w `ExportModal`, `ChangePasswordModal`, akcjach `IdeaView`.
7. **Logika podatkowa (`utils/format.js:128-196`)**: wydzielić stałe do jednego modułu `utils/tax.js` z nazwanymi stawkami i datą obowiązywania; **zweryfikować każdą stawkę z właścicielką/księgową** (w kodzie są komentarze „assumption"); dodać testy jednostkowe (Vitest) na znane przypadki. Do czasu weryfikacji oznaczyć wyliczenia w UI jako szacunkowe.
8. **Higiena**: usunąć wszystkie `console.log` (zostawić `console.error` w ErrorBoundary), włączyć `npm run lint` do procesu (patrz Faza 4 — CI).

## 6. Faza 4 — PWA i wykończenie

1. **Service worker**: wersja cache generowana per build (np. wstrzykiwany hash zamiast stałego `gosia-v1`); obsługa `updatefound` + prosty toast „Nowa wersja — odśwież"; usunąć `skipWaiting()` albo świadomie zostawić z natychmiastowym reloadem.
2. **Spójność motywu**: jeden kolor primary (decyzja właścicielki: róż `#c084a0` czy fiolet `#9333ea`) w Tailwind, `manifest.json`, `index.html` i wykresach.
3. **CI (opcjonalnie, GitHub Actions)**: na push — `npm ci && npm run lint && npm run build` + `php -l` na plikach api. Zapobiega commitowaniu zepsutego kodu i wymusza lint.
4. **README**: zaktualizować sekcje struktury i deploymentu po zmianach z Fazy 1.

## 7. Co celowo zostawiamy bez zmian

- **Stack** (PHP bez frameworka + React + MySQL) — adekwatny do hostingu współdzielonego i skali (jedna użytkowniczka); przepisywanie na Laravel/Node nie zwróciłoby kosztu.
- **Pipeline załączników** (`api/attachments/`) — wzorowy: sniffing MIME przez `finfo`, allow-lista rozszerzeń, losowe nazwy plików, `.htaccess` blokujący bezpośredni dostęp, kontrola właściciela przy pobieraniu.
- **Ochrona crona** (`api/cron/send_reminders.php`) — poprawne `hash_equals` na sekrecie.
- **Prepared statements** — używane konsekwentnie (poza jednym `LIMIT` do naprawy).
- **Ręczna implementacja Web Push** (`api/config/WebPush.php`) — działa i nie wymaga composera; tylko monitorować, bo to wrażliwy kod kryptograficzny.
- **Lekki zestaw zależności** composera (dotenv + php-jwt).

## 8. Weryfikacja po każdej fazie

- **Faza 0**: próba wywołania scraperów i migracji bez tokenu → 401/403; logowanie działa; OAuth łączy konta z poprawnym `state`; testowe błędne żądanie nie ujawnia stack trace przy `APP_DEBUG=false`.
- **Faza 1**: `npm run build` + skrypt deployu → aplikacja działa z rootu; `git status` czysty (żadnych artefaktów poza wybraną ścieżką); świeży klon + `DEPLOY.md` wystarczają do wdrożenia.
- **Faza 2**: świeża baza ze `schema.sql` + `php api/migrations/run.php` → logowanie i wszystkie moduły działają; smoke test CRUD każdego zasobu (`collaborations`, `purchases`, `ideas`, `attachments`, `push`); niepoprawne `type`/`status`/`date` → 400 z czytelnym komunikatem.
- **Faza 3**: `npm run lint` bez błędów; `npm run build` — bundle główny wyraźnie mniejszy (Chart.js w osobnym chunku); ręczny test: odświeżanie statystyk bez blankowania, wygaśnięcie sesji z obu storage'ów, formularze New/Edit dla współprac i zakupów; testy Vitest logiki podatkowej przechodzą.
- **Faza 4**: po deployu nowej wersji klient dostaje prompt aktualizacji; Lighthouse PWA bez regresji.

---

### Proponowana kolejność wdrażania

Fazy są niezależnymi porcjami pracy (każda = osobny PR). Kolejność 0 → 1 → 2 → 3 → 4 jest zalecana: najpierw bezpieczeństwo (produkcja jest dziś podatna), potem uporządkowanie deployu (żeby kolejne zmiany dało się bezpiecznie wdrażać), na końcu refaktoryzacje.

**Decyzje wymagane od właścicielki przed Fazą 2/3:**
1. Reset hasła — wdrożyć z wysyłką e-mail czy usunąć?
2. Weryfikacja stawek podatkowych/prowizji w `utils/format.js` (najlepiej z księgową).
3. Docelowy kolor motywu aplikacji (róż vs fiolet).
