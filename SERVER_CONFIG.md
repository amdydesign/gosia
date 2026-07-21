# Konfiguracja serwera dHosting dla Gosia 2.0

## Jedyna obowiązująca konfiguracja

Document root pozostaje na `public_html` (domyślne ustawienie dHosting — nic nie zmieniaj
w panelu). Repo jest sklonowane bezpośrednio do `public_html`, a routing załatwia
commitowany plik `.htaccess` w katalogu głównym:

- `/api/*` → pliki PHP w `api/`,
- istniejące pliki statyczne (`assets/`, `icons/`, `sw.js`, …) → serwowane wprost,
- wszystko inne → `index.html` (React Router).

Frontend NIE jest serwowany z `frontend/dist` — ten katalog nie istnieje w repo.
Zbudowane artefakty leżą w root repo i są aktualizowane skryptem `npm run deploy`
(szczegóły w `DEPLOY.md`).

## Problem: stara wersja nadal się wyświetla

1. Upewnij się, że na serwerze wykonano `git pull origin main` w `~/public_html`.
2. Sprawdź, że deploy z komputera faktycznie zbudował frontend
   (`npm run deploy` w `frontend/`, potem commit + push — albo po prostu `deploy.bat`).
3. Otwórz stronę w trybie incognito. Service worker (`sw.js`) ma nagłówek
   `Cache-Control: no-cache` w `.htaccess`, więc przy zwykłej nawigacji też
   dociągnie nową wersję — najpóźniej przy drugim wejściu.

## Weryfikacja

1. Otwórz stronę w nowej karcie incognito (Ctrl+Shift+N).
2. Sprawdź w devtools (F12 → Network), czy ładuje się aktualny bundle `assets/index-*.js`.
3. Sprawdź, czy zapytania do `/api/...` zwracają odpowiedzi JSON.
