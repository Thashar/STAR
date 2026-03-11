require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

module.exports = {
    token: process.env.STARBOT_TOKEN,
    clientId: process.env.STARBOT_CLIENT_ID,
    guildId: process.env.STARBOT_GUILD_ID,

    // Notifications Board - channel where all active reminders are displayed
    notificationsBoardChannelId: process.env.STARBOT_NOTIFICATIONS_BOARD_CHANNEL,

    // Timezone for scheduling
    timezone: 'Europe/Warsaw',

    // Update interval for notification embeds (in milliseconds)
    boardUpdateInterval: 60000, // 1 minute

    // Max notifications per user
    maxNotificationsPerUser: 50,

    // Max total active notifications
    maxTotalNotifications: 200,

    // Notification categories
    categories: {
        BOSS_EVENTS: { emoji: '⚔️', color: 0xFF0000 },
        DAILY_REMINDERS: { emoji: '🎯', color: 0x00FF00 },
        ADMIN: { emoji: '🛡️', color: 0x0000FF },
        COMMUNITY: { emoji: '🎉', color: 0xFFFF00 },
        CUSTOM: { emoji: '⭐', color: 0xFF00FF }
    }
};
