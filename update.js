const { execSync } = require('child_process');
const { createBotLogger } = require('./utils/consoleLogger');

const logger = createBotLogger('MAIN');

function runCommand(command, description) {
    try {
        logger.info(description);
        const output = execSync(command, {
            encoding: 'utf-8',
            stdio: 'pipe'
        });

        if (output.trim()) {
            console.log(output);
        }
        return true;
    } catch (error) {
        logger.error(`Failed: ${description}`);
        console.error(error.stdout || error.message);
        return false;
    }
}

async function update() {
    logger.info('========================================');
    logger.info('Starting repository update...');
    logger.info('========================================');

    // Check current status
    logger.info('Checking current status...');
    runCommand('git status --short', 'Git status');

    // Fetch latest changes
    if (!runCommand('git fetch origin', 'Fetching latest changes from remote')) {
        logger.error('Failed to fetch changes');
        process.exit(1);
    }

    // Check if there are updates
    try {
        const behind = execSync('git rev-list HEAD..origin/main --count', { encoding: 'utf-8' }).trim();
        if (behind === '0') {
            logger.success('✅ Repository is already up to date!');
            process.exit(0);
        }
        logger.info(`📥 ${behind} commit(s) available to pull`);
    } catch (error) {
        logger.warn('Could not check commits difference');
    }

    // Show what will be updated
    logger.info('Changes to be pulled:');
    runCommand('git log HEAD..origin/main --oneline', 'Recent commits');

    // Pull changes
    logger.info('========================================');
    if (!runCommand('git pull origin main', 'Pulling changes')) {
        logger.error('Failed to pull changes');
        logger.warn('You may need to resolve conflicts manually');
        process.exit(1);
    }

    logger.success('✅ Repository updated successfully!');
    logger.info('========================================');
    logger.info('To restart the bot, run: npm start');
    logger.info('========================================');
}

// Run update
update().catch(error => {
    logger.error('Update failed:', error);
    process.exit(1);
});
