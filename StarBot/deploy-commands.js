const { REST, Routes } = require('discord.js');
const config = require('./config/config');
const commands = require('./commands');

const rest = new REST().setToken(config.token);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands }
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('Error deploying commands:', error);
    }
})();
