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
