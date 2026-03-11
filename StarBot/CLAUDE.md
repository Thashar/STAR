# StarBot - Dokumentacja

**Bot:** StarBot ⭐
**Kolor logowania:** Żółty
**Ostatnia aktualizacja:** Marzec 2026

---

## 📋 Przegląd

StarBot to główny bot projektu STAR. Obecnie w fazie inicjalizacji - funkcjonalność zostanie dodana w następnych krokach.

---

## 🏗️ Struktura

```
StarBot/
├── config/
│   ├── config.js          # Konfiguracja bota (token, guild ID, itp.)
│   └── messages.js        # Wiadomości i komunikaty
├── handlers/
│   └── interactionHandlers.js  # Obsługa interakcji (slash commands, buttony, select menu)
├── data/                  # Dane persistentne (JSON) - do przyszłego użycia
├── temp/                  # Pliki tymczasowe
└── index.js               # Główny plik bota
```

---

## 🔐 Zmienne Środowiskowe

```env
STARBOT_TOKEN=bot_token_here
STARBOT_CLIENT_ID=client_id
STARBOT_GUILD_ID=guild_id
```

---

## 🎯 Obecna Funkcjonalność

### Podstawowe Komendy

- `/ping` - Test połączenia z botem

---

## 📝 Planowane Funkcjonalności

_Funkcjonalności zostaną dodane zgodnie z wymaganiami użytkownika._

---

## 🔧 Konfiguracja

### Dodawanie Nowych Komend Slash

1. Dodaj obsługę w `handlers/interactionHandlers.js` w funkcji `handleSlashCommand()`
2. Zarejestruj komendę używając Discord Developer Portal lub deploy script

### Dodawanie Buttonów

1. Dodaj obsługę w `handlers/interactionHandlers.js` w funkcji `handleButton()`
2. Używaj unikalnych `customId` dla każdego buttona

### Dodawanie Select Menu

1. Dodaj obsługę w `handlers/interactionHandlers.js` w funkcji `handleSelectMenu()`
2. Używaj unikalnych `customId` dla każdego select menu

---

## 📊 Logowanie

StarBot używa centralnego systemu logowania:

```javascript
const { createBotLogger } = require('../utils/consoleLogger');
const logger = createBotLogger('StarBot');

logger.info('Informacja');
logger.error('Błąd');
logger.warn('Ostrzeżenie');
logger.success('Sukces');
```

---

## 🐛 Rozwiązywanie Problemów

**Bot nie startuje:**
- Sprawdź czy `STARBOT_TOKEN` jest ustawiony w `.env`
- Sprawdź logi w `logs/bots-YYYY-MM-DD.log`

**Komendy nie działają:**
- Upewnij się że komendy są zarejestrowane na serwerze Discord
- Sprawdź uprawnienia bota

---

## 🔄 Proces Dodawania Nowej Funkcjonalności

1. Dodaj kod implementujący funkcjonalność
2. Zaktualizuj ten plik (StarBot/CLAUDE.md) z opisem nowej funkcjonalności
3. Dodaj odpowiednie zmienne do `.env.example` jeśli potrzebne
4. Przetestuj funkcjonalność
5. Commituj i pushuj zmiany
