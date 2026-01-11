# API Tester - ToDo Application

Narzedzie do automatycznego testowania API ToDo. Wykonuje testy podstawowe, happy path, bezpieczenstwa OWASP oraz walidacji schematow odpowiedzi.

## Wymagania

- Dzialajace API ToDo (Mock API lub Backend Supabase)
- Plik konfiguracyjny YAML z danymi uzytkownikow

## Instalacja

### Gotowe binaria

Pobierz odpowiednia wersje:
- **Windows**: `api-tester-windows.exe`
- **macOS (Apple Silicon)**: `api-tester-macos-arm64`

### Kompilacja ze zrodel

Wymagany Go 1.21+:

```bash
# macOS / Linux
go build -o api-tester .

# Windows
go build -o api-tester.exe .

# Cross-compile dla Windows z Mac/Linux
GOOS=windows GOARCH=amd64 go build -o api-tester-windows.exe .

# Cross-compile dla Mac Apple Silicon
GOOS=darwin GOARCH=arm64 go build -o api-tester-macos-arm64 .
```

## Konfiguracja

Utworz plik `config.yaml`:

```yaml
# Konfiguracja API Tester
api:
  url: "http://localhost:3062"
  timeout: 30s

# Uzytkownicy do testow (min. 2 zwyklych + 1 admin)
users:
  - email: "user1@example.com"
    password: "User1Pass123!"
    role: "user"
  - email: "user2@example.com"
    password: "User2Pass123!"
    role: "user"
  - email: "admin@example.com"
    password: "AdminPass123!"
    role: "admin"

# Raport
report:
  output: "raport.txt"
  verbose: false
```

**Wazne:** Uzytkownicy musza istniec w bazie danych API przed uruchomieniem testow.

## Uruchomienie

### Windows (PowerShell / CMD)

```powershell
# Wszystkie testy
.\api-tester-windows.exe --config config.yaml --all

# Tylko testy podstawowe
.\api-tester-windows.exe --config config.yaml --basic

# Tylko testy happy path
.\api-tester-windows.exe --config config.yaml --happy-path

# Tylko testy OWASP
.\api-tester-windows.exe --config config.yaml --owasp

# Tylko testy schematow
.\api-tester-windows.exe --config config.yaml --schema

# Tryb szczegolowy
.\api-tester-windows.exe --config config.yaml --all --verbose
```

### macOS (Terminal)

```bash
# Nadaj uprawnienia do uruchamiania (tylko raz)
chmod +x api-tester-macos-arm64

# Wszystkie testy
./api-tester-macos-arm64 --config config.yaml --all

# Tylko testy podstawowe
./api-tester-macos-arm64 --config config.yaml --basic

# Tylko testy happy path
./api-tester-macos-arm64 --config config.yaml --happy-path

# Tylko testy OWASP
./api-tester-macos-arm64 --config config.yaml --owasp

# Tylko testy schematow
./api-tester-macos-arm64 --config config.yaml --schema

# Tryb szczegolowy
./api-tester-macos-arm64 --config config.yaml --all --verbose
```

### Wyswietlenie pomocy

```bash
# Bez argumentow - wyswietla przykladowy config
./api-tester-macos-arm64

# lub
./api-tester-macos-arm64 --config
```

## Kategorie testow

| Flaga | Opis | Liczba testow |
|-------|------|---------------|
| `--basic` | Testy podstawowe (polaczenie, health, autoryzacja) | ~8 |
| `--happy-path` | Testy sciezki sukcesu z izolacja uzytkownikow | ~15 |
| `--owasp` | Testy bezpieczenstwa OWASP (SQL injection, XSS, etc.) | ~35 |
| `--schema` | Testy walidacji schematow odpowiedzi JSON | ~7 |
| `--all` | Wszystkie powyzsze kategorie | ~66 |

## Testy schematow

Testy schematow waliduja pelna strukture odpowiedzi JSON:

| Endpoint | Walidowane pola |
|----------|-----------------|
| `GET /health` | status, validationMode, timestamp (ISO format) |
| `POST /auth/login` | token (JWT), user.id (UUID), user.email, user.role |
| `POST /auth/register` | user.id (UUID), user.email, user.role |
| `POST /tasks` | id (UUID), title, completed, user_id (UUID), created_at |
| `GET /tasks` | tablica taskow z pelnym schematem |
| `PATCH /tasks/:id` | zaktualizowany task z pelnym schematem |
| `GET /admin/users` | tablica uzytkownikow z id, email, role, created_at |

## Raport

Po zakonczeniu testow generowany jest raport tekstowy (domyslnie `raport.txt`):

```
========================================
 RAPORT TESTOW API
========================================
 URL: http://localhost:3062
 Data: 2025-12-21 10:30:00
========================================

[OK] [BASIC] Test polaczenia z serwerem (3ms)
[OK] [BASIC] Test endpointu /health (1ms)
...
[FAIL] [OWASP] Brute-force: 10 prob w 0.5s
  Request: POST /auth/login (10x)
  Oczekiwano: 429 Too Many Requests
  Otrzymano: 200 OK (wszystkie proby)
  Problem: Brak ochrony przed brute-force
  Rekomendacja: Zaimplementuj rate limiting
  Severity: HIGH
...

========================================
 PODSUMOWANIE
========================================
 Testy wykonane: 66
 Sukces: 63 (95%)
 Bledy: 3 (5%)
========================================
```

## Typowe problemy

### "connection refused"
API nie jest uruchomione. Sprawdz czy serwer dziala na podanym porcie.

### "401 Unauthorized" w happy-path
Uzytkownicy z config.yaml nie istnieja w bazie. Zarejestruj ich przez API.

### Testy OWASP nieudane
Niektore testy OWASP (rate-limiting, brute-force) wymagaja implementacji po stronie API. Ich niepowodzenie oznacza brak zabezpieczenia.

## Struktura projektu

```
api-tester/
├── main.go                    # Entry point
├── config.yaml                # Konfiguracja (przyklad)
├── README.md                  # Ta dokumentacja
├── internal/
│   ├── client/
│   │   └── http.go            # Klient HTTP
│   ├── config/
│   │   └── config.go          # Parsowanie YAML
│   ├── report/
│   │   └── reporter.go        # Generator raportow
│   └── tests/
│       ├── basic.go           # Testy podstawowe
│       ├── happy_path.go      # Testy happy path
│       ├── owasp.go           # Testy OWASP
│       └── schema.go          # Testy schematow
└── go.mod                     # Zaleznosci Go
```

## Licencja

Projekt edukacyjny - WSB 2025
