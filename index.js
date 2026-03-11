const { spawn } = require('child_process');
const path = require('path');
const { createBotLogger } = require('./utils/consoleLogger');

const logger = createBotLogger('MAIN');

// Load bot configuration
const botConfig = require('./bot-config.json');

// Check if using development mode (npm run local)
const isDevelopment = process.argv.includes('local');
const environment = isDevelopment ? 'development' : 'production';

logger.info(`Starting bots in ${environment} mode`);

// Get list of bots to start
const botsToStart = botConfig[environment] || [];

if (botsToStart.length === 0) {
    logger.warn(`No bots to start in environment: ${environment}`);
    process.exit(0);
}

logger.info(`Starting ${botsToStart.length} bot(s): ${botsToStart.join(', ')}`);

const botProcesses = [];

// Function to convert bot name to folder name
function getBotFolderName(botName) {
    // Convert names: starbot -> StarBot
    const folderMap = {
        'starbot': 'StarBot'
    };
    return folderMap[botName.toLowerCase()] || botName;
}

// Start each bot in separate process
botsToStart.forEach(botName => {
    const folderName = getBotFolderName(botName);
    const botPath = path.join(__dirname, folderName, 'index.js');

    logger.info(`Starting ${folderName}...`);

    const botProcess = spawn('node', [botPath], {
        stdio: 'inherit',
        cwd: __dirname
    });

    botProcess.on('error', (error) => {
        logger.error(`Error starting ${folderName}:`, error);
    });

    botProcess.on('exit', (code, signal) => {
        if (code !== null) {
            logger.warn(`${folderName} exited with code: ${code}`);
        } else if (signal !== null) {
            logger.warn(`${folderName} killed with signal: ${signal}`);
        }
    });

    botProcesses.push({ name: folderName, process: botProcess });
});

// Graceful shutdown
function shutdown() {
    logger.info('Stopping all bots...');

    botProcesses.forEach(({ name, process }) => {
        logger.info(`Stopping ${name}...`);
        process.kill('SIGTERM');
    });

    setTimeout(() => {
        logger.info('All bots stopped');
        process.exit(0);
    }, 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

logger.success(`✅ Launcher ready - managing ${botsToStart.length} bot(s)`);
