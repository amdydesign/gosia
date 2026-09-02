# Panel Gosi 3.0 — co się zmieniło i co proponujemy dalej

Dokument dla właścicielki panelu. Pierwsza część opisuje, co zostało **wdrożone w tej przebudowie**.
Druga to **propozycje na kolejne etapy** — do decyzji, co jest warte wdrożenia.

---

## 1. Co zostało wdrożone

### Wygląd i nawigacja (nowe UI)
- **Jeden spójny system designu**: paleta różu/mauve (`primary`), ciepłe neutralne tła, jedna rodzina kart, przycisków, odznak i pól formularzy. Zniknęły mieszane fiolety/zielenie/teal.
- **Górny pasek** z tytułem strony, strzałką „wstecz” na podstronach, dzwonkiem powiadomień i wejściem do ustawień. Na telefonie zamiast pustego nagłówka.
- **Dolna nawigacja** (5 zakładek) + **przycisk „+”** na listach — na współpracach dodaje współpracę, na zakupach zakup, na pomysłach pomysł; na Starcie otwiera wybór.
- **Ustawienia w jednym miejscu** (kliknięcie w awatar): powiadomienia push z opisem, eksport CSV, zmiana hasła, wylogowanie.
- **Naprawiony układ desktop**: treść nie wjeżdża pod boczne menu na węższych laptopach.
- **Toasty** zamiast systemowych `alert()`; **ładne okna potwierdzeń** zamiast `confirm()`; szkielety ładowania zamiast napisu „Ładowanie…”.
- Statystyki ładują się osobno (wykresy ważą 170 KB) — główna aplikacja startuje szybciej.

### Start (dashboard)
- Powitanie + data, **„Ten miesiąc”** (nowe), rok, „Do zapłaty”.
- Sekcja **„Wymaga uwagi”**: zwroty ≤ 3 dni i zaległe płatności z akcjami **jednym kliknięciem** („Zwrócone”, „Opłacone”).
- Lista **„Czekają na płatność”** z liczbą dni oczekiwania (po 30 dniach na czerwono) i szybkim „opłacone” z możliwością **cofnięcia** z toasta.
- **„Najbliższe zwroty”** z paskiem postępu terminu.
- Kafelek **„Do nagrania”** — ostatni pomysł z bezpośrednim wejściem do promptera.

### Współprace
- **Wyszukiwarka** (marka, typ, notatka), filtry Wszystkie / Do zapłaty / Opłacone z licznikami, chipsy **lat**.
- **Grupowanie po miesiącach** z sumą miesiąca; pasek podsumowania (liczba, brutto, na rękę).
- W wierszu: czytelna etykieta typu (zamiast `post-instagram`), forma rozliczenia (UoD 50%, Use.me…), ikona „poza PIT”.
- **Szybkie „opłacone”** bez wchodzenia w edycję.
- **Jeden formularz** dodawania/edycji (wcześniej dwa rozjeżdżające się pliki): podpowiedzi marek z historii, kwota z „zł”, czytelna rozpiska „na rękę”, koszt zespołu i „zostaje Ci ok. X”.
- Widok współpracy: duże „Na rękę”, rozpiska podatkowa na życzenie, **Duplikuj** (powtarzalne współprace z tą samą marką), status płatności z akcją i cofnięciem.
- **Naprawiony błąd backendu**: przy dodawaniu współpracy nie zapisywał się typ rozliczenia i flaga PIT (wszystko lądowało jako „umowa 50%, oficjalne” — dotyczyło też gotówki!).

### Zakupy i zwroty
- Filtry **Do decyzji / Zostawione / Zwrócone / Wszystkie** (wcześniej rzeczy po terminie mieszały się z aktywnymi).
- Kafelki „Do decyzji: X zł” i „Odzyskane: Y zł”.
- **Zwrot jednym kliknięciem** (arkusz z kwotą: całość / połowa / bez zwrotu pieniędzy → status zwrócone/częściowy).
- Formularz: podpowiedzi sklepów, presety dni na zwrot (14/30/60/100), **podgląd daty „zwrot do…”**.
- Widok zakupu: pasek terminu, duży przycisk „Zrobiłam zwrot”, cofnięcie zwrotu, link do produktu.
- Załączniki: **kilka plików naraz** i **zdjęcie z aparatu** na telefonie (paragon).
- **Naprawiony limit**: lista zakupów ucinała się na 50 pozycjach.

### Pomysły na rolki
- Wyszukiwarka, filtry, **szacowany czas mówienia** (~2,3 słowa/s) i podpowiedź długości („dobra długość na rolkę”).
- Oznaczanie „nagrane” z listy, przycisk promptera bezpośrednio z karty.
- **Nowy prompter**: auto-przewijanie z regulacją prędkości, odliczanie 3-2-1, tap = start/pauza, rozmiar czcionki (zapamiętywany), **tryb lustrzany** (do szkła teleprompterowego), linia czytania, skróty klawiszowe.
- Kopiowanie scenariusza do schowka (np. do opisu posta).

### Statystyki
- **Naprawiony pasek progu podatkowego** (wcześniej zawsze 0%). Teraz liczy dochód (przychód − KUP − prowizja) z opłaconych oficjalnych współprac.
- Karta PIT pokazuje osobno: przychód brutto, dochód po KUP, na rękę, ile zostało do II progu.
- Wykres **6 / 12 / 24 miesiące**, suma, średnia, najlepszy miesiąc; tooltip z brutto i liczbą współprac.
- **Najlepsi klienci** (top 5 marek w roku).
- Social: ręczna edycja liczb pod ikoną ołówka, „stan z …”, połączenie YouTube przez okno zamiast `prompt()`.

### Backend (bez zmian w bazie — nie trzeba uruchamiać migracji)
- `stats/dashboard.php`: dane miesiąca, lista nieopłaconych, licznik zaległych, wartości „do decyzji”, pomysły do nagrania, progres progu.
- `stats/monthly.php`: parametr `months`, top marki, poprawka miesięcy przy dacie 29–31.
- `collaborations/create.php`: zapis `collab_type` i `fiscal_tracking`.
- `purchases/index.php`: limit 1000 zamiast 50.
- Cron przypomnień obejmuje zakupy ze statusem „częściowy zwrot”.

### Wdrożenie
- `cd frontend && npm run deploy` — buduje i kopiuje build do katalogu głównego (index.html, assets/, sw.js, manifest.json, icons/). Potem `git push`, a na serwerze `git pull`.
- Service worker ma nowy cache (`gosia-v3`) — stara wersja aplikacji zostanie automatycznie zastąpiona.

---

## 2. Propozycje na kolejne etapy (do decyzji)

### Szybkie wygrane (1–2 dni pracy)
1. **Automatyczne „zaległe”** — pole „termin płatności” przy współpracy (np. 14/30 dni od daty); status „zaległa” ustawia się sam, a push przychodzi dzień po terminie. Dziś Gosia musi sama zmienić status.
2. **Przypomnienie o publikacji** — data publikacji materiału (post/rolka) osobno od daty współpracy + push „jutro publikacja dla X”.
3. **Miesięczne podsumowanie push** (1. dnia miesiąca): „W sierpniu zarobiłaś X na rękę, Y czeka na płatność, Z zwrotów kończy się w tym tygodniu”.
4. **Faktura / numer umowy** jako pole przy współpracy + oznaczenie „faktura wystawiona” (dla rozliczeń z księgową).
5. **Tryb ciemny** — prompter jest już ciemny; reszta aplikacji może przełączać się wg ustawienia telefonu.

### Średnie (3–5 dni)
6. **Kalendarz** — widok miesiąca z publikacjami, eventami i terminami zwrotów; eksport do Google Calendar (plik .ics).
7. **Kontrahenci (marki)** — karta marki: historia współprac, łączna kwota, osoba kontaktowa, e-mail, stawki. Dziś marka to tylko tekst.
8. **Stawki i cennik** — szablony współprac („Reel: 4500 brutto, UoD 50%”) do wyboru w formularzu; podpowiedź średniej stawki dla marki z historii.
9. **Zestawienie roczne PDF dla księgowej** — jeden przycisk generujący czytelny raport (oficjalne współprace, sumy, PIT-11 od Use.me itd.) zamiast CSV.
10. **Garderoba** — zakupy „zostawione” tworzą listę rzeczy z tagami (kolor, kategoria) i zdjęciem; przydatne przy planowaniu stylizacji i rolek.

### Większe
11. **Planer treści** — pomysły dostają datę publikacji i platformę; tablica tygodniowa (do nagrania → nagrane → opublikowane) i statystyki „ile rolek w miesiącu”.
12. **Statystyki social z historii** — wykres wzrostu obserwujących (dane już są zbierane codziennie w tabeli `social_stats`), przyrost tygodniowy/miesięczny.
13. **Udostępnianie widoku księgowej** — link tylko do odczytu z listą oficjalnych współprac i załącznikami (faktury).
14. **Import z banku** (CSV) — dopasowanie wpłat do współprac i automatyczne „opłacone”.

### Porządki techniczne (wpływają na bezpieczeństwo i stabilność)
- Otwarty PR „Plan przebudowy + Fazy 0–4” zawiera ważne łatki bezpieczeństwa backendu (rate-limit logowania, walidacja OAuth, szyfrowanie tokenów). Warto go zmergować **po** tej przebudowie i rozwiązać konflikty w frontendzie na korzyść nowego UI.
- Stawki podatkowe (KUP, 12%, prowizja Use.me 7,8% / min 29 zł, ZUS) są zaszyte w kodzie — do weryfikacji z księgową raz w roku.
