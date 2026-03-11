const { execSync } = require('child_process');

console.log('========================================');
console.log('📥 Updating repository from GitHub...');
console.log('========================================\n');

try {
    // Git pull - only updates tracked files, won't touch .env, data/, node_modules, etc.
    const output = execSync('git pull origin main', {
        encoding: 'utf-8',
        stdio: 'pipe'
    });

    console.log(output);

    if (output.includes('Already up to date')) {
        console.log('\n✅ Repository is already up to date!');
    } else {
        console.log('\n✅ Repository updated successfully!');
    }

    console.log('\n========================================');
    console.log('ℹ️  Restart the bot to apply changes');
    console.log('========================================');

} catch (error) {
    console.error('\n❌ Update failed:');
    console.error(error.stdout || error.message);
    console.log('\n⚠️  You may need to resolve conflicts manually');
    process.exit(1);
}
