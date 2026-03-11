const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config/config');
const { createBotLogger } = require('../utils/consoleLogger');
const { handleInteraction } = require('./handlers/interactionHandlers');

const logger = createBotLogger('StarBot');

// Walidacja konfiguracji
if (!config.token) {
    logger.error('STARBOT_TOKEN nie jest ustawiony w pliku .env');
    process.exit(1);
}

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

// Event: Bot gotowy
client.once('ready', async () => {
    logger.success(`✅ StarBot gotowy - zalogowany jako ${client.user.tag}`);
    logger.info(`Serwery: ${client.guilds.cache.size}`);
    logger.info(`Użytkownicy: ${client.users.cache.size}`);
});

// Event: Interakcje (slash commands, buttony, select menu)
client.on('interactionCreate', async interaction => {
    await handleInteraction(interaction, sharedState);
});

// Event: Błędy
client.on('error', error => {
    logger.error('Discord Client Error:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Otrzymano SIGINT - zamykanie bota...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Otrzymano SIGTERM - zamykanie bota...');
    await client.destroy();
    process.exit(0);
});

// Logowanie
client.login(config.token).catch(error => {
    logger.error('Błąd logowania:', error);
    process.exit(1);
});
