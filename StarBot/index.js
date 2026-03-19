console.log('[DEBUG] StarBot/index.js - Starting to load...');
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
console.log('[DEBUG] Loaded discord.js');
const config = require('./config/config');
console.log('[DEBUG] Loaded config');
const { createBotLogger } = require('../utils/consoleLogger');
console.log('[DEBUG] Loaded consoleLogger');
const { handleInteraction } = require('./handlers/interactionHandlers');
console.log('[DEBUG] Loaded interactionHandlers');
const commands = require('./commands');
console.log('[DEBUG] Loaded commands');

// Services
console.log('[DEBUG] Loading services...');
const NotificationManager = require('./services/notificationManager');
console.log('[DEBUG] Loaded NotificationManager');
const BoardManager = require('./services/boardManager');
console.log('[DEBUG] Loaded BoardManager');
const Scheduler = require('./services/scheduler');
console.log('[DEBUG] Loaded Scheduler');

console.log('[DEBUG] Creating logger...');
const logger = createBotLogger('StarBot');
console.log('[DEBUG] Logger created');

// Validate configuration
console.log('[DEBUG] Validating config...');
if (!config.token) {
    console.log('[ERROR] STARBOT_TOKEN is not set in .env file');
    logger.error('STARBOT_TOKEN is not set in .env file');
    process.exit(1);
}

if (!config.notificationsBoardChannelId) {
    console.log('[ERROR] STARBOT_NOTIFICATIONS_BOARD_CHANNEL is not set in .env file');
    logger.error('STARBOT_NOTIFICATIONS_BOARD_CHANNEL is not set in .env file');
    process.exit(1);
}
console.log('[DEBUG] Config validated');

console.log('[DEBUG] Creating Discord client...');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});
console.log('[DEBUG] Discord client created');

// Initialize services
const notificationManager = new NotificationManager(config, logger);
const boardManager = new BoardManager(client, config, logger, notificationManager);
const scheduler = new Scheduler(client, config, logger, notificationManager, boardManager);

// User states for multi-step interactions
const userStates = new Map();

// Shared state
const sharedState = {
    client,
    config,
    logger,
    notificationManager,
    boardManager,
    scheduler,
    userStates
};

// Register slash commands
async function registerCommands() {
    try {
        logger.info('Registering slash commands...');

        const rest = new REST().setToken(config.token);
        const data = await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands }
        );

        logger.success(`Successfully registered ${data.length} slash commands`);
    } catch (error) {
        logger.error('Failed to register commands:', error);
        throw error;
    }
}

// Event: Bot ready
client.once('ready', async () => {
    logger.success(`✅ StarBot ready - logged in as ${client.user.tag}`);
    logger.info(`Servers: ${client.guilds.cache.size}`);
    logger.info(`Users: ${client.users.cache.size}`);

    // Register commands
    try {
        await registerCommands();
    } catch (error) {
        logger.error('Command registration failed - bot will continue without commands');
    }

    // Initialize services
    try {
        await notificationManager.initialize();
        await boardManager.initialize();
        scheduler.initialize();

        logger.success('All services initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize services:', error);
        process.exit(1);
    }
});

// Event: Interactions (slash commands, buttons, select menus)
client.on('interactionCreate', async interaction => {
    await handleInteraction(interaction, sharedState);
});

// Event: Errors
client.on('error', error => {
    logger.error('Discord Client Error:', error);
});

// Graceful shutdown
async function shutdown() {
    logger.info('Shutting down StarBot...');

    // Stop services
    scheduler.stop();
    boardManager.stopPeriodicUpdates();

    // Destroy client
    await client.destroy();

    logger.success('StarBot shut down successfully');
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Login
client.login(config.token).catch(error => {
    logger.error('Login error:', error);
    process.exit(1);
});
