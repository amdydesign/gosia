# Gosia — panel stylistki

## Dla kogo projektujemy

Z aplikacji korzysta osoba z **ADHD**. Każda zmiana w interfejsie ma to uwzględniać:

- **Mało naraz na ekranie.** Długie listy grupuj i zwijaj (np. zwroty per marka); domyślnie pokazuj tylko to, co wymaga działania teraz.
- **Jedna główna akcja na ekran / kartę**, wyraźnie wyróżniona. Resztę chowaj w szczegółach.
- **Najważniejsza informacja widoczna od razu** (ile rzeczy, ile pieniędzy, ile dni zostało) — bez rozwijania i bez czytania drobnego tekstu. Wyróżniaj pogrubieniem lub kolorem, a nie dużą czcionką (umiar w rozmiarach).
- **Jak najmniej kroków i decyzji.** Zgaduj i uzupełniaj za użytkownika (OCR, podpowiedzi, „jak ostatnio”), zamiast pokazywać formularze.
- **Wybaczanie błędów:** po akcji toast z „Cofnij” zamiast okienek „Czy na pewno?”.
- **Pamiętaj stan** (zwinięte/rozwinięte, zaznaczenia, filtry) — powrót do ekranu ma wyglądać tak, jak go zostawiono.
- **Terminy i pilne rzeczy kolorem** (czerwony / żółty / zielony), żeby nie trzeba było liczyć dni.
- **Krótkie, konkretne teksty** po polsku, bez żargonu.

## Praca z repo

- Interfejs i komunikaty po polsku.
- Frontend: React + Vite + Tailwind w `frontend/`. Po zmianie we frontendzie: `cd frontend && npm run deploy` (build + kopiowanie do katalogu głównego — to jest serwowane).
- Backend: PHP + MySQL w `api/`. Nowe kolumny dodawaj tak, żeby schemat naprawiał się sam (jak `DOCUMENTS_LATE_COLUMNS` / `Schema.php`).
- Właściciel pracuje tylko na produkcji (dHosting, `git pull origin main` na serwerze) — nie szukaj logów lokalnie.
- W commitach i PR nie dodawaj dopisków typu „Generated with Claude Code”.
