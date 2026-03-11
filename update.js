const { execSync } = require('child_process');

// Simple logger with colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

function log(message, color = colors.cyan) {
    console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
    console.log(`${colors.green}${message}${colors.reset}`);
}

function error(message) {
    console.error(`${colors.red}${message}${colors.reset}`);
}

function warn(message) {
    console.log(`${colors.yellow}${message}${colors.reset}`);
}

function runCommand(command, description) {
    try {
        log(description);
        const output = execSync(command, {
            encoding: 'utf-8',
            stdio: 'pipe'
        });

        if (output.trim()) {
            console.log(output);
        }
        return true;
    } catch (err) {
        error(`Failed: ${description}`);
        console.error(err.stdout || err.message);
        return false;
    }
}

async function update() {
    log('========================================');
    log('Starting repository update...');
    log('========================================');

    // Check current status
    log('Checking current status...');
    runCommand('git status --short', 'Git status');

    // Fetch latest changes
    if (!runCommand('git fetch origin', 'Fetching latest changes from remote')) {
        error('Failed to fetch changes');
        process.exit(1);
    }

    // Check if there are updates
    try {
        const behind = execSync('git rev-list HEAD..origin/main --count', { encoding: 'utf-8' }).trim();
        if (behind === '0') {
            success('✅ Repository is already up to date!');
            process.exit(0);
        }
        log(`📥 ${behind} commit(s) available to pull`);
    } catch (err) {
        warn('Could not check commits difference');
    }

    // Show what will be updated
    log('Changes to be pulled:');
    runCommand('git log HEAD..origin/main --oneline', 'Recent commits');

    // Pull changes
    log('========================================');
    if (!runCommand('git pull origin main', 'Pulling changes')) {
        error('Failed to pull changes');
        warn('You may need to resolve conflicts manually');
        process.exit(1);
    }

    success('✅ Repository updated successfully!');
    log('========================================');
    log('To restart the bot, run: npm start');
    log('========================================');
}

// Run update
update().catch(err => {
    error('Update failed:');
    console.error(err);
    process.exit(1);
});
