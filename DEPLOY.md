# Wdrożenie na serwer (dHosting)

## Jak to działa

Document root na dHosting to `public_html` i nie da się tego zmienić.
Aplikacja jest więc serwowana **z katalogu głównego repo**:

- `index.html` + `assets/` + `sw.js` + `manifest.json` + `icons/` — zbudowany frontend (artefakty commitowane do git),
- `api/` — backend PHP,
- `.htaccess` — kieruje `/api/*` do PHP, wszystko inne do `index.html` (React Router).

Źródłem frontendu jest `frontend/src`. Build Vite trafia do `build/`
(katalog **ignorowany** przez git), a skrypt `npm run deploy` kopiuje go do rootu.
Do repo commitujemy tylko kopie w root — jedno źródło prawdy.

## Deploy — krok po kroku

### 1. Pierwsza konfiguracja na serwerze (TYLKO RAZ)

```bash
cd ~/public_html
git init
git remote add origin https://github.com/amdydesign/gosia.git
git fetch --all
git reset --hard origin/main
cp api/.env.example api/.env   # i uzupełnij wartości (DB, JWT_SECRET, ...)
```

### 2. Po zmianach w kodzie

**Na komputerze** — uruchom `deploy.bat` (Windows) albo ręcznie:

```bash
cd frontend
npm run deploy        # build + synchronizacja do rootu repo
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

Jeśli w opisie zmian są nowe migracje — uruchom je z CLI:

```bash
php api/migrations/<nazwa_migracji>.php
```

### 3. Sprawdź, czy działa

Otwórz w trybie incognito: `https://panel.malgorzatamordarska.pl`
(incognito omija stary cache; service worker sam dociągnie nową wersję przy nawigacji).
