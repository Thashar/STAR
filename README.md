# STAR - System Botów Discord

Projekt STAR to modularny system botów Discord zbudowany na sprawdzonej architekturze z Polski Squad.

## 🚀 Szybki Start

1. **Instalacja zależności:**
   ```bash
   npm install
   ```

2. **Konfiguracja:**
   - Skopiuj `.env.example` do `.env`
   - Wypełnij zmienne środowiskowe (tokeny botów, ID serwera, itp.)

3. **Uruchomienie:**
   ```bash
   npm start          # Produkcja
   npm run local      # Development
   npm run starbot    # Tylko StarBot
   ```

## 📚 Dokumentacja

- **[CLAUDE.md](CLAUDE.md)** - Pełna dokumentacja projektu dla Claude Code
- **[StarBot/CLAUDE.md](StarBot/CLAUDE.md)** - Dokumentacja StarBot

## 🏗️ Architektura

- **Centralny system logowania** - `utils/consoleLogger.js`
- **Modularność** - Łatwe dodawanie nowych botów
- **Konfiguracja środowisk** - `bot-config.json` (production/development)
- **Automatyczne zarządzanie logami** - Dzienna rotacja, auto-usuwanie po 30 dniach

## 📋 Lista Botów

1. **StarBot** ⭐ - Główny bot projektu STAR

## 🔧 Dodawanie Nowego Bota

Szczegółowe instrukcje w [CLAUDE.md](CLAUDE.md) - sekcja "Dodawanie Nowego Bota"

## 📝 Licencja

ISC