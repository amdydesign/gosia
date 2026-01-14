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

**Domyślne dane:**
- Login: `admin`
- Hasło: `password` (zmień w produkcji!)

Aby zmienić hasło, wygeneruj nowy hash:
```php
echo password_hash('nowe_haslo', PASSWORD_BCRYPT);
```

I zaktualizuj w tabeli `users`.

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

### Techniczne
- ✅ Bezpieczne logowanie (JWT)
- ✅ Mobile-first design
- ✅ SPA z React Router
- ✅ Responsywny layout

## 📝 License

Private project
