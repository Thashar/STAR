# CLAUDE.md - Dokumentacja Projektu STAR

**INSTRUKCJA WAŻNA: ZAWSZE PISZ PO POLSKU. Odpowiadaj na każdą konwersację w języku polskim, niezależnie od języka zapytania użytkownika.**

**INSTRUKCJA COMMITOWANIA ZMIAN:**
- Po zakończeniu wprowadzania zmian w kodzie ZAWSZE commituj i pushuj BEZ PYTANIA
- W commitach używaj krótkiego opisu zmian PO POLSKU
- Format commit message: Krótki opis zmian po polsku (bez dodatkowych linii)
- Przykład: "Dodano system rankingów do StarBot"
- NIGDY nie pytaj użytkownika czy zacommitować - po prostu to zrób

**⚠️ INSTRUKCJA AKTUALIZACJI DOKUMENTACJI:**
- Po każdej zmianie w funkcjonalności bota ZAWSZE aktualizuj odpowiedni plik CLAUDE.md
- Główny CLAUDE.md - dla zmian w infrastrukturze projektu
- StarBot/CLAUDE.md - dla zmian w funkcjonalności StarBot
- Używaj Grep + Read z offset/limit + Edit - NIE czytaj całego pliku
- NIE twórz "Historii Zmian" - aktualizuj bezpośrednio opisy funkcjonalności

**Ostatnia aktualizacja:** Marzec 2026

---

## 📋 Przegląd Projektu

Projekt STAR to system botów Discord zbudowany na podobnej architekturze co Polski Squad. System został zaprojektowany z myślą o skalowalności i łatwości dodawania nowych botów.

### Lista Botów

1. **StarBot** - Główny bot projektu STAR

---

## 🏗️ Architektura Systemu

### Struktura Projektu

```
STAR/
├── utils/
│   └── consoleLogger.js       # Centralny system logowania
├── logs/                       # Logi (dzienna rotacja, auto-usuwanie po 30 dniach)
├── StarBot/                    # Pierwszy bot
│   ├── config/
│   │   ├── config.js          # Konfiguracja bota
│   │   └── messages.js        # Wiadomości i komunikaty
│   ├── handlers/
│   │   └── interactionHandlers.js  # Obsługa interakcji (slash commands, buttony)
│   ├── data/                  # Dane persistentne (JSON)
│   ├── temp/                  # Pliki tymczasowe
│   └── index.js               # Główny plik bota
├── index.js                   # Launcher orchestrujący wszystkie boty
├── package.json               # Zależności projektu
├── bot-config.json            # Konfiguracja środowisk (production/development)
├── .env                       # Zmienne środowiskowe (NIE commitować!)
├── .env.example               # Przykładowe zmienne środowiskowe
├── .gitignore                 # Ignorowane pliki
├── CLAUDE.md                  # Ten plik - dokumentacja projektu
└── README.md                  # Podstawowe info o projekcie
```

### Wzorzec Architektury Botów

Każdy bot w projekcie STAR stosuje jednolitą strukturę:

```javascript
// BotName/index.js - Główny plik bota
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config/config');
const { createBotLogger } = require('../utils/consoleLogger');

const logger = createBotLogger('BotName');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Globalny stan współdzielony
const sharedState = {
    client,
    config,
    logger
};

client.once('ready', async () => {
    logger.success('✅ BotName gotowy - [kluczowe funkcje]');
});

client.on('interactionCreate', async interaction => {
    await handleInteraction(interaction, sharedState);
});

client.login(config.token);
```

---

## 🔧 System Logowania

**Plik:** `utils/consoleLogger.js`

### Zasady Użycia

**ZAWSZE używaj centralnego systemu logowania. NIGDY nie używaj `console.log()` bezpośrednio.**

```javascript
// Na górze każdego pliku który potrzebuje logowania
const { createBotLogger } = require('../utils/consoleLogger');
const logger = createBotLogger('BotName');

// Następnie używaj metod loggera
logger.info('Wiadomość informacyjna');
logger.error('Wiadomość błędu');
logger.warn('Ostrzeżenie');
logger.success('Sukces');
```

### Funkcje Systemu Logowania

- 🎨 **Kolorowe wyjście** - Każdy bot ma własny kolor (StarBot: żółty ⭐)
- 📝 **Wiele miejsc docelowych**:
  - Konsola z kolorowaniem
  - Plik `logs/bots-YYYY-MM-DD.log` (dzienna rotacja, auto-usuwanie po 30 dniach)
  - Discord webhook (opcjonalne, rate-limited)
- 🔍 **Inteligentne separatory** - Wizualne separatory przy przełączaniu między botami

---

## 🚀 Uruchamianie Botów

### Komendy NPM

```bash
# Produkcja - wszystkie boty z bot-config.json["production"]
npm start
npm run dev

# Development - boty z bot-config.json["development"]
npm run local

# Pojedynczy bot
npm run starbot
```

### Konfiguracja Środowisk

**Plik:** `bot-config.json`

```json
{
  "production": ["starbot"],
  "development": ["starbot"]
}
```

---

## 🔐 Zmienne Środowiskowe

**Plik:** `.env` (NIE commitować! Wzór w `.env.example`)

```env
# ===== STARBOT =====
STARBOT_TOKEN=bot_token_here
STARBOT_CLIENT_ID=client_id
STARBOT_GUILD_ID=guild_id

# ===== DISCORD WEBHOOK (OPCJONALNE) =====
DISCORD_LOG_WEBHOOK_URL=webhook_url_here
```

---

## 📚 Najlepsze Praktyki

1. **Logowanie** - `utils/consoleLogger.js` - createBotLogger('BotName'), NIGDY console.log
   - Dostępne metody: `logger.info()`, `logger.error()`, `logger.warn()`, `logger.success()`

2. **Błędy** - try/catch z logger.error, ephemeral feedback do użytkownika

3. **Konfiguracja** - Wrażliwe w `.env`, walidacja przy starcie, `config/config.js`

4. **Persistencja** - `fs.promises`, `JSON.stringify(data, null, 2)` dla czytelności

5. **Graceful Shutdown** - SIGINT/SIGTERM handler, client.destroy()

---

## 🐛 Rozwiązywanie Problemów

**Start:** Sprawdź `logs/bots-YYYY-MM-DD.log`, zmienne środowiskowe, uprawnienia Discord

**Logi:** Wszystkie logi w jednym pliku z timestampami i nazwami botów

**Błędy:** Pełny stack trace w logach, ephemeral wiadomości dla użytkowników

---

## 📖 Szczegółowa Dokumentacja Botów

**StarBot:** [StarBot/CLAUDE.md](StarBot/CLAUDE.md) - Szczegółowa dokumentacja funkcjonalności StarBot

---

## 🔄 Dodawanie Nowego Bota

1. Skopiuj strukturę StarBot/ do NewBot/
2. Zaktualizuj config/config.js z nowymi zmiennymi środowiskowymi
3. Dodaj zmienne do .env i .env.example
4. Dodaj bot do bot-config.json
5. Dodaj kolor i emoji do utils/consoleLogger.js (sekcje botColors i botEmojis)
6. Dodaj skrypt do package.json
7. Stwórz NewBot/CLAUDE.md z dokumentacją

---

## 🎯 Podsumowanie

Projekt STAR wykorzystuje sprawdzoną architekturę z Polski Squad:
- ✅ Modularny system botów
- ✅ Centralny system logowania
- ✅ Łatwe dodawanie nowych botów
- ✅ Konfiguracja per środowisko
- ✅ Automatyczne zarządzanie logami
