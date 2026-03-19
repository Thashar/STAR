const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const config = require('./config/config');
const { createBotLogger } = require('../utils/consoleLogger');
const { handleInteraction } = require('./handlers/interactionHandlers');
const commands = require('./commands');

// Services
const NotificationManager = require('./services/notificationManager');
const BoardManager = require('./services/boardManager');
const Scheduler = require('./services/scheduler');
const TimezoneManager = require('./services/timezoneManager');

const logger = createBotLogger('StarBot');

// Validate configuration
if (!config.token) {
    logger.error('STARBOT_TOKEN is not set in .env file');
    process.exit(1);
}

if (!config.notificationsBoardChannelId) {
    logger.error('STARBOT_NOTIFICATIONS_BOARD_CHANNEL is not set in .env file');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// Initialize services
const notificationManager = new NotificationManager(config, logger);
const timezoneManager = new TimezoneManager(logger);
const boardManager = new BoardManager(client, config, logger, notificationManager, timezoneManager);
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
    timezoneManager,
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
        await timezoneManager.initialize();
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
