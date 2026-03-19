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
console.log('[DEBUG] Creating service instances...');
const notificationManager = new NotificationManager(config, logger);
console.log('[DEBUG] NotificationManager instance created');
const boardManager = new BoardManager(client, config, logger, notificationManager);
console.log('[DEBUG] BoardManager instance created');
const scheduler = new Scheduler(client, config, logger, notificationManager, boardManager);
console.log('[DEBUG] Scheduler instance created');

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
console.log('[DEBUG] Shared state created');

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
console.log('[DEBUG] Setting up event handlers...');
client.on('interactionCreate', async interaction => {
    await handleInteraction(interaction, sharedState);
});

// Event: Errors
client.on('error', error => {
    logger.error('Discord Client Error:', error);
});
console.log('[DEBUG] Event handlers set up');

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

// Test network connectivity first
console.log('[DEBUG] Testing network connectivity...');
const https = require('https');

https.get('https://discord.com/api/v10/gateway', (res) => {
    console.log('[DEBUG] ✅ Network OK - Discord API reachable (status:', res.statusCode, ')');

    // Login after network test succeeds
    console.log('[DEBUG] Attempting to login...');
    console.log('[DEBUG] Token length:', config.token ? config.token.length : 'undefined');

    // Set timeout to detect if login hangs
    setTimeout(() => {
        console.log('[WARNING] Login timeout - no response after 30 seconds');
        console.log('[WARNING] Network is OK but login failed - check bot token in Developer Portal');
    }, 30000);

    client.login(config.token).catch(error => {
        console.log('[ERROR] Login failed:', error.message);
        logger.error('Login error:', error);
        process.exit(1);
    });
    console.log('[DEBUG] Login call made (waiting for connection...)');
}).on('error', (err) => {
    console.log('[ERROR] ❌ Network FAILED - Cannot reach Discord API');
    console.log('[ERROR] Error:', err.message);
    console.log('[ERROR] This means:');
    console.log('[ERROR] 1. Firewall blocking Discord (discord.com)');
    console.log('[ERROR] 2. DNS not working');
    console.log('[ERROR] 3. No internet access from container');
    console.log('[ERROR] Contact your hosting provider to unblock Discord API');
    process.exit(1);
});
