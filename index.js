const { spawn } = require('child_process');
const path = require('path');
const { createBotLogger } = require('./utils/consoleLogger');

const logger = createBotLogger('MAIN');

// Wczytaj konfigurację botów
const botConfig = require('./bot-config.json');

// Sprawdź czy używamy trybu development (npm run local)
const isDevelopment = process.argv.includes('local');
const environment = isDevelopment ? 'development' : 'production';

logger.info(`Uruchamianie botów w trybie: ${environment}`);

// Pobierz listę botów do uruchomienia
const botsToStart = botConfig[environment] || [];

if (botsToStart.length === 0) {
    logger.warn(`Brak botów do uruchomienia w środowisku: ${environment}`);
    process.exit(0);
}

logger.info(`Uruchamianie ${botsToStart.length} bot(ów): ${botsToStart.join(', ')}`);

const botProcesses = [];

// Funkcja do konwersji nazwy bota na nazwę folderu
function getBotFolderName(botName) {
    // Konwertuj nazwy: starbot -> StarBot
    const folderMap = {
        'starbot': 'StarBot'
    };
    return folderMap[botName.toLowerCase()] || botName;
}

// Uruchom każdego bota w osobnym procesie
botsToStart.forEach(botName => {
    const folderName = getBotFolderName(botName);
    const botPath = path.join(__dirname, folderName, 'index.js');

    logger.info(`Uruchamianie ${folderName}...`);

    const botProcess = spawn('node', [botPath], {
        stdio: 'inherit',
        cwd: __dirname
    });

    botProcess.on('error', (error) => {
        logger.error(`Błąd uruchamiania ${folderName}:`, error);
    });

    botProcess.on('exit', (code, signal) => {
        if (code !== null) {
            logger.warn(`${folderName} zakończył się z kodem: ${code}`);
        } else if (signal !== null) {
            logger.warn(`${folderName} został zabity sygnałem: ${signal}`);
        }
    });

    botProcesses.push({ name: folderName, process: botProcess });
});

// Graceful shutdown
function shutdown() {
    logger.info('Zatrzymywanie wszystkich botów...');

    botProcesses.forEach(({ name, process }) => {
        logger.info(`Zatrzymywanie ${name}...`);
        process.kill('SIGTERM');
    });

    setTimeout(() => {
        logger.info('Wszystkie boty zatrzymane');
        process.exit(0);
    }, 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

logger.success(`✅ Launcher gotowy - zarządza ${botsToStart.length} botem/botami`);
