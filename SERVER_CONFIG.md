# Konfiguracja serwera dHosting dla Gosia 2.0

## Problem: Stara wersja nadal się wyświetla

Jeśli po `git pull` widzisz starą wersję, to znaczy że serwer nie wskazuje na odpowiedni folder.

## Rozwiązanie: Ustaw Document Root na frontend/dist

### Opcja 1: Panel dHosting (DirectAdmin)
1. Zaloguj się do panelu DirectAdmin
2. Przejdź do: **Zaawansowane opcje** → **Document Root dla domeny**
3. Ustaw ścieżkę na: `public_html/frontend/dist`
4. Zapisz zmiany

### Opcja 2: Przez plik .htaccess (jeśli nie masz dostępu do panelu)
Utwórz lub edytuj plik `.htaccess` w głównym katalogu `public_html`:

```apache
# Przekierowanie do folderu z Reactem
RewriteEngine On
RewriteBase /

# Jeśli to NIE jest żądanie do API
RewriteCond %{REQUEST_URI} !^/api/
# I plik/folder nie istnieje
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
# To przekieruj do React app
RewriteRule ^(.*)$ frontend/dist/$1 [L]

# Dla React Router - wszystkie żądania niebędące plikami idą do index.html
RewriteCond %{REQUEST_URI} !^/api/
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ frontend/dist/index.html [L]
```

### Opcja 3: Struktura katalogów (najlepsze rozwiązanie)
Przenieś zawartość `frontend/dist` bezpośrednio do `public_html`:

```bash
# Na serwerze, w terminalu:
cd ~/public_html
cp -r frontend/dist/* .
# Teraz główny katalog ma index.html i assets
# A API jest w podfolderze
```

## Weryfikacja
Po konfiguracji:
1. Otwórz stronę w nowej karcie incognito (Ctrl+Shift+N)
2. Sprawdź czy widzisz "Gosia 2.0"
3. Sprawdź developer console (F12) czy API się łączy
