const { SlashCommandBuilder } = require('discord.js');

module.exports = [
    // Create new reminder template (Text or Embed)
    new SlashCommandBuilder()
        .setName('new-reminder')
        .setDescription('Utwórz nowy szablon przypomnienia (Text lub Embed)'),

    // Set reminder schedule from template
    new SlashCommandBuilder()
        .setName('set-reminder')
        .setDescription('Ustaw harmonogram dla szablonu przypomnienia'),

    // Edit or delete reminders
    new SlashCommandBuilder()
        .setName('edit-reminder')
        .setDescription('Edytuj lub usuń przypomnienia (szablony lub zaplanowane)')
];
