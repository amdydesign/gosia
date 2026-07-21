# Konfiguracja bazy danych

## 🚀 Świeża instalacja

1. Utwórz bazę MySQL (panel dHosting) i zapisz dane dostępowe w `api/.env`
   (wzór: `api/.env.example` — NIGDY nie commituj prawdziwych danych do gita).
2. W phpMyAdmin wybierz bazę → zakładka **SQL** → wklej całą zawartość
   `api/database/schema.sql` → **Wykonaj**.
3. Utwórz pierwszego użytkownika (instrukcja w README, sekcja „Logowanie").

## 🔁 Aktualizacja istniejącej bazy (migracje)

Wszystkie zmiany schematu przechodzą przez numerowane migracje w `api/migrations/`.
Po każdym deployu, który dodaje migracje, uruchom na serwerze (z CLI):

```bash
php api/migrations/run.php
```

Runner sam tworzy tabelę `migrations`, wykonuje tylko nowe pliki (kolejność wg
numeracji `001_`, `002_`, …) i zapisuje, co już wykonano. Migracje można
uruchamiać wielokrotnie — wykonane są pomijane.

**Dodawanie nowej migracji:** utwórz plik `NNN_opis.php` (kolejny numer), który
zwraca funkcję:

```php
<?php
return function (PDO $conn) {
    $conn->exec("ALTER TABLE ...");
};
```

## 🔧 Lokalne środowisko deweloperskie

1. Lokalna baza MySQL + `api/database/schema.sql`.
2. `api/.env` z lokalnymi danymi (patrz `api/.env.example`).
3. Backend: `php -S localhost:8000` (w katalogu `api/`).
4. Frontend: `npm run dev` (w katalogu `frontend/`).

## ⚠️ Ważne

- **Nie łącz lokalnego developmentu z produkcyjną bazą.**
- **Nie trzymaj haseł w plikach commitowanych do gita** — wyłącznie w `api/.env`.
- Rób regularne kopie zapasowe (eksport z phpMyAdmin).
