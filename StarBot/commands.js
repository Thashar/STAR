const { SlashCommandBuilder } = require('discord.js');

module.exports = [
    // Create new reminder template (Text or Embed)
    new SlashCommandBuilder()
        .setName('new-reminder')
        .setDescription('Create new reminder template (Text or Embed)'),

    // Set reminder schedule from template
    new SlashCommandBuilder()
        .setName('set-reminder')
        .setDescription('Set reminder schedule from template'),

    // Edit or delete reminders
    new SlashCommandBuilder()
        .setName('edit-reminder')
        .setDescription('Edit or delete reminders (templates or scheduled)')
];
