# STAR - Discord Bots System

**LANGUAGE CONVENTION:**
- **Conversations with user:** ALWAYS in POLISH
- **Bot code, comments, logs, and bot messages:** ALWAYS in ENGLISH
- **This documentation file (CLAUDE.md):** Can be in Polish or English as needed

**COMMIT INSTRUCTIONS:**
- After making changes, ALWAYS commit and push WITHOUT ASKING
- Use short commit messages in English
- Format: Short description of changes
- Example: "Added notification system to StarBot"
- NEVER ask the user whether to commit - just do it

**Last Updated:** March 2026

---

## 📋 Project Overview

STAR is a modular Discord bot system with centralized logging and easy bot management.

### Current Bots

1. **StarBot** ⭐ - Comprehensive notifications management system

---

## 🏗️ Architecture

### Project Structure

```
STAR/
├── utils/
│   └── consoleLogger.js       # Centralized logging system
├── logs/                       # Logs (daily rotation, auto-delete after 30 days)
├── StarBot/                    # First bot
│   ├── config/
│   │   ├── config.js          # Bot configuration
│   │   └── messages.js        # Messages (English)
│   ├── handlers/
│   │   └── interactionHandlers.js  # Interaction handling
│   ├── services/
│   │   ├── notificationManager.js  # Notification CRUD
│   │   ├── boardManager.js         # Board embeds management
│   │   └── scheduler.js            # Notification triggering
│   ├── data/                  # Persistent data (JSON)
│   ├── commands.js            # Slash command definitions
│   ├── deploy-commands.js     # Command deployment script
│   └── index.js               # Main bot file
├── index.js                   # Launcher orchestrating all bots
├── package.json               # Project dependencies
├── bot-config.json            # Environment configuration (production/development)
├── .env                       # Environment variables (DO NOT COMMIT!)
├── .env.example               # Example environment variables
├── .gitignore                 # Ignored files
├── CLAUDE.md                  # This file - project documentation
├── update.js                  # Auto-update script (git pull)
└── README.md                  # Basic project info
```

---

## 🚀 Quick Start

### 1. Installation

```bash
npm install
```

### 2. Configuration

Copy `.env.example` to `.env` and fill in:
```env
STARBOT_TOKEN=bot_token_here
STARBOT_CLIENT_ID=client_id
STARBOT_GUILD_ID=guild_id
STARBOT_NOTIFICATIONS_BOARD_CHANNEL=channel_id
```

### 3. Run

```bash
# Production - all bots from bot-config.json["production"]
npm start
npm run dev

# Development - bots from bot-config.json["development"]
npm run local

# Single bot
npm run starbot

# Update from GitHub
npm run update
```

---

## 🔧 Centralized Logging System

**File:** `utils/consoleLogger.js`

### Usage Rules

**ALWAYS use centralized logging. NEVER use `console.log()` directly.**

```javascript
// At the top of each file that needs logging
const { createBotLogger } = require('../utils/consoleLogger');
const logger = createBotLogger('BotName');

// Then use logger methods
logger.info('Information message');
logger.error('Error message');
logger.warn('Warning');
logger.success('Success');
```

### Features

- 🎨 **Colored output** - Each bot has its own color (StarBot: yellow ⭐)
- 📝 **Multiple destinations**:
  - Console with coloring
  - File `logs/bots-YYYY-MM-DD.log` (daily rotation, auto-delete after 30 days)
  - Discord webhook (optional, rate-limited)
- 🔍 **Smart separators** - Visual separators when switching between bots

---

## 📚 Bot Documentation

**StarBot:** [StarBot/CLAUDE.md](StarBot/CLAUDE.md) - Comprehensive notifications management system with one-time/recurring reminders, event notifications, live notifications board with Discord timestamps, and auto-updating embeds

---

## 🔄 Adding New Bot

1. Copy StarBot/ structure to NewBot/
2. Update config/config.js with new environment variables
3. Add variables to .env and .env.example
4. Add bot to bot-config.json
5. Add color and emoji to utils/consoleLogger.js (botColors and botEmojis sections)
6. Add script to package.json
7. Create NewBot/CLAUDE.md with documentation

---

## 📦 Auto-Update System

**File:** `update.js` - Standalone script for updating repository from GitHub

### Usage

```bash
npm run update
# or
node update.js
```

### What it does

1. Executes `git pull origin main`
2. Shows changes
3. Only updates tracked files (won't touch .env, data/, node_modules, logs/)

---

## 🔐 Environment Variables

```env
# ===== STARBOT =====
STARBOT_TOKEN=bot_token_here
STARBOT_CLIENT_ID=client_id
STARBOT_GUILD_ID=guild_id
STARBOT_NOTIFICATIONS_BOARD_CHANNEL=channel_id

# ===== DISCORD WEBHOOK (OPTIONAL) =====
DISCORD_LOG_WEBHOOK_URL=webhook_url_here
```

---

## 💡 Best Practices

1. **Logging** - `utils/consoleLogger.js` - createBotLogger('BotName'), NEVER console.log
   - Available methods: `logger.info()`, `logger.error()`, `logger.warn()`, `logger.success()`

2. **Errors** - try/catch with logger.error, ephemeral feedback to user

3. **Configuration** - Sensitive data in `.env`, validation at startup, `config/config.js`

4. **Persistence** - `fs.promises`, `JSON.stringify(data, null, 2)` for readability

5. **Graceful Shutdown** - SIGINT/SIGTERM handler, client.destroy()

---

## 🐛 Troubleshooting

**Start:** Check `logs/bots-YYYY-MM-DD.log`, environment variables, Discord permissions

**Logs:** All logs in one file with timestamps and bot names

**Errors:** Full stack trace in logs, ephemeral messages for users

---

## 🎯 Summary

STAR uses proven architecture:
- ✅ Modular bot system
- ✅ Centralized logging
- ✅ Easy bot addition
- ✅ Per-environment configuration
- ✅ Automatic log management
- ✅ Auto-update script
- ✅ Slash commands auto-registration on bot startup
