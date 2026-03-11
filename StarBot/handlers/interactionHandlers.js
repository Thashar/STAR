const messages = require('../config/messages');

async function handleInteraction(interaction, sharedState) {
    const { logger } = sharedState;

    try {
        if (interaction.isChatInputCommand()) {
            await handleSlashCommand(interaction, sharedState);
        }
        else if (interaction.isButton()) {
            await handleButton(interaction, sharedState);
        }
        else if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction, sharedState);
        }
    } catch (error) {
        logger.error('Error handling interaction:', error);

        const errorMessage = messages.errors.generic;

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
}

async function handleSlashCommand(interaction, sharedState) {
    const { logger, notificationManager, boardManager } = sharedState;

    const commandName = interaction.commandName;
    logger.info(`Command: /${commandName} by ${interaction.user.tag}`);

    switch (commandName) {
        case 'reminder':
            await handleReminderCommand(interaction, sharedState);
            break;

        case 'recurring':
            await handleRecurringCommand(interaction, sharedState);
            break;

        case 'event':
            await handleEventCommand(interaction, sharedState);
            break;

        case 'notifications':
            await handleListNotificationsCommand(interaction, sharedState);
            break;

        case 'delete-notification':
            await handleDeleteNotificationCommand(interaction, sharedState);
            break;

        case 'pause-notification':
            await handlePauseNotificationCommand(interaction, sharedState);
            break;

        case 'resume-notification':
            await handleResumeNotificationCommand(interaction, sharedState);
            break;

        case 'refresh-board':
            await handleRefreshBoardCommand(interaction, sharedState);
            break;

        default:
            await interaction.reply({
                content: '❌ Unknown command.',
                ephemeral: true
            });
    }
}

async function handleReminderCommand(interaction, sharedState) {
    const { notificationManager, boardManager, logger, config } = sharedState;

    await interaction.deferReply({ ephemeral: true });

    try {
        const timeInput = interaction.options.getString('time');
        const message = interaction.options.getString('message');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const role = interaction.options.getRole('role');
        const category = interaction.options.getString('category') || 'CUSTOM';

        // Parse time
        const triggerAt = parseTime(timeInput);
        if (!triggerAt) {
            await interaction.editReply({ content: messages.errors.invalidTime });
            return;
        }

        // Check if in the past
        if (triggerAt < new Date()) {
            await interaction.editReply({ content: '❌ Trigger time cannot be in the past.' });
            return;
        }

        // Check limits
        const userCount = notificationManager.getActiveCountByUser(interaction.user.id);
        if (userCount >= config.maxNotificationsPerUser) {
            await interaction.editReply({ content: messages.errors.maxNotificationsReached });
            return;
        }

        // Create reminder
        const roles = role ? [role.id] : [];
        const reminder = await notificationManager.createReminder(
            interaction.user.id,
            triggerAt,
            message,
            channel.id,
            roles,
            [],
            category
        );

        // Create board embed
        await boardManager.createEmbed(reminder);

        const successMsg = messages.success.notificationCreated.replace('{id}', reminder.id);
        await interaction.editReply({ content: successMsg });

        logger.success(`Created reminder ${reminder.id} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('Error creating reminder:', error);
        await interaction.editReply({ content: messages.errors.generic });
    }
}

async function handleRecurringCommand(interaction, sharedState) {
    const { notificationManager, boardManager, logger, config } = sharedState;

    await interaction.deferReply({ ephemeral: true });

    try {
        const time = interaction.options.getString('time');
        const frequency = interaction.options.getString('frequency');
        const message = interaction.options.getString('message');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const role = interaction.options.getRole('role');
        const daysInput = interaction.options.getString('days');
        const category = interaction.options.getString('category') || 'CUSTOM';

        // Validate time format (HH:MM)
        if (!/^\d{1,2}:\d{2}$/.test(time)) {
            await interaction.editReply({ content: '❌ Invalid time format. Use HH:MM (e.g., "20:00").' });
            return;
        }

        // Parse days of week
        let daysOfWeek = null;
        if (frequency === 'weekly' && daysInput) {
            daysOfWeek = daysInput.split(',').map(d => parseInt(d.trim())).filter(d => d >= 0 && d <= 6);
            if (daysOfWeek.length === 0) {
                await interaction.editReply({ content: '❌ Invalid days format. Use comma-separated numbers 0-6 (e.g., "0,1,2" for Sun,Mon,Tue).' });
                return;
            }
        }

        // Check limits
        const userCount = notificationManager.getActiveCountByUser(interaction.user.id);
        if (userCount >= config.maxNotificationsPerUser) {
            await interaction.editReply({ content: messages.errors.maxNotificationsReached });
            return;
        }

        // Create recurring reminder
        const roles = role ? [role.id] : [];
        const recurring = await notificationManager.createRecurring(
            interaction.user.id,
            time,
            frequency,
            message,
            channel.id,
            roles,
            [],
            category,
            daysOfWeek
        );

        // Create board embed
        await boardManager.createEmbed(recurring);

        const successMsg = messages.success.notificationCreated.replace('{id}', recurring.id);
        await interaction.editReply({ content: successMsg });

        logger.success(`Created recurring reminder ${recurring.id} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('Error creating recurring reminder:', error);
        await interaction.editReply({ content: messages.errors.generic });
    }
}

async function handleEventCommand(interaction, sharedState) {
    const { notificationManager, boardManager, logger, config } = sharedState;

    await interaction.deferReply({ ephemeral: true });

    try {
        const name = interaction.options.getString('name');
        const timeInput = interaction.options.getString('time');
        const message = interaction.options.getString('message');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const role = interaction.options.getRole('role');
        const notificationsInput = interaction.options.getString('notifications');
        const category = interaction.options.getString('category') || 'CUSTOM';

        // Parse event time
        const eventTime = parseTime(timeInput);
        if (!eventTime) {
            await interaction.editReply({ content: messages.errors.invalidTime });
            return;
        }

        // Check if in the past
        if (eventTime < new Date()) {
            await interaction.editReply({ content: '❌ Event time cannot be in the past.' });
            return;
        }

        // Parse notification offsets
        let notificationOffsets = [-86400000, -3600000, 0]; // Default: 24h, 1h, at start
        if (notificationsInput) {
            notificationOffsets = notificationsInput.split(',')
                .map(h => {
                    const hours = parseInt(h.trim());
                    return -hours * 60 * 60 * 1000; // Convert to negative milliseconds
                })
                .filter(offset => !isNaN(offset));
        }

        // Check limits
        const userCount = notificationManager.getActiveCountByUser(interaction.user.id);
        if (userCount >= config.maxNotificationsPerUser) {
            await interaction.editReply({ content: messages.errors.maxNotificationsReached });
            return;
        }

        // Create event
        const roles = role ? [role.id] : [];
        const event = await notificationManager.createEvent(
            interaction.user.id,
            name,
            eventTime,
            message,
            channel.id,
            roles,
            [],
            category,
            notificationOffsets
        );

        // Create board embed
        await boardManager.createEmbed(event);

        const successMsg = messages.success.notificationCreated.replace('{id}', event.id);
        await interaction.editReply({ content: successMsg });

        logger.success(`Created event ${event.id} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('Error creating event:', error);
        await interaction.editReply({ content: messages.errors.generic });
    }
}

async function handleListNotificationsCommand(interaction, sharedState) {
    const { notificationManager } = sharedState;

    const filter = interaction.options.getString('filter') || 'mine';

    let notifications;
    if (filter === 'all') {
        notifications = notificationManager.getAllNotifications();
    } else if (filter === 'active') {
        notifications = notificationManager.getActiveNotifications();
    } else {
        notifications = notificationManager.getNotificationsByCreator(interaction.user.id);
    }

    if (notifications.length === 0) {
        await interaction.reply({ content: '📋 No notifications found.', ephemeral: true });
        return;
    }

    const list = notifications.map(n => {
        const statusEmoji = n.status === 'active' ? '✅' : n.status === 'paused' ? '⏸️' : '✔️';
        const typeEmoji = n.type === 'one-time' ? '⏰' : n.type === 'event' ? '📅' : '🔄';
        return `${statusEmoji} ${typeEmoji} **${n.id}** - ${n.message.substring(0, 50)}${n.message.length > 50 ? '...' : ''}`;
    }).join('\n');

    await interaction.reply({
        content: `📋 **Your Notifications (${notifications.length})**\n\n${list}`,
        ephemeral: true
    });
}

async function handleDeleteNotificationCommand(interaction, sharedState) {
    const { notificationManager, boardManager, logger } = sharedState;

    const id = interaction.options.getString('id');

    const notification = notificationManager.getNotification(id);
    if (!notification) {
        await interaction.reply({ content: messages.errors.notificationNotFound, ephemeral: true });
        return;
    }

    // Check ownership (or admin)
    if (notification.creator !== interaction.user.id && !interaction.member.permissions.has('Administrator')) {
        await interaction.reply({ content: messages.errors.noPermission, ephemeral: true });
        return;
    }

    // Delete from board
    await boardManager.deleteEmbed(notification);

    // Delete from storage
    await notificationManager.deleteNotification(id);

    await interaction.reply({ content: messages.success.notificationDeleted, ephemeral: true });
    logger.info(`Deleted notification ${id} by ${interaction.user.tag}`);
}

async function handlePauseNotificationCommand(interaction, sharedState) {
    const { notificationManager, boardManager, logger } = sharedState;

    const id = interaction.options.getString('id');

    const notification = notificationManager.getNotification(id);
    if (!notification) {
        await interaction.reply({ content: messages.errors.notificationNotFound, ephemeral: true });
        return;
    }

    // Check ownership (or admin)
    if (notification.creator !== interaction.user.id && !interaction.member.permissions.has('Administrator')) {
        await interaction.reply({ content: messages.errors.noPermission, ephemeral: true });
        return;
    }

    await notificationManager.pauseNotification(id);

    // Update board embed
    const updatedNotification = notificationManager.getNotification(id);
    await boardManager.updateEmbed(updatedNotification);

    await interaction.reply({ content: messages.success.notificationPaused, ephemeral: true });
    logger.info(`Paused notification ${id} by ${interaction.user.tag}`);
}

async function handleResumeNotificationCommand(interaction, sharedState) {
    const { notificationManager, boardManager, logger } = sharedState;

    const id = interaction.options.getString('id');

    const notification = notificationManager.getNotification(id);
    if (!notification) {
        await interaction.reply({ content: messages.errors.notificationNotFound, ephemeral: true });
        return;
    }

    // Check ownership (or admin)
    if (notification.creator !== interaction.user.id && !interaction.member.permissions.has('Administrator')) {
        await interaction.reply({ content: messages.errors.noPermission, ephemeral: true });
        return;
    }

    await notificationManager.resumeNotification(id);

    // Update board embed
    const updatedNotification = notificationManager.getNotification(id);
    await boardManager.updateEmbed(updatedNotification);

    await interaction.reply({ content: messages.success.notificationResumed, ephemeral: true });
    logger.info(`Resumed notification ${id} by ${interaction.user.tag}`);
}

async function handleRefreshBoardCommand(interaction, sharedState) {
    const { boardManager, logger } = sharedState;

    // Admin only
    if (!interaction.member.permissions.has('Administrator')) {
        await interaction.reply({ content: messages.errors.noPermission, ephemeral: true });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        await boardManager.syncAllNotifications();
        await interaction.editReply({ content: '✅ Notifications board refreshed successfully!' });
        logger.info(`Board refreshed by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('Error refreshing board:', error);
        await interaction.editReply({ content: messages.errors.generic });
    }
}

// Helper function to parse time input
function parseTime(input) {
    // Try ISO format first
    const isoDate = new Date(input);
    if (!isNaN(isoDate.getTime())) {
        return isoDate;
    }

    // Try relative time (e.g., "2h", "30m", "1d")
    const relativeMatch = input.match(/^(\d+)(m|h|d)$/);
    if (relativeMatch) {
        const amount = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2];

        const now = new Date();
        switch (unit) {
            case 'm':
                now.setMinutes(now.getMinutes() + amount);
                break;
            case 'h':
                now.setHours(now.getHours() + amount);
                break;
            case 'd':
                now.setDate(now.getDate() + amount);
                break;
        }
        return now;
    }

    return null;
}

async function handleButton(interaction, sharedState) {
    const { logger } = sharedState;

    const customId = interaction.customId;
    logger.info(`Button: ${customId} by ${interaction.user.tag}`);

    await interaction.reply({
        content: messages.info.processing,
        ephemeral: true
    });
}

async function handleSelectMenu(interaction, sharedState) {
    const { logger } = sharedState;

    const customId = interaction.customId;
    logger.info(`Select Menu: ${customId} by ${interaction.user.tag}`);

    await interaction.reply({
        content: messages.info.processing,
        ephemeral: true
    });
}

module.exports = {
    handleInteraction
};
