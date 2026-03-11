const { SlashCommandBuilder } = require('discord.js');

module.exports = [
    // Create one-time reminder
    new SlashCommandBuilder()
        .setName('reminder')
        .setDescription('Create a one-time reminder')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('When to trigger (e.g., "2024-12-31 20:00" or "2h" or "30m")')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Reminder message')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send reminder (default: current channel)')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to ping')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Notification category')
                .setRequired(false)
                .addChoices(
                    { name: '⚔️ Boss Events', value: 'BOSS_EVENTS' },
                    { name: '🎯 Daily Reminders', value: 'DAILY_REMINDERS' },
                    { name: '🛡️ Administration', value: 'ADMIN' },
                    { name: '🎉 Community', value: 'COMMUNITY' },
                    { name: '⭐ Custom', value: 'CUSTOM' }
                )),

    // Create recurring reminder
    new SlashCommandBuilder()
        .setName('recurring')
        .setDescription('Create a recurring reminder')
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Time of day (HH:MM format, e.g., "20:00")')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('frequency')
                .setDescription('How often to repeat')
                .setRequired(true)
                .addChoices(
                    { name: 'Daily', value: 'daily' },
                    { name: 'Weekly', value: 'weekly' }
                ))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Reminder message')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send reminder (default: current channel)')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to ping')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('days')
                .setDescription('Days of week (e.g., "0,1,2" for Sun,Mon,Tue - only for weekly)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Notification category')
                .setRequired(false)
                .addChoices(
                    { name: '⚔️ Boss Events', value: 'BOSS_EVENTS' },
                    { name: '🎯 Daily Reminders', value: 'DAILY_REMINDERS' },
                    { name: '🛡️ Administration', value: 'ADMIN' },
                    { name: '🎉 Community', value: 'COMMUNITY' },
                    { name: '⭐ Custom', value: 'CUSTOM' }
                )),

    // Create event
    new SlashCommandBuilder()
        .setName('event')
        .setDescription('Create an event with notifications')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Event name')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('Event time (e.g., "2024-12-31 20:00")')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Event description')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel for notifications (default: current channel)')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role to ping')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('notifications')
                .setDescription('Notification times in hours before event (e.g., "24,1,0" for 24h, 1h, and at start)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Event category')
                .setRequired(false)
                .addChoices(
                    { name: '⚔️ Boss Events', value: 'BOSS_EVENTS' },
                    { name: '🎯 Daily Reminders', value: 'DAILY_REMINDERS' },
                    { name: '🛡️ Administration', value: 'ADMIN' },
                    { name: '🎉 Community', value: 'COMMUNITY' },
                    { name: '⭐ Custom', value: 'CUSTOM' }
                )),

    // List notifications
    new SlashCommandBuilder()
        .setName('notifications')
        .setDescription('List your active notifications')
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Filter notifications')
                .setRequired(false)
                .addChoices(
                    { name: 'All', value: 'all' },
                    { name: 'Mine only', value: 'mine' },
                    { name: 'Active only', value: 'active' }
                )),

    // Delete notification
    new SlashCommandBuilder()
        .setName('delete-notification')
        .setDescription('Delete a notification')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('Notification ID (e.g., rem_1, rec_2, evt_3)')
                .setRequired(true)),

    // Pause notification
    new SlashCommandBuilder()
        .setName('pause-notification')
        .setDescription('Pause a notification')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('Notification ID')
                .setRequired(true)),

    // Resume notification
    new SlashCommandBuilder()
        .setName('resume-notification')
        .setDescription('Resume a paused notification')
        .addStringOption(option =>
            option.setName('id')
                .setDescription('Notification ID')
                .setRequired(true)),

    // Refresh board
    new SlashCommandBuilder()
        .setName('refresh-board')
        .setDescription('Refresh all notifications on the board (Admin only)')
];
