const messages = require('../config/messages');
const { ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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
        else if (interaction.isChannelSelectMenu()) {
            await handleChannelSelectMenu(interaction, sharedState);
        }
        else if (interaction.isRoleSelectMenu()) {
            await handleRoleSelectMenu(interaction, sharedState);
        }
        else if (interaction.isModalSubmit()) {
            await handleModalSubmit(interaction, sharedState);
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

    // Create notification button
    if (customId === 'notification_create') {
        await handleNotificationCreateButton(interaction, sharedState);
        return;
    }

    // Quick time preset buttons
    if (customId.startsWith('quick_time_')) {
        await handleQuickTimeButton(interaction, sharedState);
        return;
    }

    // Skip role selection for recurring reminders
    if (customId === 'recurring_skip_roles') {
        await handleRecurringSkipRoles(interaction, sharedState);
        return;
    }

    // Notification action buttons
    if (customId.startsWith('notification_modify_')) {
        await handleNotificationModify(interaction, sharedState);
        return;
    }

    if (customId.startsWith('notification_pause_')) {
        await handleNotificationPause(interaction, sharedState);
        return;
    }

    if (customId.startsWith('notification_resume_')) {
        await handleNotificationResume(interaction, sharedState);
        return;
    }

    if (customId.startsWith('notification_delete_')) {
        await handleNotificationDelete(interaction, sharedState);
        return;
    }

    // Default
    await interaction.reply({
        content: messages.info.processing,
        ephemeral: true
    });
}

// Handle notification create button
async function handleNotificationCreateButton(interaction, sharedState) {
    // Show select menu for notification type
    const row = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('notification_type_select')
                .setPlaceholder('Choose notification type')
                .addOptions([
                    {
                        label: 'One-Time Reminder',
                        description: 'Trigger once at specific time',
                        value: 'one-time',
                        emoji: '⏰'
                    },
                    {
                        label: 'Recurring Reminder',
                        description: 'Daily or weekly schedules',
                        value: 'recurring',
                        emoji: '🔄'
                    },
                    {
                        label: 'Event with Notifications',
                        description: 'Multi-stage notifications (24h, 1h, start)',
                        value: 'event',
                        emoji: '📅'
                    }
                ])
        );

    await interaction.reply({
        content: '**Step 1:** Choose notification type',
        components: [row],
        ephemeral: true
    });
}

// Handle quick time preset button
async function handleQuickTimeButton(interaction, sharedState) {
    // Extract time from customId (e.g., 'quick_time_5m' -> '5m')
    const timePreset = interaction.customId.replace('quick_time_', '');

    // Store time in temporary state and show modal for message
    // For now, show a simple modal
    const modal = new ModalBuilder()
        .setCustomId(`notification_modal_${timePreset}`)
        .setTitle('Create Quick Reminder');

    const messageInput = new TextInputBuilder()
        .setCustomId('notification_message')
        .setLabel('Reminder Message')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter your reminder message')
        .setRequired(true)
        .setMaxLength(200);

    const firstRow = new ActionRowBuilder().addComponents(messageInput);
    modal.addComponents(firstRow);

    await interaction.showModal(modal);
}

async function handleSelectMenu(interaction, sharedState) {
    const { logger } = sharedState;

    const customId = interaction.customId;
    logger.info(`Select Menu: ${customId} by ${interaction.user.tag}`);

    // Notification type selection
    if (customId === 'notification_type_select') {
        await handleNotificationTypeSelect(interaction, sharedState);
        return;
    }

    // Quick time selection
    if (customId.startsWith('quick_time_select_')) {
        await handleQuickTimeSelect(interaction, sharedState);
        return;
    }

    // Default
    await interaction.reply({
        content: messages.info.processing,
        ephemeral: true
    });
}

// Handle channel select menu
async function handleChannelSelectMenu(interaction, sharedState) {
    const { logger, notificationManager, userStates } = sharedState;

    const customId = interaction.customId;
    logger.info(`Channel Select: ${customId} by ${interaction.user.tag}`);

    if (customId === 'recurring_channel_select') {
        const userState = userStates.get(interaction.user.id);

        if (!userState || userState.type !== 'recurring' || userState.step !== 'select_channel') {
            await interaction.update({ content: '❌ Session expired. Please start over.', components: [] });
            return;
        }

        const selectedChannel = interaction.channels.first();

        // Update user state with selected channel
        userState.channelId = selectedChannel.id;
        userState.step = 'select_roles';
        userStates.set(interaction.user.id, userState);

        // Show role select menu
        const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId('recurring_role_select')
            .setPlaceholder('Select roles to ping (optional)')
            .setMinValues(0)
            .setMaxValues(5);

        const skipButton = new ButtonBuilder()
            .setCustomId('recurring_skip_roles')
            .setLabel('Skip - No role pings')
            .setStyle(ButtonStyle.Secondary);

        const row1 = new ActionRowBuilder().addComponents(roleSelect);
        const row2 = new ActionRowBuilder().addComponents(skipButton);

        await interaction.update({
            content: `📍 **Step 3/3:** Select roles to ping (optional)\nChannel: <#${selectedChannel.id}>`,
            components: [row1, row2]
        });
    }
}

// Handle role select menu
async function handleRoleSelectMenu(interaction, sharedState) {
    const { logger, notificationManager, boardManager, userStates } = sharedState;

    const customId = interaction.customId;
    logger.info(`Role Select: ${customId} by ${interaction.user.tag}`);

    if (customId === 'recurring_role_select') {
        const userState = userStates.get(interaction.user.id);

        if (!userState || userState.type !== 'recurring' || userState.step !== 'select_roles') {
            await interaction.update({ content: '❌ Session expired. Please start over.', components: [] });
            return;
        }

        const selectedRoles = interaction.roles.map(role => role.id);

        // Create the recurring reminder
        const recurring = await notificationManager.createRecurring(
            interaction.user.id,
            userState.time,
            userState.frequency,
            userState.message,
            userState.channelId,
            selectedRoles,
            [],
            'DAILY_REMINDERS'
        );

        await boardManager.createEmbed(recurring);

        // Clear user state
        userStates.delete(interaction.user.id);

        const roleText = selectedRoles.length > 0 ? selectedRoles.map(r => `<@&${r}>`).join(', ') : 'None';

        await interaction.update({
            content: `✅ **Recurring reminder created!**\n\n` +
                `**ID:** ${recurring.id}\n` +
                `**Next trigger:** <t:${Math.floor(new Date(recurring.nextTrigger).getTime() / 1000)}:F> (<t:${Math.floor(new Date(recurring.nextTrigger).getTime() / 1000)}:R>)\n` +
                `**Channel:** <#${userState.channelId}>\n` +
                `**Roles:** ${roleText}`,
            components: []
        });

        logger.success(`Created recurring reminder ${recurring.id}`);
    }
}

// Handle skip roles button for recurring reminders
async function handleRecurringSkipRoles(interaction, sharedState) {
    const { logger, notificationManager, boardManager, userStates } = sharedState;

    const userState = userStates.get(interaction.user.id);

    if (!userState || userState.type !== 'recurring' || userState.step !== 'select_roles') {
        await interaction.update({ content: '❌ Session expired. Please start over.', components: [] });
        return;
    }

    // Create the recurring reminder without role pings
    const recurring = await notificationManager.createRecurring(
        interaction.user.id,
        userState.time,
        userState.frequency,
        userState.message,
        userState.channelId,
        [], // No roles
        [],
        'DAILY_REMINDERS'
    );

    await boardManager.createEmbed(recurring);

    // Clear user state
    userStates.delete(interaction.user.id);

    await interaction.update({
        content: `✅ **Recurring reminder created!**\n\n` +
            `**ID:** ${recurring.id}\n` +
            `**Next trigger:** <t:${Math.floor(new Date(recurring.nextTrigger).getTime() / 1000)}:F> (<t:${Math.floor(new Date(recurring.nextTrigger).getTime() / 1000)}:R>)\n` +
            `**Channel:** <#${userState.channelId}>\n` +
            `**Roles:** None`,
        components: []
    });

    logger.success(`Created recurring reminder ${recurring.id} (no role pings)`);
}

// Handle notification type selection
async function handleNotificationTypeSelect(interaction, sharedState) {
    const selectedType = interaction.values[0];

    // Show quick time selection for one-time reminders
    if (selectedType === 'one-time') {
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('quick_time_select_onetime')
                    .setPlaceholder('Choose when to trigger')
                    .addOptions([
                        { label: 'In 5 minutes', value: '5m', emoji: '⏰' },
                        { label: 'In 15 minutes', value: '15m', emoji: '⏰' },
                        { label: 'In 30 minutes', value: '30m', emoji: '⏰' },
                        { label: 'In 1 hour', value: '1h', emoji: '⏰' },
                        { label: 'In 2 hours', value: '2h', emoji: '⏰' },
                        { label: 'In 6 hours', value: '6h', emoji: '⏰' },
                        { label: 'In 12 hours', value: '12h', emoji: '⏰' },
                        { label: 'In 1 day', value: '1d', emoji: '📅' },
                        { label: 'Custom time...', value: 'custom', emoji: '✏️' }
                    ])
            );

        await interaction.update({
            content: '**Step 2:** Choose when to trigger the reminder',
            components: [row]
        });
    }
    // Show recurring options
    else if (selectedType === 'recurring') {
        // Show modal for recurring setup
        const modal = new ModalBuilder()
            .setCustomId('notification_modal_recurring')
            .setTitle('Create Recurring Reminder');

        const timeInput = new TextInputBuilder()
            .setCustomId('time')
            .setLabel('Time (HH:MM)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('20:00')
            .setRequired(true)
            .setMaxLength(5);

        const messageInput = new TextInputBuilder()
            .setCustomId('message')
            .setLabel('Reminder Message')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Daily reminder message')
            .setRequired(true)
            .setMaxLength(200);

        const frequencyInput = new TextInputBuilder()
            .setCustomId('frequency')
            .setLabel('Frequency (e.g. 1d, 2d, 5h, 12h)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('1d or 5h')
            .setRequired(true)
            .setMaxLength(10);

        modal.addComponents(
            new ActionRowBuilder().addComponents(timeInput),
            new ActionRowBuilder().addComponents(messageInput),
            new ActionRowBuilder().addComponents(frequencyInput)
        );

        await interaction.showModal(modal);
    }
    // Show event options
    else if (selectedType === 'event') {
        // Show modal for event setup
        const modal = new ModalBuilder()
            .setCustomId('notification_modal_event')
            .setTitle('Create Event Notification');

        const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Event Name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Raid Boss - Ender Dragon')
            .setRequired(true)
            .setMaxLength(100);

        const timeInput = new TextInputBuilder()
            .setCustomId('time')
            .setLabel('Event Time (YYYY-MM-DD HH:MM)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('2024-12-31 21:00')
            .setRequired(true);

        const messageInput = new TextInputBuilder()
            .setCustomId('message')
            .setLabel('Event Description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Epic raid event! Join us!')
            .setRequired(true)
            .setMaxLength(500);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(timeInput),
            new ActionRowBuilder().addComponents(messageInput)
        );

        await interaction.showModal(modal);
    }
}

// Handle quick time selection for one-time reminders
async function handleQuickTimeSelect(interaction, sharedState) {
    const selectedTime = interaction.values[0];

    if (selectedTime === 'custom') {
        // Show modal for custom time
        const modal = new ModalBuilder()
            .setCustomId('notification_modal_custom')
            .setTitle('Create Reminder (Custom Time)');

        const timeInput = new TextInputBuilder()
            .setCustomId('time')
            .setLabel('Time (YYYY-MM-DD HH:MM or 2h, 30m, etc)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('2024-12-31 20:00 or 2h')
            .setRequired(true);

        const messageInput = new TextInputBuilder()
            .setCustomId('message')
            .setLabel('Reminder Message')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Your reminder message')
            .setRequired(true)
            .setMaxLength(200);

        modal.addComponents(
            new ActionRowBuilder().addComponents(timeInput),
            new ActionRowBuilder().addComponents(messageInput)
        );

        await interaction.showModal(modal);
    } else {
        // Quick time - show modal for message only
        const modal = new ModalBuilder()
            .setCustomId(`notification_modal_quick_${selectedTime}`)
            .setTitle(`Create Reminder (in ${selectedTime})`);

        const messageInput = new TextInputBuilder()
            .setCustomId('message')
            .setLabel('Reminder Message')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Your reminder message')
            .setRequired(true)
            .setMaxLength(200);

        modal.addComponents(
            new ActionRowBuilder().addComponents(messageInput)
        );

        await interaction.showModal(modal);
    }
}

// Handle modal submissions
async function handleModalSubmit(interaction, sharedState) {
    const { notificationManager, boardManager, logger, config } = sharedState;
    const customId = interaction.customId;

    logger.info(`Modal Submit: ${customId} by ${interaction.user.tag}`);

    await interaction.deferReply({ ephemeral: true });

    try {
        // Quick reminder with preset time
        if (customId.startsWith('notification_modal_quick_')) {
            const timePreset = customId.replace('notification_modal_quick_', '');
            const message = interaction.fields.getTextInputValue('message');

            // Parse time
            const triggerAt = parseTime(timePreset);
            if (!triggerAt) {
                await interaction.editReply({ content: messages.errors.invalidTime });
                return;
            }

            // Create reminder
            const reminder = await notificationManager.createReminder(
                interaction.user.id,
                triggerAt,
                message,
                interaction.channel.id,
                [],
                [],
                'CUSTOM'
            );

            await boardManager.createEmbed(reminder);
            await interaction.editReply({ content: `✅ Reminder created! Will trigger in ${timePreset}.\nID: **${reminder.id}**` });
            logger.success(`Created quick reminder ${reminder.id}`);
        }
        // Custom time reminder
        else if (customId === 'notification_modal_custom') {
            const timeInput = interaction.fields.getTextInputValue('time');
            const message = interaction.fields.getTextInputValue('message');

            const triggerAt = parseTime(timeInput);
            if (!triggerAt) {
                await interaction.editReply({ content: messages.errors.invalidTime });
                return;
            }

            if (triggerAt < new Date()) {
                await interaction.editReply({ content: '❌ Trigger time cannot be in the past.' });
                return;
            }

            const reminder = await notificationManager.createReminder(
                interaction.user.id,
                triggerAt,
                message,
                interaction.channel.id,
                [],
                [],
                'CUSTOM'
            );

            await boardManager.createEmbed(reminder);
            await interaction.editReply({ content: `✅ Reminder created!\nID: **${reminder.id}**` });
            logger.success(`Created custom reminder ${reminder.id}`);
        }
        // Recurring reminder
        else if (customId === 'notification_modal_recurring') {
            const time = interaction.fields.getTextInputValue('time').trim();
            const message = interaction.fields.getTextInputValue('message');
            const frequency = interaction.fields.getTextInputValue('frequency').toLowerCase().trim();

            // Validate time format: must be HH:MM
            if (!/^\d{1,2}:\d{2}$/.test(time)) {
                await interaction.editReply({ content: '❌ Invalid time format. Use HH:MM (e.g., "20:00").' });
                return;
            }

            // Validate frequency: must be interval format (1d, 2d, 5h, 12h, etc.)
            if (!/^\d+[hd]$/.test(frequency)) {
                await interaction.editReply({ content: '❌ Invalid frequency format. Use format like: 1d, 2d, 5h, 12h' });
                return;
            }

            // Store data in userStates for next steps (channel and role selection)
            userStates.set(interaction.user.id, {
                type: 'recurring',
                time,
                message,
                frequency,
                step: 'select_channel'
            });

            // Show channel select menu
            const channels = await interaction.guild.channels.fetch();
            const textChannels = channels.filter(ch => ch.isTextBased() && !ch.isThread());

            const channelSelect = new ChannelSelectMenuBuilder()
                .setCustomId('recurring_channel_select')
                .setPlaceholder('Select channel for notifications')
                .setChannelTypes([ChannelType.GuildText]);

            const row = new ActionRowBuilder().addComponents(channelSelect);

            await interaction.editReply({
                content: '📍 **Step 2/3:** Select the channel where notifications will be sent',
                components: [row]
            });
        }
        // Event
        else if (customId === 'notification_modal_event') {
            const name = interaction.fields.getTextInputValue('name');
            const timeInput = interaction.fields.getTextInputValue('time');
            const message = interaction.fields.getTextInputValue('message');

            const eventTime = parseTime(timeInput);
            if (!eventTime) {
                await interaction.editReply({ content: messages.errors.invalidTime });
                return;
            }

            if (eventTime < new Date()) {
                await interaction.editReply({ content: '❌ Event time cannot be in the past.' });
                return;
            }

            const event = await notificationManager.createEvent(
                interaction.user.id,
                name,
                eventTime,
                message,
                interaction.channel.id,
                [],
                [],
                'BOSS_EVENTS',
                [-86400000, -3600000, 0] // 24h, 1h, start
            );

            await boardManager.createEmbed(event);
            await interaction.editReply({ content: `✅ Event created!\nID: **${event.id}**\nNotifications: 24h before, 1h before, at start` });
            logger.success(`Created event ${event.id}`);
        }
        // Modify existing notification
        else if (customId.startsWith('notification_modify_modal_')) {
            const notificationId = customId.replace('notification_modify_modal_', '');
            const newMessage = interaction.fields.getTextInputValue('message');

            const notification = notificationManager.getNotification(notificationId);
            if (!notification) {
                await interaction.reply({ content: '❌ Notification not found.', ephemeral: true });
                return;
            }

            // Update notification
            await notificationManager.updateNotification(notificationId, { message: newMessage });

            // Update board embed
            const updatedNotification = notificationManager.getNotification(notificationId);
            await boardManager.updateEmbed(updatedNotification);

            await interaction.reply({
                content: `✅ Notification **${notificationId}** updated!`,
                ephemeral: true
            });

            logger.success(`Modified notification ${notificationId}`);
        }

    } catch (error) {
        logger.error('Error handling modal submit:', error);

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: messages.errors.generic, ephemeral: true });
        } else {
            await interaction.reply({ content: messages.errors.generic, ephemeral: true });
        }
    }
}

// Helper function to parse time input (copied from slash commands)
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

// Handle notification modify button
async function handleNotificationModify(interaction, sharedState) {
    const { logger, notificationManager } = sharedState;

    // Extract notification ID from customId
    const notificationId = interaction.customId.replace('notification_modify_', '');
    const notification = notificationManager.getNotification(notificationId);

    if (!notification) {
        await interaction.reply({
            content: '❌ Notification not found.',
            ephemeral: true
        });
        return;
    }

    // Build modal with current values
    const modal = new ModalBuilder()
        .setCustomId(`notification_modify_modal_${notificationId}`)
        .setTitle('Modify Notification');

    // Message input
    const messageInput = new TextInputBuilder()
        .setCustomId('message')
        .setLabel('Message')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(notification.message || '')
        .setRequired(true)
        .setMaxLength(500);

    modal.addComponents(
        new ActionRowBuilder().addComponents(messageInput)
    );

    await interaction.showModal(modal);
    logger.info(`Modify modal shown for notification ${notificationId}`);
}

// Handle notification pause button
async function handleNotificationPause(interaction, sharedState) {
    const { logger, notificationManager, boardManager } = sharedState;

    // Extract notification ID from customId
    const notificationId = interaction.customId.replace('notification_pause_', '');
    const notification = notificationManager.getNotification(notificationId);

    if (!notification) {
        await interaction.reply({
            content: '❌ Notification not found.',
            ephemeral: true
        });
        return;
    }

    // Pause notification
    await notificationManager.updateNotification(notificationId, { status: 'paused' });

    // Update board embed
    const updatedNotification = notificationManager.getNotification(notificationId);
    await boardManager.updateEmbed(updatedNotification);

    await interaction.reply({
        content: `⏸️ Notification **${notificationId}** paused.`,
        ephemeral: true
    });

    logger.success(`Paused notification ${notificationId}`);
}

// Handle notification resume button
async function handleNotificationResume(interaction, sharedState) {
    const { logger, notificationManager, boardManager } = sharedState;

    // Extract notification ID from customId
    const notificationId = interaction.customId.replace('notification_resume_', '');
    const notification = notificationManager.getNotification(notificationId);

    if (!notification) {
        await interaction.reply({
            content: '❌ Notification not found.',
            ephemeral: true
        });
        return;
    }

    // Resume notification
    await notificationManager.updateNotification(notificationId, { status: 'active' });

    // Update board embed
    const updatedNotification = notificationManager.getNotification(notificationId);
    await boardManager.updateEmbed(updatedNotification);

    await interaction.reply({
        content: `▶️ Notification **${notificationId}** resumed.`,
        ephemeral: true
    });

    logger.success(`Resumed notification ${notificationId}`);
}

// Handle notification delete button
async function handleNotificationDelete(interaction, sharedState) {
    const { logger, notificationManager, boardManager } = sharedState;

    // Extract notification ID from customId
    const notificationId = interaction.customId.replace('notification_delete_', '');
    const notification = notificationManager.getNotification(notificationId);

    if (!notification) {
        await interaction.reply({
            content: '❌ Notification not found.',
            ephemeral: true
        });
        return;
    }

    // Delete from board
    await boardManager.deleteEmbed(notification);

    // Delete notification
    await notificationManager.deleteNotification(notificationId);

    await interaction.reply({
        content: `🗑️ Notification **${notificationId}** deleted.`,
        ephemeral: true
    });

    logger.success(`Deleted notification ${notificationId}`);
}

module.exports = {
    handleInteraction
};
