const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ChannelType,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder
} = require('discord.js');

// ==================== MAIN HANDLER ====================

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
        // Unknown interaction - timeout (>3s od kliknięcia)
        if (error.code === 10062) {
            logger.error('⚠️ Unknown interaction - user clicked button but response took too long (>3s)');
            // Nie próbuj odpowiadać - interakcja już wygasła
            return;
        }

        logger.error('Error handling interaction:', error);

        const errorMessage = '❌ An error occurred during processing akcji.';

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else if (interaction.isRepliable()) {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (followUpError) {
            // Interakcja mogła wygasnąć podczas obsługi błędu
            logger.error('Could not send error message to user:', followUpError.message);
        }
    }
}

// ==================== SLASH COMMANDS ====================
// No slash commands - use control panel buttons only

async function handleSlashCommand(interaction, sharedState) {
    await interaction.reply({
        content: '❌ Slash commands are disabled. Please use the control panel buttons on the notifications board.',
        ephemeral: true
    });
}

// ==================== /NEW-REMINDER ====================

async function handleNewReminderCommand(interaction, sharedState) {
    const typeSelect = new StringSelectMenuBuilder()
        .setCustomId('new_reminder_type_select')
        .setPlaceholder('Choose reminder type')
        .addOptions([
            {
                label: 'Text',
                description: 'Plain text message',
                value: 'text',
                emoji: '📝'
            },
            {
                label: 'Embed',
                description: 'Message with embedded content',
                value: 'embed',
                emoji: '📋'
            }
        ]);

    const row = new ActionRowBuilder().addComponents(typeSelect);

    await interaction.reply({
        content: '**Step 1:** Choose reminder type',
        components: [row],
        ephemeral: true
    });
}

// ==================== /SET-REMINDER ====================

async function handleSetReminderCommand(interaction, sharedState) {
    const { notificationManager } = sharedState;

    const templates = notificationManager.getAllTemplates();

    if (templates.length === 0) {
        await interaction.reply({
            content: '❌ No reminder templates found. Use `/new-reminder` to create a template.',
            ephemeral: true
        });
        return;
    }

    // Paginacja - max 25 opcji w select menu
    const ITEMS_PER_PAGE = 25;
    const totalPages = Math.ceil(templates.length / ITEMS_PER_PAGE);
    const page = 0; // Pierwsza strona

    await showTemplateSelectPage(interaction, sharedState, page, totalPages, templates, 'set');
}

async function showTemplateSelectPage(interaction, sharedState, page, totalPages, templates, action) {
    const ITEMS_PER_PAGE = 25;
    const start = page * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, templates.length);
    const pageTemplates = templates.slice(start, end);

    const options = pageTemplates.map(t => ({
        label: t.name.substring(0, 100),
        description: `${t.type === 'text' ? '📝 Text' : '📋 Embed'} - Utworzono ${new Date(t.createdAt).toLocaleDateString('pl-PL')}`,
        value: t.id
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`template_select_${action}_${page}`)
        .setPlaceholder(`Select template (page ${page + 1}/${totalPages})`)
        .addOptions(options);

    const rows = [new ActionRowBuilder().addComponents(selectMenu)];

    // Dodaj przyciski paginacji jeśli więcej niż 1 strona
    if (totalPages > 1) {
        const paginationRow = new ActionRowBuilder();

        if (page > 0) {
            paginationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`template_page_${action}_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        paginationRow.addComponents(
            new ButtonBuilder()
                .setCustomId('page_info')
                .setLabel(`Page ${page + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );

        if (page < totalPages - 1) {
            paginationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`template_page_${action}_${page + 1}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        rows.push(paginationRow);
    }

    const content = action === 'set'
        ? `**Select template to schedule** (${templates.length} templates)`
        : `**Select template to edit** (${templates.length} templates)`;

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
            content,
            components: rows
        });
    } else {
        await interaction.reply({
            content,
            components: rows,
            ephemeral: true
        });
    }
}

// ==================== /EDIT-REMINDER ====================

async function handleEditReminderCommand(interaction, sharedState) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('edit_reminder_templates')
                .setLabel('Template')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝'),
            new ButtonBuilder()
                .setCustomId('edit_reminder_scheduled')
                .setLabel('Scheduled')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('⏰')
        );

    await interaction.reply({
        content: '**Edit reminders** - Choose type:',
        components: [row],
        ephemeral: true
    });
}

// ==================== /SET-TIME-ZONE ====================

async function handleSetTimezoneCommand(interaction, sharedState) {
    const { timezoneManager } = sharedState;

    const currentTimezone = timezoneManager.getGlobalTimezone();
    const currentTime = timezoneManager.getCurrentTime();

    // Create buttons for timezone categories
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('timezone_category_positive')
                .setLabel('UTC+ Timezones')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🌍'),
            new ButtonBuilder()
                .setCustomId('timezone_category_negative')
                .setLabel('UTC- Timezones')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🌎')
        );

    await interaction.reply({
        content: `🕐 **Bot timezone:** ${currentTimezone}\n⏰ **Current time:** ${currentTime}\n\nSelect timezone category:`,
        components: [row],
        ephemeral: true
    });
}

async function handleTimezoneCategorySelect(interaction, sharedState, category) {
    const { timezoneManager } = sharedState;

    await interaction.deferUpdate();

    const currentTimezone = timezoneManager.getGlobalTimezone();
    const timezones = category === 'positive'
        ? timezoneManager.getPositiveTimezones()
        : timezoneManager.getNegativeTimezones();

    // Create select menu with timezones from selected category
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('set_timezone_select')
        .setPlaceholder(`Select timezone (${category === 'positive' ? 'UTC+' : 'UTC-'})`)
        .addOptions(timezones.map(tz => ({
            label: tz.label,
            value: tz.value,
            default: tz.value === currentTimezone
        })));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    // Add back button
    const backButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('timezone_back')
                .setLabel('Back')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('◀️')
        );

    await interaction.editReply({
        content: `🌐 **${category === 'positive' ? 'UTC+' : 'UTC-'} Timezones**\nSelect timezone:`,
        components: [row, backButton]
    });
}

// ==================== BUTTON HANDLERS ====================

async function handleButton(interaction, sharedState) {
    const { logger, userStates } = sharedState;
    const customId = interaction.customId;

    logger.info(`Button: ${customId} by ${interaction.user.tag}`);

    // Board control panel buttons
    if (customId === 'board_new_reminder') {
        await handleNewReminderCommand(interaction, sharedState);
        return;
    }

    if (customId === 'board_set_reminder') {
        await handleSetReminderCommand(interaction, sharedState);
        return;
    }

    if (customId === 'board_edit_reminder') {
        await handleEditReminderCommand(interaction, sharedState);
        return;
    }

    if (customId === 'board_set_timezone') {
        await handleSetTimezoneCommand(interaction, sharedState);
        return;
    }

    // Event management buttons
    if (customId === 'board_add_event') {
        await handleAddEvent(interaction, sharedState);
        return;
    }

    if (customId === 'board_delete_event') {
        await handleDeleteEvent(interaction, sharedState);
        return;
    }

    if (customId === 'board_edit_event') {
        await handleEditEvent(interaction, sharedState);
        return;
    }

    if (customId === 'board_put_list') {
        await handlePutList(interaction, sharedState);
        return;
    }

    // Timezone category selection
    if (customId === 'timezone_category_positive') {
        await handleTimezoneCategorySelect(interaction, sharedState, 'positive');
        return;
    }

    if (customId === 'timezone_category_negative') {
        await handleTimezoneCategorySelect(interaction, sharedState, 'negative');
        return;
    }

    if (customId === 'timezone_back') {
        await handleSetTimezoneCommand(interaction, sharedState);
        return;
    }

    // Template/Scheduled selection in /edit-reminder
    if (customId === 'edit_reminder_templates') {
        await handleEditTemplatesButton(interaction, sharedState);
        return;
    }

    if (customId === 'edit_reminder_scheduled') {
        await handleEditScheduledButton(interaction, sharedState);
        return;
    }

    // Template pagination
    if (customId.startsWith('template_page_')) {
        await handleTemplatePagination(interaction, sharedState);
        return;
    }

    // Template preview actions (approve/cancel/edit)
    if (customId.startsWith('template_preview_approve_')) {
        await handleTemplatePreviewApprove(interaction, sharedState);
        return;
    }

    if (customId.startsWith('template_preview_cancel_')) {
        await handleTemplatePreviewCancel(interaction, sharedState);
        return;
    }

    if (customId.startsWith('template_preview_edit_')) {
        await handleTemplatePreviewEdit(interaction, sharedState);
        return;
    }

    // Scheduled preview actions (approve/cancel/edit)
    if (customId.startsWith('scheduled_preview_approve_')) {
        await handleScheduledPreviewApprove(interaction, sharedState);
        return;
    }

    if (customId.startsWith('scheduled_preview_cancel_')) {
        await handleScheduledPreviewCancel(interaction, sharedState);
        return;
    }

    if (customId.startsWith('scheduled_preview_edit_')) {
        await handleScheduledPreviewEdit(interaction, sharedState);
        return;
    }

    // Edit actions (edit/delete)
    if (customId.startsWith('edit_template_edit_')) {
        await handleEditTemplateEdit(interaction, sharedState);
        return;
    }

    if (customId.startsWith('edit_template_delete_')) {
        await handleEditTemplateDelete(interaction, sharedState);
        return;
    }

    if (customId.startsWith('edit_scheduled_edit_')) {
        await handleEditScheduledEdit(interaction, sharedState);
        return;
    }

    if (customId.startsWith('edit_scheduled_delete_')) {
        await handleEditScheduledDelete(interaction, sharedState);
        return;
    }

    // Board buttons for scheduled
    if (customId.startsWith('scheduled_pause_')) {
        await handleBoardScheduledPause(interaction, sharedState);
        return;
    }

    if (customId.startsWith('scheduled_resume_')) {
        await handleBoardScheduledResume(interaction, sharedState);
        return;
    }

    if (customId.startsWith('scheduled_edit_')) {
        await handleBoardScheduledEdit(interaction, sharedState);
        return;
    }

    if (customId.startsWith('scheduled_delete_')) {
        await handleBoardScheduledDelete(interaction, sharedState);
        return;
    }

    if (customId.startsWith('scheduled_preview_')) {
        await handleBoardScheduledPreview(interaction, sharedState);
        return;
    }

    if (customId.startsWith('scheduled_send_')) {
        await handleBoardScheduledSend(interaction, sharedState);
        return;
    }

    // Confirm delete
    if (customId.startsWith('confirm_delete_template_')) {
        await handleConfirmDeleteTemplate(interaction, sharedState);
        return;
    }

    if (customId.startsWith('confirm_delete_scheduled_')) {
        await handleConfirmDeleteScheduled(interaction, sharedState);
        return;
    }

    if (customId.startsWith('confirm_delete_event_')) {
        await handleConfirmDeleteEvent(interaction, sharedState);
        return;
    }

    if (customId === 'cancel_delete_event') {
        await interaction.update({
            content: '❌ Event deletion cancelled.',
            components: []
        });
        return;
    }

    if (customId.startsWith('cancel_delete_')) {
        await handleCancelDelete(interaction, sharedState);
        return;
    }
}

// ==================== SELECT MENU HANDLERS ====================

async function handleSelectMenu(interaction, sharedState) {
    const { logger } = sharedState;
    const customId = interaction.customId;

    logger.info(`Select Menu: ${customId} by ${interaction.user.tag}`);

    // Type selection for /new-reminder
    if (customId === 'new_reminder_type_select') {
        await handleNewReminderTypeSelect(interaction, sharedState);
        return;
    }

    // Template selection for /set-reminder
    if (customId.startsWith('template_select_set_')) {
        await handleTemplateSelectForSet(interaction, sharedState);
        return;
    }

    // Template selection for /edit-reminder Templates
    if (customId.startsWith('template_select_edit_')) {
        await handleTemplateSelectForEdit(interaction, sharedState);
        return;
    }

    // Scheduled selection for /edit-reminder Scheduled
    if (customId.startsWith('scheduled_select_edit_')) {
        await handleScheduledSelectForEdit(interaction, sharedState);
        return;
    }

    // Timezone selection for /set-time-zone
    if (customId === 'set_timezone_select') {
        await handleTimezoneSelect(interaction, sharedState);
        return;
    }

    // Event delete selection
    if (customId === 'delete_event_select') {
        await handleDeleteEventSelect(interaction, sharedState);
        return;
    }

    // Event edit selection
    if (customId === 'edit_event_select') {
        await handleEditEventSelect(interaction, sharedState);
        return;
    }
}

async function handleNewReminderTypeSelect(interaction, sharedState) {
    const type = interaction.values[0];

    if (type === 'text') {
        const modal = new ModalBuilder()
            .setCustomId('new_reminder_modal_text')
            .setTitle('New template - Text');

        const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Template name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. Boss Reminder')
            .setRequired(true)
            .setMaxLength(100);

        const textInput = new TextInputBuilder()
            .setCustomId('text')
            .setLabel('Message content')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Reminder content...')
            .setRequired(true)
            .setMaxLength(2000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(textInput)
        );

        await interaction.showModal(modal);
    } else if (type === 'embed') {
        const modal = new ModalBuilder()
            .setCustomId('new_reminder_modal_embed')
            .setTitle('New template - Embed');

        const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Template name')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. Boss Event')
            .setRequired(true)
            .setMaxLength(100);

        const titleInput = new TextInputBuilder()
            .setCustomId('embedTitle')
            .setLabel('Embed title')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Embed title (optional)')
            .setRequired(false)
            .setMaxLength(256);

        const descInput = new TextInputBuilder()
            .setCustomId('embedDescription')
            .setLabel('Embed description')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Description...')
            .setRequired(true)
            .setMaxLength(4000);

        const iconInput = new TextInputBuilder()
            .setCustomId('embedIcon')
            .setLabel('Embed icon (URL)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://... (optional)')
            .setRequired(false);

        const colorInput = new TextInputBuilder()
            .setCustomId('embedColor')
            .setLabel('Embed color (hex)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('#5865F2 or 5865F2 (default: #5865F2)')
            .setValue('5865F2')
            .setRequired(false)
            .setMaxLength(7);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(iconInput),
            new ActionRowBuilder().addComponents(colorInput)
        );

        await interaction.showModal(modal);
    }
}

async function handleTemplateSelectForSet(interaction, sharedState) {
    const { notificationManager, timezoneManager, userStates } = sharedState;

    const templateId = interaction.values[0];
    const template = notificationManager.getTemplate(templateId);

    if (!template) {
        await interaction.update({
            content: '❌ Template not found.',
            components: []
        });
        return;
    }

    // Pokaż modal do ustawienia harmonogramu
    // Use bot's global timezone (defaults to UTC if not set)
    const currentTime = timezoneManager.getCurrentTime();

    const modal = new ModalBuilder()
        .setCustomId(`set_reminder_modal_${templateId}`)
        .setTitle('Set schedule');

    const firstTriggerInput = new TextInputBuilder()
        .setCustomId('firstTrigger')
        .setLabel('First trigger (YYYY-MM-DD HH:MM)')
        .setStyle(TextInputStyle.Short)
        .setValue(currentTime)
        .setRequired(true);

    const intervalInput = new TextInputBuilder()
        .setCustomId('interval')
        .setLabel('Repeat interval (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Empty = one-time, or: 1s, 1m, 1h, 1d (max 28d), ee')
        .setRequired(true)
        .setMaxLength(10);

    modal.addComponents(
        new ActionRowBuilder().addComponents(firstTriggerInput),
        new ActionRowBuilder().addComponents(intervalInput)
    );

    await interaction.showModal(modal);
}

async function handleTemplateSelectForEdit(interaction, sharedState) {
    const { notificationManager } = sharedState;

    const templateId = interaction.values[0];
    const template = notificationManager.getTemplate(templateId);

    if (!template) {
        await interaction.update({
            content: '❌ Template not found.',
            components: []
        });
        return;
    }

    await showTemplateEditPreview(interaction, template);
}

async function handleScheduledSelectForEdit(interaction, sharedState) {
    const { notificationManager } = sharedState;

    const scheduledId = interaction.values[0];
    const scheduled = notificationManager.getScheduledWithTemplate(scheduledId);

    if (!scheduled) {
        await interaction.update({
            content: '❌ Scheduled reminder not found.',
            components: []
        });
        return;
    }

    await showScheduledEditPreview(interaction, scheduled, sharedState);
}

async function handleTimezoneSelect(interaction, sharedState) {
    const { timezoneManager, boardManager } = sharedState;

    const selectedTimezone = interaction.values[0];
    await timezoneManager.setGlobalTimezone(selectedTimezone);

    const currentTime = timezoneManager.getCurrentTime();

    // Update control panel to show new timezone
    await boardManager.ensureControlPanel();

    await interaction.update({
        content: `✅ **Bot timezone updated!**\n🕐 **New timezone:** ${selectedTimezone}\n⏰ **Current time:** ${currentTime}\n\n*All users will see times in this timezone.*`,
        components: []
    });
}

// ==================== CHANNEL SELECT MENU ====================

async function handleChannelSelectMenu(interaction, sharedState) {
    const { logger, userStates } = sharedState;
    const customId = interaction.customId;

    logger.info(`Channel Select: ${customId} by ${interaction.user.tag}`);

    if (customId.startsWith('set_reminder_channel_')) {
        const sessionId = customId.replace('set_reminder_channel_', '');
        const userState = userStates.get(interaction.user.id);

        if (!userState || userState.sessionId !== sessionId) {
            await interaction.update({
                content: '❌ Session expired. Start over.',
                components: []
            });
            return;
        }

        const selectedChannel = interaction.channels.first();
        userState.channelId = selectedChannel.id;
        userState.step = 'select_roles';
        userStates.set(interaction.user.id, userState);

        // Pokaż role select
        const roleSelect = new RoleSelectMenuBuilder()
            .setCustomId(`set_reminder_roles_${sessionId}`)
            .setPlaceholder('Select roles to ping (optional)')
            .setMinValues(0)
            .setMaxValues(10);

        const skipButton = new ButtonBuilder()
            .setCustomId(`set_reminder_skip_roles_${sessionId}`)
            .setLabel('Skip - no pings')
            .setStyle(ButtonStyle.Secondary);

        const row1 = new ActionRowBuilder().addComponents(roleSelect);
        const row2 = new ActionRowBuilder().addComponents(skipButton);

        await interaction.update({
            content: `**Step 3/3:** Select roles to ping (optional)\n📍 **Channel:** <#${selectedChannel.id}>`,
            components: [row1, row2]
        });
    }

    if (customId === 'event_list_channel_select') {
        const { eventListManager, boardManager, logger } = sharedState;

        const selectedChannel = interaction.channels.first();

        try {
            const result = await eventListManager.setListChannel(selectedChannel.id);

            // Respond FIRST to avoid timeout (must be <3s)
            // Different message depending on whether it's the same channel
            if (result.sameChannel) {
                await interaction.update({
                    content: `ℹ️ **Events list is already on this channel!**\n📍 **Channel:** <#${selectedChannel.id}>`,
                    components: []
                });
            } else {
                await interaction.update({
                    content: `✅ **Events list channel set!**\n📍 **Channel:** <#${selectedChannel.id}>\n\nThe events list will be displayed there.`,
                    components: []
                });
            }

            logger.success(`Events list channel set to: ${selectedChannel.name}`);

            // Update control panel AFTER responding (can take >3s if searching)
            await boardManager.updateControlPanel();
        } catch (error) {
            logger.error('Failed to set events list channel:', error);
            await interaction.update({
                content: '❌ Failed to set events list channel.',
                components: []
            });
        }
    }
}

// ==================== ROLE SELECT MENU ====================

async function handleRoleSelectMenu(interaction, sharedState) {
    const { logger, userStates } = sharedState;
    const customId = interaction.customId;

    logger.info(`Role Select: ${customId} by ${interaction.user.tag}`);

    if (customId.startsWith('set_reminder_skip_roles_')) {
        await interaction.deferUpdate();

        const sessionId = customId.replace('set_reminder_skip_roles_', '');
        const userState = userStates.get(interaction.user.id);

        if (!userState || userState.sessionId !== sessionId) {
            await interaction.editReply({
                content: '❌ Session expired. Start over.',
                components: []
            });
            return;
        }

        userState.roles = []; // No roles selected

        await createScheduledFromUserState(interaction, sharedState, userState);
    }

    if (customId.startsWith('set_reminder_roles_')) {
        await interaction.deferUpdate();

        const sessionId = customId.replace('set_reminder_roles_', '');
        const userState = userStates.get(interaction.user.id);

        if (!userState || userState.sessionId !== sessionId) {
            await interaction.editReply({
                content: '❌ Session expired. Start over.',
                components: []
            });
            return;
        }

        const selectedRoles = interaction.roles.map(r => r.id);
        userState.roles = selectedRoles;

        await createScheduledFromUserState(interaction, sharedState, userState);
    }
}

// ==================== MODAL SUBMIT HANDLERS ====================

async function handleModalSubmit(interaction, sharedState) {
    const { notificationManager, boardManager, logger, userStates } = sharedState;
    const customId = interaction.customId;

    logger.info(`Modal Submit: ${customId} by ${interaction.user.tag}`);

    await interaction.deferReply({ ephemeral: true });

    try {
        // New reminder - Text
        if (customId === 'new_reminder_modal_text') {
            const name = interaction.fields.getTextInputValue('name');
            const text = interaction.fields.getTextInputValue('text');

            const sessionId = Date.now().toString();
            userStates.set(interaction.user.id, {
                sessionId,
                type: 'text',
                name,
                text
            });

            await showTemplatePreview(interaction, { type: 'text', name, text }, sessionId);
        }
        // New reminder - Embed
        else if (customId === 'new_reminder_modal_embed') {
            const name = interaction.fields.getTextInputValue('name');
            const embedTitle = interaction.fields.getTextInputValue('embedTitle');
            const embedDescription = interaction.fields.getTextInputValue('embedDescription');
            const embedIcon = interaction.fields.getTextInputValue('embedIcon') || null;
            let embedColor = interaction.fields.getTextInputValue('embedColor') || '5865F2';

            // Parse hex color - remove # if present
            embedColor = embedColor.replace('#', '').toUpperCase();

            // Validate hex color (6 characters, 0-9 A-F)
            if (!/^[0-9A-F]{6}$/.test(embedColor)) {
                await interaction.reply({
                    content: '❌ Invalid hex color format. Use 6 characters (e.g., 5865F2 or #5865F2)',
                    ephemeral: true
                });
                return;
            }

            const sessionId = Date.now().toString();
            userStates.set(interaction.user.id, {
                sessionId,
                type: 'embed',
                name,
                embedTitle,
                embedDescription,
                embedIcon,
                embedColor
            });

            await showTemplatePreview(interaction, {
                type: 'embed',
                name,
                embedTitle,
                embedDescription,
                embedIcon,
                embedColor
            }, sessionId);
        }
        // Set reminder schedule
        else if (customId.startsWith('set_reminder_modal_')) {
            const templateId = customId.replace('set_reminder_modal_', '');
            const firstTriggerStr = interaction.fields.getTextInputValue('firstTrigger');
            const interval = interaction.fields.getTextInputValue('interval');

            // Parse firstTrigger
            const firstTrigger = new Date(firstTriggerStr);
            if (isNaN(firstTrigger.getTime())) {
                await interaction.editReply({
                    content: '❌ Invalid date format. Use: YYYY-MM-DD HH:MM (e.g. 2026-03-20 10:00)'
                });
                return;
            }

            if (firstTrigger < new Date()) {
                await interaction.editReply({
                    content: '❌ First trigger date cannot be in the past.'
                });
                return;
            }

            // Validate interval (optional - empty = one-time)
            if (!notificationManager.validateInterval(interval)) {
                await interaction.editReply({
                    content: '❌ Invalid interval format. Use: 1s, 1m, 1h, 1d (max 28d), "ee", or leave empty for one-time reminder.'
                });
                return;
            }

            // If interval provided, check limit
            if (interval && interval.trim() !== '') {
                const intervalMs = notificationManager.parseInterval(interval);
                const maxInterval = 28 * 24 * 60 * 60 * 1000;
                if (intervalMs && intervalMs > maxInterval) {
                    await interaction.editReply({
                        content: '❌ Interval cannot exceed 28 days.'
                    });
                    return;
                }
            }

            // Store in user state for channel/role selection
            const sessionId = Date.now().toString();
            userStates.set(interaction.user.id, {
                sessionId,
                templateId,
                firstTrigger: firstTrigger.toISOString(),
                interval,
                step: 'select_channel'
            });

            // Show channel select
            const channelSelect = new ChannelSelectMenuBuilder()
                .setCustomId(`set_reminder_channel_${sessionId}`)
                .setPlaceholder('Select channel for reminders')
                .setChannelTypes([ChannelType.GuildText]);

            const row = new ActionRowBuilder().addComponents(channelSelect);

            await interaction.editReply({
                content: '**Step 2/3:** Select the channel where notifications will be sent',
                components: [row]
            });
        }
        // Edit template
        else if (customId.startsWith('edit_template_modal_')) {
            const templateId = customId.replace('edit_template_modal_', '');
            const template = notificationManager.getTemplate(templateId);

            if (!template) {
                await interaction.editReply({ content: '❌ Template not found.' });
                return;
            }

            if (template.type === 'text') {
                const name = interaction.fields.getTextInputValue('name');
                const text = interaction.fields.getTextInputValue('text');

                await notificationManager.updateTemplate(templateId, { name, text });
                await interaction.editReply({
                    content: `✅ Template **${name}** has been updated!`,
                    components: []
                });

                // Update control panel to show updated template
                await boardManager.ensureControlPanel();
            } else {
                const name = interaction.fields.getTextInputValue('name');
                const embedTitle = interaction.fields.getTextInputValue('embedTitle');
                const embedDescription = interaction.fields.getTextInputValue('embedDescription');
                const embedIcon = interaction.fields.getTextInputValue('embedIcon') || null;
                let embedColor = interaction.fields.getTextInputValue('embedColor') || '5865F2';

                // Parse hex color - remove # if present
                embedColor = embedColor.replace('#', '').toUpperCase();

                // Validate hex color (6 characters, 0-9 A-F)
                if (!/^[0-9A-F]{6}$/.test(embedColor)) {
                    await interaction.editReply({
                        content: '❌ Invalid hex color format. Use 6 characters (e.g., 5865F2 or #5865F2)',
                        components: []
                    });
                    return;
                }

                await notificationManager.updateTemplate(templateId, {
                    name,
                    embedTitle,
                    embedDescription,
                    embedIcon,
                    embedColor
                });
                await interaction.editReply({
                    content: `✅ Template **${name}** has been updated!`,
                    components: []
                });

                // Update control panel to show updated template
                await boardManager.ensureControlPanel();
            }

            logger.success(`Updated template ${templateId}`);
        }
        // Edit scheduled
        else if (customId.startsWith('edit_scheduled_modal_')) {
            const scheduledId = customId.replace('edit_scheduled_modal_', '');
            const scheduled = notificationManager.getScheduled(scheduledId);

            if (!scheduled) {
                await interaction.editReply({ content: '❌ Scheduled reminder not found.' });
                return;
            }

            const firstTriggerStr = interaction.fields.getTextInputValue('firstTrigger');
            const interval = interaction.fields.getTextInputValue('interval');

            // Parse firstTrigger
            const firstTrigger = new Date(firstTriggerStr);
            if (isNaN(firstTrigger.getTime())) {
                await interaction.editReply({
                    content: '❌ Invalid date format. Use: YYYY-MM-DD HH:MM'
                });
                return;
            }

            // Validate interval (optional - empty = one-time)
            if (!notificationManager.validateInterval(interval)) {
                await interaction.editReply({
                    content: '❌ Invalid interval format. Use: 1s, 1m, 1h, 1d (max 28d), "ee", or leave empty for one-time reminder.'
                });
                return;
            }

            // If interval provided, check limit
            if (interval && interval.trim() !== '') {
                const intervalMs = notificationManager.parseInterval(interval);
                const maxInterval = 28 * 24 * 60 * 60 * 1000;
                if (intervalMs && intervalMs > maxInterval) {
                    await interaction.editReply({
                        content: '❌ Interval cannot exceed 28 days.'
                    });
                    return;
                }
            }

            await notificationManager.updateScheduled(scheduledId, {
                firstTrigger: firstTrigger.toISOString(),
                interval,
                intervalMs,
                nextTrigger: firstTrigger.toISOString()
            });

            // Update board
            const { boardManager } = sharedState;
            const updated = notificationManager.getScheduledWithTemplate(scheduledId);
            await boardManager.updateEmbed(updated);

            await interaction.editReply({
                content: `✅ Scheduled reminder **${scheduledId}** has been updated!`,
                components: []
            });

            logger.success(`Updated scheduled ${scheduledId}`);
        }
        // Add event
        else if (customId === 'add_event_modal') {
            const { eventManager, eventListManager } = sharedState;

            const name = interaction.fields.getTextInputValue('name');
            const firstTriggerStr = interaction.fields.getTextInputValue('firstTrigger');
            const interval = interaction.fields.getTextInputValue('interval');

            // Parse firstTrigger
            const firstTrigger = new Date(firstTriggerStr);
            if (isNaN(firstTrigger.getTime())) {
                await interaction.editReply({
                    content: '❌ Invalid date format. Use: YYYY-MM-DD HH:MM (e.g. 2026-03-20 10:00)'
                });
                return;
            }

            if (firstTrigger < new Date()) {
                await interaction.editReply({
                    content: '❌ First trigger date cannot be in the past.'
                });
                return;
            }

            // Validate interval
            if (!eventManager.validateInterval(interval)) {
                await interaction.editReply({
                    content: '❌ Invalid interval format. Use: 1s, 1m, 1h, 1d (max 28d), "ee", or leave empty for one-time reminder. or "ee"'
                });
                return;
            }

            try {
                const event = await eventManager.createEvent(
                    interaction.user.id,
                    name,
                    firstTrigger,
                    interval
                );

                // Update events list
                await eventListManager.ensureEventsList();

                await interaction.editReply({
                    content: `✅ **Event created!**\n📅 **Name:** ${name}\n🆔 **ID:** ${event.id}\n⏰ **Next trigger:** <t:${Math.floor(new Date(event.nextTrigger).getTime() / 1000)}:F>`
                });

                logger.success(`Created event ${event.id}`);
            } catch (error) {
                logger.error('Failed to create event:', error);
                await interaction.editReply({
                    content: `❌ Error: ${error.message}`
                });
            }
        }
        // Edit event
        else if (customId.startsWith('edit_event_modal_')) {
            const { eventManager, eventListManager } = sharedState;

            const eventId = customId.replace('edit_event_modal_', '');
            const event = eventManager.getEvent(eventId);

            if (!event) {
                await interaction.editReply({ content: '❌ Event not found.' });
                return;
            }

            const name = interaction.fields.getTextInputValue('name');
            const firstTriggerStr = interaction.fields.getTextInputValue('firstTrigger');
            const interval = interaction.fields.getTextInputValue('interval');

            // Parse firstTrigger
            const firstTrigger = new Date(firstTriggerStr);
            if (isNaN(firstTrigger.getTime())) {
                await interaction.editReply({
                    content: '❌ Invalid date format. Use: YYYY-MM-DD HH:MM'
                });
                return;
            }

            // Validate interval
            if (!eventManager.validateInterval(interval)) {
                await interaction.editReply({
                    content: '❌ Invalid interval format. Use: 1s, 1m, 1h, 1d (max 28d), "ee", or leave empty for one-time reminder. or "ee"'
                });
                return;
            }

            const intervalMs = eventManager.parseInterval(interval);

            await eventManager.updateEvent(eventId, {
                name,
                firstTrigger: firstTrigger.toISOString(),
                interval,
                intervalMs,
                nextTrigger: firstTrigger.toISOString()
            });

            // Update events list
            await eventListManager.ensureEventsList();

            await interaction.editReply({
                content: `✅ Event **${name}** has been updated!`,
                components: []
            });

            logger.success(`Updated event ${eventId}`);
        }

    } catch (error) {
        logger.error('Error handling modal submit:', error);
        await interaction.editReply({ content: '❌ An error occurred during processing.' });
    }
}

// ==================== HELPER FUNCTIONS ====================

async function showTemplatePreview(interaction, data, sessionId) {
    let previewContent = '**Template Preview:**\n\n';
    previewContent += `📝 **Name:** ${data.name}\n`;
    previewContent += `📋 **Type:** ${data.type === 'text' ? 'Text' : 'Embed'}\n\n`;
    previewContent += '**How the reminder will look:**';

    const embeds = [];
    if (data.type === 'text') {
        previewContent += `\n\n${data.text}`;
    } else {
        const colorHex = parseInt(data.embedColor || '5865F2', 16);
        const embed = new EmbedBuilder()
            .setDescription(data.embedDescription)
            .setColor(colorHex);

        if (data.embedTitle) embed.setTitle(data.embedTitle);
        if (data.embedIcon) embed.setThumbnail(data.embedIcon);

        embeds.push(embed);
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`template_preview_approve_${sessionId}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✔️'),
            new ButtonBuilder()
                .setCustomId(`template_preview_cancel_${sessionId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('✖️'),
            new ButtonBuilder()
                .setCustomId(`template_preview_edit_${sessionId}`)
                .setLabel('Edit')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝')
        );

    await interaction.editReply({
        content: previewContent,
        embeds,
        components: [row]
    });
}

async function showTemplateEditPreview(interaction, template) {
    let content = '**Edit Template:**\n\n';
    content += `📝 **Name:** ${template.name}\n`;
    content += `📋 **Type:** ${template.type === 'text' ? 'Text' : 'Embed'}\n`;
    content += `🆔 **ID:** ${template.id}\n\n`;
    content += '**Preview:**';

    const embeds = [];
    if (template.type === 'text') {
        content += `\n\n${template.text}`;
    } else {
        const colorHex = parseInt(template.embedColor || '5865F2', 16);
        const embed = new EmbedBuilder()
            .setDescription(template.embedDescription)
            .setColor(colorHex);

        if (template.embedTitle) embed.setTitle(template.embedTitle);
        if (template.embedIcon) embed.setThumbnail(template.embedIcon);

        embeds.push(embed);
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`edit_template_edit_${template.id}`)
                .setLabel('Edit')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✏️'),
            new ButtonBuilder()
                .setCustomId(`edit_template_delete_${template.id}`)
                .setLabel('Delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

    await interaction.update({
        content,
        embeds,
        components: [row]
    });
}

async function showScheduledEditPreview(interaction, scheduled, sharedState) {
    const { notificationManager } = sharedState;

    const template = scheduled.template;
    const nextTriggerDate = new Date(scheduled.nextTrigger);
    const nextTriggerTimestamp = Math.floor(nextTriggerDate.getTime() / 1000);

    let content = '**Scheduled Reminder:**\n\n';
    content += `⏰ **ID:** ${scheduled.id}\n`;
    content += `📝 **Template:** ${template.name}\n`;
    content += `📅 **First trigger:** ${new Date(scheduled.firstTrigger).toLocaleString('en-US')}\n`;
    content += `🔄 **Interval:** ${notificationManager.formatInterval(scheduled.interval)}\n`;
    content += `⏭️ **Next trigger:** <t:${nextTriggerTimestamp}:F> (<t:${nextTriggerTimestamp}:R>)\n`;
    content += `📍 **Channel:** <#${scheduled.channelId}>\n`;
    content += `👥 **Roles:** ${scheduled.roles.length > 0 ? scheduled.roles.map(r => `<@&${r}>`).join(', ') : 'None'}\n`;
    content += `📊 **Status:** ${scheduled.status === 'active' ? '🟢 Active' : '⏸️ Paused'}\n\n`;
    content += '**Message preview:**';

    const embeds = [];
    if (template.type === 'text') {
        content += `\n\n${template.text}`;
    } else {
        const colorHex = parseInt(template.embedColor || '5865F2', 16);
        const embed = new EmbedBuilder()
            .setDescription(template.embedDescription)
            .setColor(colorHex);

        if (template.embedTitle) embed.setTitle(template.embedTitle);
        if (template.embedIcon) embed.setThumbnail(template.embedIcon);

        embeds.push(embed);
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`edit_scheduled_edit_${scheduled.id}`)
                .setLabel('Edit')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✏️'),
            new ButtonBuilder()
                .setCustomId(`edit_scheduled_delete_${scheduled.id}`)
                .setLabel('Delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

    await interaction.update({
        content,
        embeds,
        components: [row]
    });
}

async function createScheduledFromUserState(interaction, sharedState, userState) {
    const { notificationManager, boardManager, logger, userStates } = sharedState;

    try {
        const scheduled = await notificationManager.createScheduled(
            interaction.user.id,
            userState.templateId,
            userState.firstTrigger,
            userState.interval,
            userState.channelId,
            userState.roles || []
        );

        // Get scheduled with template for board embed
        const scheduledWithTemplate = notificationManager.getScheduledWithTemplate(scheduled.id);
        logger.info(`Creating board embed for ${scheduled.id} - has template: ${!!scheduledWithTemplate?.template}`);
        const embedResult = await boardManager.createEmbed(scheduledWithTemplate);
        logger.info(`Board embed creation result: ${embedResult ? 'success' : 'failed'}`);

        userStates.delete(interaction.user.id);

        const template = notificationManager.getTemplate(userState.templateId);
        const nextTriggerDate = new Date(scheduled.nextTrigger);
        const nextTriggerTimestamp = Math.floor(nextTriggerDate.getTime() / 1000);

        let content = '✅ **Scheduled reminder created!**\n\n';
        content += `⏰ **ID:** ${scheduled.id}\n`;
        content += `📝 **Template:** ${template.name}\n`;
        content += `📅 **First trigger:** <t:${nextTriggerTimestamp}:F>\n`;
        content += `🔄 **Interval:** ${notificationManager.formatInterval(scheduled.interval)}\n`;
        content += `📍 **Channel:** <#${userState.channelId}>\n`;
        content += `👥 **Roles:** ${userState.roles && userState.roles.length > 0 ? userState.roles.map(r => `<@&${r}>`).join(', ') : 'None'}`;

        await interaction.editReply({
            content,
            components: []
        });

        logger.success(`Created scheduled reminder ${scheduled.id}`);
    } catch (error) {
        logger.error('Error creating scheduled reminder:', error);
        await interaction.editReply({
            content: `❌ Error: ${error.message}`,
            components: []
        });
    }
}

// ==================== BUTTON ACTION HANDLERS ====================

async function handleTemplatePreviewApprove(interaction, sharedState) {
    const { notificationManager, boardManager, userStates, logger } = sharedState;

    await interaction.deferUpdate();

    const sessionId = interaction.customId.replace('template_preview_approve_', '');
    const userState = userStates.get(interaction.user.id);

    if (!userState || userState.sessionId !== sessionId) {
        await interaction.editReply({
            content: '❌ Session expired.',
            embeds: [],
            components: []
        });
        return;
    }

    try {
        let template;
        if (userState.type === 'text') {
            template = await notificationManager.createTemplate(
                interaction.user.id,
                userState.name,
                'text',
                { text: userState.text }
            );
        } else {
            template = await notificationManager.createTemplate(
                interaction.user.id,
                userState.name,
                'embed',
                {
                    embedTitle: userState.embedTitle,
                    embedDescription: userState.embedDescription,
                    embedIcon: userState.embedIcon,
                    embedColor: userState.embedColor
                }
            );
        }

        userStates.delete(interaction.user.id);

        await interaction.editReply({
            content: `✅ Template **${template.name}** has been created!\n🆔 ID: ${template.id}\n\nUse \`/set-reminder\` to schedule reminders.`,
            embeds: [],
            components: []
        });

        // Update control panel to show new template
        await boardManager.ensureControlPanel();

        logger.success(`Created template ${template.id}`);
    } catch (error) {
        logger.error('Error creating template:', error);
        await interaction.editReply({
            content: '❌ Error creating template.',
            embeds: [],
            components: []
        });
    }
}

async function handleTemplatePreviewCancel(interaction, sharedState) {
    const { userStates } = sharedState;

    const sessionId = interaction.customId.replace('template_preview_cancel_', '');
    userStates.delete(interaction.user.id);

    await interaction.update({
        content: '❌ Template creation cancelled.',
        embeds: [],
        components: []
    });
}

async function handleTemplatePreviewEdit(interaction, sharedState) {
    const { userStates } = sharedState;

    const sessionId = interaction.customId.replace('template_preview_edit_', '');
    const userState = userStates.get(interaction.user.id);

    if (!userState || userState.sessionId !== sessionId) {
        await interaction.update({
            content: '❌ Session expired.',
            embeds: [],
            components: []
        });
        return;
    }

    if (userState.type === 'text') {
        const modal = new ModalBuilder()
            .setCustomId('new_reminder_modal_text')
            .setTitle('Edit template - Text');

        const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Template name')
            .setStyle(TextInputStyle.Short)
            .setValue(userState.name)
            .setRequired(true)
            .setMaxLength(100);

        const textInput = new TextInputBuilder()
            .setCustomId('text')
            .setLabel('Message content')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(userState.text)
            .setRequired(true)
            .setMaxLength(2000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(textInput)
        );

        await interaction.showModal(modal);
    } else {
        const modal = new ModalBuilder()
            .setCustomId('new_reminder_modal_embed')
            .setTitle('Edit template - Embed');

        const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Template name')
            .setStyle(TextInputStyle.Short)
            .setValue(userState.name)
            .setRequired(true)
            .setMaxLength(100);

        const titleInput = new TextInputBuilder()
            .setCustomId('embedTitle')
            .setLabel('Embed title')
            .setStyle(TextInputStyle.Short)
            .setValue(userState.embedTitle || '')
            .setRequired(false)
            .setMaxLength(256);

        const descInput = new TextInputBuilder()
            .setCustomId('embedDescription')
            .setLabel('Embed description')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(userState.embedDescription)
            .setRequired(true)
            .setMaxLength(4000);

        const iconInput = new TextInputBuilder()
            .setCustomId('embedIcon')
            .setLabel('Embed icon (URL)')
            .setStyle(TextInputStyle.Short)
            .setValue(userState.embedIcon || '')
            .setRequired(false);

        const colorInput = new TextInputBuilder()
            .setCustomId('embedColor')
            .setLabel('Embed color (hex)')
            .setStyle(TextInputStyle.Short)
            .setValue(userState.embedColor || '5865F2')
            .setPlaceholder('#5865F2 or 5865F2')
            .setRequired(false)
            .setMaxLength(7);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(iconInput),
            new ActionRowBuilder().addComponents(colorInput)
        );

        await interaction.showModal(modal);
    }
}

async function handleScheduledPreviewApprove(interaction, sharedState) {
    // Placeholder - not used in current flow
    await interaction.update({
        content: '✅ Zatwierdzone',
        components: []
    });
}

async function handleScheduledPreviewCancel(interaction, sharedState) {
    // Placeholder - not used in current flow
    await interaction.update({
        content: '❌ Cancelled',
        components: []
    });
}

async function handleScheduledPreviewEdit(interaction, sharedState) {
    // Placeholder - not used in current flow
    await interaction.reply({
        content: '✏️ Edycja...',
        ephemeral: true
    });
}

async function handleEditTemplatesButton(interaction, sharedState) {
    const { notificationManager } = sharedState;

    const templates = notificationManager.getAllTemplates();

    if (templates.length === 0) {
        await interaction.update({
            content: '❌ No templates found. Use `/new-reminder` to create a template.',
            components: []
        });
        return;
    }

    const ITEMS_PER_PAGE = 25;
    const totalPages = Math.ceil(templates.length / ITEMS_PER_PAGE);

    await showTemplateSelectPage(interaction, sharedState, 0, totalPages, templates, 'edit');
}

async function handleEditScheduledButton(interaction, sharedState) {
    const { notificationManager } = sharedState;

    const scheduled = notificationManager.getAllScheduled();

    if (scheduled.length === 0) {
        await interaction.update({
            content: '❌ No scheduled reminders found. Use `/set-reminder` to create one.',
            components: []
        });
        return;
    }

    const ITEMS_PER_PAGE = 25;
    const totalPages = Math.ceil(scheduled.length / ITEMS_PER_PAGE);
    const page = 0;
    const start = page * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, scheduled.length);
    const pageScheduled = scheduled.slice(start, end);

    const options = pageScheduled.map(s => {
        const template = notificationManager.getTemplate(s.templateId);
        const templateName = template ? template.name : 'Unknown';
        return {
            label: `⏰ ${templateName}`.substring(0, 100),
            description: `ID: ${s.id} - Następny: ${new Date(s.nextTrigger).toLocaleString('pl-PL')}`.substring(0, 100),
            value: s.id
        };
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`scheduled_select_edit_${page}`)
        .setPlaceholder(`Select zaplanowane przypomnienie (${scheduled.length} total)`)
        .addOptions(options);

    const rows = [new ActionRowBuilder().addComponents(selectMenu)];

    // Pagination
    if (totalPages > 1) {
        const paginationRow = new ActionRowBuilder();

        if (page > 0) {
            paginationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`scheduled_page_edit_${page - 1}`)
                    .setLabel('◀ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        paginationRow.addComponents(
            new ButtonBuilder()
                .setCustomId('page_info')
                .setLabel(`Page ${page + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );

        if (page < totalPages - 1) {
            paginationRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`scheduled_page_edit_${page + 1}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        rows.push(paginationRow);
    }

    await interaction.update({
        content: `**Select zaplanowane przypomnienie** (${scheduled.length} total)`,
        components: rows
    });
}

async function handleTemplatePagination(interaction, sharedState) {
    const { notificationManager } = sharedState;

    const parts = interaction.customId.split('_');
    const action = parts[2]; // 'set' or 'edit'
    const page = parseInt(parts[3]);

    const templates = notificationManager.getAllTemplates();
    const ITEMS_PER_PAGE = 25;
    const totalPages = Math.ceil(templates.length / ITEMS_PER_PAGE);

    await showTemplateSelectPage(interaction, sharedState, page, totalPages, templates, action);
}

async function handleEditTemplateEdit(interaction, sharedState) {
    const { notificationManager } = sharedState;

    const templateId = interaction.customId.replace('edit_template_edit_', '');
    const template = notificationManager.getTemplate(templateId);

    if (!template) {
        await interaction.update({
            content: '❌ Template not found.',
            components: []
        });
        return;
    }

    if (template.type === 'text') {
        const modal = new ModalBuilder()
            .setCustomId(`edit_template_modal_${templateId}`)
            .setTitle('Edit template - Text');

        const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Template name')
            .setStyle(TextInputStyle.Short)
            .setValue(template.name)
            .setRequired(true)
            .setMaxLength(100);

        const textInput = new TextInputBuilder()
            .setCustomId('text')
            .setLabel('Message content')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(template.text)
            .setRequired(true)
            .setMaxLength(2000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(textInput)
        );

        await interaction.showModal(modal);
    } else {
        const modal = new ModalBuilder()
            .setCustomId(`edit_template_modal_${templateId}`)
            .setTitle('Edit template - Embed');

        const nameInput = new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Template name')
            .setStyle(TextInputStyle.Short)
            .setValue(template.name)
            .setRequired(true)
            .setMaxLength(100);

        const titleInput = new TextInputBuilder()
            .setCustomId('embedTitle')
            .setLabel('Embed title')
            .setStyle(TextInputStyle.Short)
            .setValue(template.embedTitle || '')
            .setRequired(false)
            .setMaxLength(256);

        const descInput = new TextInputBuilder()
            .setCustomId('embedDescription')
            .setLabel('Embed description')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(template.embedDescription)
            .setRequired(true)
            .setMaxLength(4000);

        const iconInput = new TextInputBuilder()
            .setCustomId('embedIcon')
            .setLabel('Embed icon (URL)')
            .setStyle(TextInputStyle.Short)
            .setValue(template.embedIcon || '')
            .setRequired(false);

        const colorInput = new TextInputBuilder()
            .setCustomId('embedColor')
            .setLabel('Embed color (hex)')
            .setStyle(TextInputStyle.Short)
            .setValue(template.embedColor || '5865F2')
            .setPlaceholder('#5865F2 or 5865F2')
            .setRequired(false)
            .setMaxLength(7);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(iconInput),
            new ActionRowBuilder().addComponents(colorInput)
        );

        await interaction.showModal(modal);
    }
}

async function handleEditTemplateDelete(interaction, sharedState) {
    const templateId = interaction.customId.replace('edit_template_delete_', '');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_delete_template_${templateId}`)
                .setLabel('Yes, delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId(`cancel_delete_${templateId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.update({
        content: '⚠️ **Are you sure you want to delete this template?**\n\nWarning: All scheduled reminders using this template will also be deleted!',
        embeds: [],
        components: [row]
    });
}

async function handleEditScheduledEdit(interaction, sharedState) {
    const { notificationManager } = sharedState;

    const scheduledId = interaction.customId.replace('edit_scheduled_edit_', '');
    const scheduled = notificationManager.getScheduled(scheduledId);

    if (!scheduled) {
        await interaction.update({
            content: '❌ Scheduled reminder not found.',
            components: []
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`edit_scheduled_modal_${scheduledId}`)
        .setTitle('Edit scheduled reminder');

    const firstTriggerDate = new Date(scheduled.firstTrigger);
    const formattedDate = `${firstTriggerDate.getFullYear()}-${String(firstTriggerDate.getMonth() + 1).padStart(2, '0')}-${String(firstTriggerDate.getDate()).padStart(2, '0')} ${String(firstTriggerDate.getHours()).padStart(2, '0')}:${String(firstTriggerDate.getMinutes()).padStart(2, '0')}`;

    const firstTriggerInput = new TextInputBuilder()
        .setCustomId('firstTrigger')
        .setLabel('First trigger (YYYY-MM-DD HH:MM)')
        .setStyle(TextInputStyle.Short)
        .setValue(formattedDate)
        .setRequired(true);

    const intervalInput = new TextInputBuilder()
        .setCustomId('interval')
        .setLabel('Repeat interval (optional)')
        .setStyle(TextInputStyle.Short)
        .setValue(scheduled.interval)
        .setRequired(true)
        .setMaxLength(10);

    modal.addComponents(
        new ActionRowBuilder().addComponents(firstTriggerInput),
        new ActionRowBuilder().addComponents(intervalInput)
    );

    await interaction.showModal(modal);
}

async function handleEditScheduledDelete(interaction, sharedState) {
    const scheduledId = interaction.customId.replace('edit_scheduled_delete_', '');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_delete_scheduled_${scheduledId}`)
                .setLabel('Yes, delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId(`cancel_delete_${scheduledId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.update({
        content: '⚠️ **Are you sure you want to delete this scheduled reminder?**',
        embeds: [],
        components: [row]
    });
}

async function handleConfirmDeleteTemplate(interaction, sharedState) {
    const { notificationManager, boardManager, logger } = sharedState;

    await interaction.deferUpdate();

    const templateId = interaction.customId.replace('confirm_delete_template_', '');

    try {
        await notificationManager.deleteTemplate(templateId);

        await interaction.editReply({
            content: `✅ Template **${templateId}** and all associated scheduled reminders have been deleted.`,
            embeds: [],
            components: []
        });

        // Update control panel to remove deleted template
        await boardManager.ensureControlPanel();

        logger.success(`Deleted template ${templateId}`);
    } catch (error) {
        logger.error('Error deleting template:', error);
        await interaction.editReply({
            content: '❌ Error deleting template.',
            embeds: [],
            components: []
        });
    }
}

async function handleConfirmDeleteScheduled(interaction, sharedState) {
    const { notificationManager, boardManager, logger } = sharedState;

    await interaction.deferUpdate();

    const scheduledId = interaction.customId.replace('confirm_delete_scheduled_', '');

    try {
        const scheduled = notificationManager.getScheduled(scheduledId);
        if (scheduled) {
            await boardManager.deleteEmbed(scheduled);
        }

        await notificationManager.deleteScheduled(scheduledId);

        await interaction.editReply({
            content: `✅ Scheduled reminder **${scheduledId}** has been deleted.`,
            embeds: [],
            components: []
        });

        logger.success(`Deleted scheduled ${scheduledId}`);
    } catch (error) {
        logger.error('Error deleting scheduled:', error);
        await interaction.editReply({
            content: '❌ Error deleting scheduled reminder.',
            embeds: [],
            components: []
        });
    }
}

async function handleConfirmDeleteEvent(interaction, sharedState) {
    const { eventManager, eventListManager, logger } = sharedState;

    await interaction.deferUpdate();

    const eventId = interaction.customId.replace('confirm_delete_event_', '');

    try {
        await eventManager.deleteEvent(eventId);

        // Update events list
        await eventListManager.ensureEventsList();

        await interaction.editReply({
            content: `✅ Event **${eventId}** has been deleted.`,
            embeds: [],
            components: []
        });

        logger.success(`Deleted event ${eventId}`);
    } catch (error) {
        logger.error('Error deleting event:', error);
        await interaction.editReply({
            content: '❌ Error deleting event.',
            embeds: [],
            components: []
        });
    }
}

async function handleCancelDelete(interaction, sharedState) {
    await interaction.update({
        content: '❌ Cancelled usuwanie.',
        embeds: [],
        components: []
    });
}

// ==================== BOARD BUTTON HANDLERS ====================

async function handleBoardScheduledPause(interaction, sharedState) {
    const { notificationManager, boardManager, logger } = sharedState;

    await interaction.deferUpdate();

    const scheduledId = interaction.customId.replace('scheduled_pause_', '');

    try {
        await notificationManager.pauseScheduled(scheduledId);

        const updated = notificationManager.getScheduledWithTemplate(scheduledId);
        await boardManager.updateEmbed(updated);
        await boardManager.updateControlPanel();

        await interaction.followUp({
            content: `⏸️ Scheduled reminder **${scheduledId}** has been paused.`,
            ephemeral: true
        });

        logger.success(`Paused scheduled ${scheduledId} from board`);
    } catch (error) {
        logger.error('Error pausing scheduled:', error);
        await interaction.followUp({
            content: '❌ Error pausing reminder.',
            ephemeral: true
        });
    }
}

async function handleBoardScheduledResume(interaction, sharedState) {
    const { notificationManager, boardManager, logger } = sharedState;

    await interaction.deferUpdate();

    const scheduledId = interaction.customId.replace('scheduled_resume_', '');

    try {
        await notificationManager.resumeScheduled(scheduledId);

        const updated = notificationManager.getScheduledWithTemplate(scheduledId);
        await boardManager.updateEmbed(updated);
        await boardManager.updateControlPanel();

        await interaction.followUp({
            content: `▶️ Scheduled reminder **${scheduledId}** has been resumed.`,
            ephemeral: true
        });

        logger.success(`Resumed scheduled ${scheduledId} from board`);
    } catch (error) {
        logger.error('Error resuming scheduled:', error);
        await interaction.followUp({
            content: '❌ Error resuming reminder.',
            ephemeral: true
        });
    }
}

async function handleBoardScheduledEdit(interaction, sharedState) {
    const { notificationManager } = sharedState;

    const scheduledId = interaction.customId.replace('scheduled_edit_', '');
    const scheduled = notificationManager.getScheduled(scheduledId);

    if (!scheduled) {
        await interaction.reply({
            content: '❌ Scheduled reminder not found.',
            ephemeral: true
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`edit_scheduled_modal_${scheduledId}`)
        .setTitle('Edit scheduled reminder');

    const firstTriggerDate = new Date(scheduled.firstTrigger);
    const formattedDate = `${firstTriggerDate.getFullYear()}-${String(firstTriggerDate.getMonth() + 1).padStart(2, '0')}-${String(firstTriggerDate.getDate()).padStart(2, '0')} ${String(firstTriggerDate.getHours()).padStart(2, '0')}:${String(firstTriggerDate.getMinutes()).padStart(2, '0')}`;

    const firstTriggerInput = new TextInputBuilder()
        .setCustomId('firstTrigger')
        .setLabel('First trigger (YYYY-MM-DD HH:MM)')
        .setStyle(TextInputStyle.Short)
        .setValue(formattedDate)
        .setRequired(true);

    const intervalInput = new TextInputBuilder()
        .setCustomId('interval')
        .setLabel('Repeat interval (optional)')
        .setStyle(TextInputStyle.Short)
        .setValue(scheduled.interval)
        .setRequired(true)
        .setMaxLength(10);

    modal.addComponents(
        new ActionRowBuilder().addComponents(firstTriggerInput),
        new ActionRowBuilder().addComponents(intervalInput)
    );

    await interaction.showModal(modal);
}

async function handleBoardScheduledDelete(interaction, sharedState) {
    const scheduledId = interaction.customId.replace('scheduled_delete_', '');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_delete_scheduled_${scheduledId}`)
                .setLabel('Yes, delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId(`cancel_delete_${scheduledId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

    await interaction.reply({
        content: '⚠️ **Are you sure you want to delete this scheduled reminder?**',
        components: [row],
        ephemeral: true
    });
}

async function handleBoardScheduledPreview(interaction, sharedState) {
    const { notificationManager, logger } = sharedState;

    const scheduledId = interaction.customId.replace('scheduled_preview_', '');
    const scheduled = notificationManager.getScheduledWithTemplate(scheduledId);

    if (!scheduled || !scheduled.template) {
        await interaction.reply({ content: '❌ Reminder or template not found.', ephemeral: true });
        return;
    }

    try {
        const template = scheduled.template;
        let content = '';
        const embeds = [];

        if (scheduled.roles && scheduled.roles.length > 0) {
            content += scheduled.roles.map(r => `<@&${r}>`).join(' ') + '\n\n';
        }

        if (template.type === 'text') {
            content += template.text;
        } else if (template.type === 'embed') {
            const colorHex = parseInt(template.embedColor || '5865F2', 16);
            const embed = new EmbedBuilder()
                .setDescription(template.embedDescription)
                .setColor(colorHex)
                .setTimestamp();

            if (template.embedTitle) embed.setTitle(template.embedTitle);
            if (template.embedIcon) embed.setThumbnail(template.embedIcon);
            embeds.push(embed);
        }

        await interaction.reply({ content: content || undefined, embeds, ephemeral: true });

        logger.info(`Preview reminder ${scheduledId} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('Error in handleBoardScheduledPreview:', error);
        await interaction.reply({ content: '❌ Error generating preview.', ephemeral: true });
    }
}

async function handleBoardScheduledSend(interaction, sharedState) {
    const { notificationManager, logger, client } = sharedState;

    await interaction.deferUpdate();

    const scheduledId = interaction.customId.replace('scheduled_send_', '');
    const scheduled = notificationManager.getScheduledWithTemplate(scheduledId);

    if (!scheduled || !scheduled.template) {
        await interaction.followUp({ content: '❌ Reminder or template not found.', ephemeral: true });
        return;
    }

    try {
        const channel = await client.channels.fetch(scheduled.channelId);
        if (!channel) {
            await interaction.followUp({ content: '❌ Target channel not found.', ephemeral: true });
            return;
        }

        let content = '';
        const embeds = [];

        if (scheduled.roles && scheduled.roles.length > 0) {
            content += scheduled.roles.map(r => `<@&${r}>`).join(' ') + '\n\n';
        }

        const template = scheduled.template;
        if (template.type === 'text') {
            content += template.text;
        } else if (template.type === 'embed') {
            const colorHex = parseInt(template.embedColor || '5865F2', 16);
            const embed = new EmbedBuilder()
                .setDescription(template.embedDescription)
                .setColor(colorHex)
                .setTimestamp();

            if (template.embedTitle) embed.setTitle(template.embedTitle);
            if (template.embedIcon) embed.setThumbnail(template.embedIcon);
            embeds.push(embed);
        }

        await channel.send({ content, embeds });

        logger.info(`Test send reminder ${scheduledId} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error('Error in handleBoardScheduledSend:', error);
        await interaction.followUp({ content: '❌ Error sending reminder.', ephemeral: true });
    }
}

// ==================== EVENT SELECT HANDLERS ====================

async function handleDeleteEventSelect(interaction, sharedState) {
    const { eventManager } = sharedState;

    const eventId = interaction.values[0];
    const event = eventManager.getEvent(eventId);

    if (!event) {
        await interaction.update({
            content: '❌ Event not found.',
            components: []
        });
        return;
    }

    // Show confirmation
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_delete_event_${eventId}`)
                .setLabel('Confirm Delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('✔️'),
            new ButtonBuilder()
                .setCustomId('cancel_delete_event')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('✖️')
        );

    await interaction.update({
        content: `❌ **Are you sure you want to delete this event?**\n\n📅 **Name:** ${event.name}\n🆔 **ID:** ${event.id}\n⏰ **Next trigger:** <t:${Math.floor(new Date(event.nextTrigger).getTime() / 1000)}:F>`,
        components: [row]
    });
}

async function handleEditEventSelect(interaction, sharedState) {
    const { eventManager } = sharedState;

    const eventId = interaction.values[0];
    const event = eventManager.getEvent(eventId);

    if (!event) {
        await interaction.update({
            content: '❌ Event not found.',
            components: []
        });
        return;
    }

    // Show edit modal
    const modal = new ModalBuilder()
        .setCustomId(`edit_event_modal_${eventId}`)
        .setTitle('Edit Event');

    const nameInput = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Event name/description')
        .setStyle(TextInputStyle.Short)
        .setValue(event.name)
        .setRequired(true)
        .setMaxLength(100);

    const firstTriggerInput = new TextInputBuilder()
        .setCustomId('firstTrigger')
        .setLabel('First trigger (YYYY-MM-DD HH:MM)')
        .setStyle(TextInputStyle.Short)
        .setValue(new Date(event.firstTrigger).toLocaleString('sv-SE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).replace(',', '').replace('T', ' '))
        .setRequired(true);

    const intervalInput = new TextInputBuilder()
        .setCustomId('interval')
        .setLabel('Repeat interval (optional)')
        .setStyle(TextInputStyle.Short)
        .setValue(event.interval)
        .setRequired(true)
        .setMaxLength(10);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(firstTriggerInput),
        new ActionRowBuilder().addComponents(intervalInput)
    );

    await interaction.showModal(modal);
}

// ==================== EVENT MANAGEMENT HANDLERS ====================

async function handlePutList(interaction, sharedState) {
    const { eventListManager, logger } = sharedState;

    // Show channel select menu
    const channelSelect = new ChannelSelectMenuBuilder()
        .setCustomId('event_list_channel_select')
        .setPlaceholder('Select channel for events list')
        .setChannelTypes([ChannelType.GuildText]);

    const row = new ActionRowBuilder().addComponents(channelSelect);

    await interaction.reply({
        content: '📋 **Select channel** where the events list should be displayed:',
        components: [row],
        ephemeral: true
    });

    logger.info(`Put a List initiated by ${interaction.user.tag}`);
}

async function handleAddEvent(interaction, sharedState) {
    const { timezoneManager } = sharedState;

    const currentTime = timezoneManager.getCurrentTime();

    const modal = new ModalBuilder()
        .setCustomId('add_event_modal')
        .setTitle('Add Event');

    const nameInput = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Event name/description')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Boss Spawn, Weekly Meeting')
        .setRequired(true)
        .setMaxLength(100);

    const firstTriggerInput = new TextInputBuilder()
        .setCustomId('firstTrigger')
        .setLabel('First trigger (YYYY-MM-DD HH:MM)')
        .setStyle(TextInputStyle.Short)
        .setValue(currentTime)
        .setRequired(true);

    const intervalInput = new TextInputBuilder()
        .setCustomId('interval')
        .setLabel('Repeat interval (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Empty = one-time, or: 1s, 1m, 1h, 1d (max 28d), ee')
        .setRequired(true)
        .setMaxLength(10);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(firstTriggerInput),
        new ActionRowBuilder().addComponents(intervalInput)
    );

    try {
        // Sprawdź czy interakcja jest nadal ważna (3s timeout)
        if (!interaction.isRepliable()) {
            console.error('⚠️ Interaction expired before showModal could be called');
            return;
        }

        await interaction.showModal(modal);
    } catch (error) {
        // Unknown interaction - prawdopodobnie timeout (>3s)
        if (error.code === 10062) {
            console.error('⚠️ Unknown interaction - user clicked button but response took too long (>3s)');
        } else {
            console.error('❌ Error showing modal:', error);
        }
    }
}

async function handleDeleteEvent(interaction, sharedState) {
    const { eventManager } = sharedState;

    const events = eventManager.getAllEvents();

    if (events.length === 0) {
        await interaction.reply({
            content: '❌ No events to delete.',
            ephemeral: true
        });
        return;
    }

    // Show select menu with events
    const options = events.map(e => ({
        label: e.name.substring(0, 100),
        description: `Next: ${new Date(e.nextTrigger).toLocaleDateString('en-US')}`,
        value: e.id
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('delete_event_select')
        .setPlaceholder('Select event to delete')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        content: '🗑️ **Select event to delete:**',
        components: [row],
        ephemeral: true
    });
}

async function handleEditEvent(interaction, sharedState) {
    const { eventManager } = sharedState;

    const events = eventManager.getAllEvents();

    if (events.length === 0) {
        await interaction.reply({
            content: '❌ No events to edit.',
            ephemeral: true
        });
        return;
    }

    // Show select menu with events
    const options = events.map(e => ({
        label: e.name.substring(0, 100),
        description: `Next: ${new Date(e.nextTrigger).toLocaleDateString('en-US')}`,
        value: e.id
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('edit_event_select')
        .setPlaceholder('Select event to edit')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        content: '✏️ **Select event to edit:**',
        components: [row],
        ephemeral: true
    });
}

module.exports = {
    handleInteraction
};
