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

### 1. Build Frontend
```bash
cd frontend
npm run build
```

### 2. Upload przez FTP

Wgraj następujące elementy do `public_html/`:

```
public_html/
├── index.html          # z frontend/dist/
├── assets/             # z frontend/dist/assets/
├── api/                # cały folder api/
│   ├── (wszystkie pliki PHP)
│   ├── vendor/         # ważne!
│   └── .env            # uzupełnij prawidłowe dane
└── .htaccess           # routing
```

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

Ze względów bezpieczeństwa schemat bazy **nie zawiera** domyślnego użytkownika. Po utworzeniu bazy wygeneruj hash własnego hasła:

```bash
php -r "echo password_hash('TWOJE_HASLO', PASSWORD_DEFAULT), PHP_EOL;"
```

i utwórz użytkownika:

```sql
INSERT INTO users (username, password_hash, email)
VALUES ('admin', '<WYGENEROWANY_HASH>', 'twoj-email@example.com');
```

Logowanie ma limit prób (5 nieudanych na login+IP w ciągu 15 minut — wymaga tabeli `login_attempts`, dla istniejącej bazy uruchom `php api/migrations/add_login_attempts.php`).

**Wymagane zmienne w `api/.env`:** m.in. `JWT_SECRET` (bez niego API odrzuci logowanie) — pełna lista w `api/.env.example`.

> Skrypty w `api/migrations/` można uruchamiać wyłącznie z linii poleceń (CLI) — dostęp przez HTTP jest zablokowany.

## 📱 Funkcje

### Dashboard
- ✅ Podsumowanie współprac i zarobków
- ✅ Nadchodzące terminy zwrotów z alertami
- ✅ Szybki podgląd statystyk

### Współprace
- ✅ Pełne zarządzanie współpracami (CRUD)
- ✅ Typy: barter, płatny, ambasadorski, eventy
- ✅ Śledzenie statusów i terminów
- ✅ Filtrowanie i wyszukiwanie

### Zwroty
- ✅ Zarządzanie zwrotami produktów
- ✅ Automatyczne alerty przed terminem
- ✅ Historia i statusy

### Zakupy
- ✅ Rejestr zakupów odzieży
- ✅ Śledzenie zwrotów do sklepów
- ✅ Kategorie i wartości

### Statystyki Social Media
- ✅ Integracja YouTube (API Key + Channel ID)
- ✅ Integracja TikTok (OAuth)
- ✅ Integracja Facebook (OAuth)
- ✅ Automatyczne odświeżanie przy wejściu
- ✅ Ikony SVG platform

### Wykresy i Raporty
- ✅ Zarobki miesięczne (wykres)
- ✅ Podział według typu współpracy
- ✅ Łączne statystyki

### Załączniki
- ✅ Pliki przy współpracach (umowy, faktury) i zakupach (paragony)
- ✅ Upload do 10 MB (zdjęcia, PDF, dokumenty)
- ✅ Pliki serwowane tylko po autoryzacji (poza publicznym URL)

### PWA i Powiadomienia Push
- ✅ Aplikacja instalowalna na telefonie (manifest + service worker)
- ✅ Działa offline (cache aplikacji)
- ✅ Powiadomienia push: przypomnienia o terminach zwrotów i zaległych płatnościach
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

Wysyłka push nie wymaga żadnych bibliotek composera — implementacja VAPID (RFC 8292) i szyfrowania aes128gcm (RFC 8291) jest w `api/config/WebPush.php` i korzysta tylko z rozszerzeń `openssl` + `curl`.

## 📝 License

Private project
