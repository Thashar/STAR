const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class BoardManager {
    constructor(client, config, logger, notificationManager, timezoneManager, eventManager) {
        this.client = client;
        this.config = config;
        this.logger = logger;
        this.notificationManager = notificationManager;
        this.timezoneManager = timezoneManager;
        this.eventManager = eventManager;
        this.boardChannel = null;
        this.updateInterval = null;
        this.controlPanelMessageId = null;

        // Circuit breaker dla błędów DNS
        this.circuitBreakerOpen = false;
        this.circuitBreakerUntil = null;
        this.consecutiveFailures = 0;
        this.lastDnsErrorLog = 0; // Timestamp ostatniego logu błędu DNS
    }

    async initialize() {
        try {
            // Get notifications board channel
            const channel = await this.client.channels.fetch(this.config.notificationsBoardChannelId);
            if (!channel) {
                this.logger.error('Notifications board channel not found');
                return;
            }

            this.boardChannel = channel;
            this.logger.success('BoardManager initialized');

            // Load control panel message ID from persistent storage
            this.controlPanelMessageId = this.eventManager.getControlPanelMessageId();
            if (this.controlPanelMessageId) {
                this.logger.info(`Loaded control panel message ID: ${this.controlPanelMessageId}`);
            }

            // Start periodic updates
            this.startPeriodicUpdates();

            // Initial sync
            await this.syncAllNotifications();

            // Ensure control panel exists
            await this.ensureControlPanel();
        } catch (error) {
            this.logger.error('Failed to initialize BoardManager:', error);
        }
    }

    startPeriodicUpdates() {
        // Update all embeds every minute
        this.updateInterval = setInterval(async () => {
            await this.updateAllEmbeds();
        }, this.config.boardUpdateInterval);

        this.logger.info('Started periodic board updates');
    }

    stopPeriodicUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            this.logger.info('Stopped periodic board updates');
        }
    }

    // Save control panel message ID to persistent storage
    async saveControlPanelMessageId(messageId) {
        this.controlPanelMessageId = messageId;
        await this.eventManager.setControlPanelMessageId(messageId);
    }

    // Sync all notifications to board (on startup)
    async syncAllNotifications() {
        const activeScheduled = this.notificationManager.getActiveScheduled();
        this.logger.info(`Syncing ${activeScheduled.length} active scheduled reminders to board`);

        for (const scheduled of activeScheduled) {
            if (scheduled.boardMessageId) {
                // Check if message still exists
                try {
                    await this.boardChannel.messages.fetch(scheduled.boardMessageId);
                    // Message exists, update it
                    const scheduledWithTemplate = this.notificationManager.getScheduledWithTemplate(scheduled.id);
                    await this.updateEmbed(scheduledWithTemplate);
                } catch (error) {
                    // Message doesn't exist, create new one
                    const scheduledWithTemplate = this.notificationManager.getScheduledWithTemplate(scheduled.id);
                    await this.createEmbed(scheduledWithTemplate);
                }
            } else {
                // No message ID, create new embed
                const scheduledWithTemplate = this.notificationManager.getScheduledWithTemplate(scheduled.id);
                await this.createEmbed(scheduledWithTemplate);
            }
        }
    }

    // Create embed for scheduled reminder
    async createEmbed(scheduled) {
        if (!this.boardChannel) {
            this.logger.error('Board channel not initialized');
            return null;
        }

        if (!scheduled) {
            this.logger.error('createEmbed: scheduled is null or undefined');
            return null;
        }

        if (!scheduled.template) {
            this.logger.error(`createEmbed: scheduled ${scheduled.id} has no template attached`);
            return null;
        }

        this.logger.info(`Creating embed for scheduled ${scheduled.id} with template ${scheduled.template.name}`);

        try {
            const embed = await this.buildEmbed(scheduled);
            const components = this.buildActionButtons(scheduled);
            const message = await this.boardChannel.send({ embeds: [embed], components });

            // Update notification with message ID
            await this.notificationManager.updateBoardMessageId(scheduled.id, message.id);

            // Move control panel to bottom
            await this.ensureControlPanel();

            this.logger.info(`Created board embed for scheduled: ${scheduled.id}`);
            return message;
        } catch (error) {
            this.logger.error(`Failed to create embed for ${scheduled.id}:`, error);
            return null;
        }
    }

    // Update existing embed
    async updateEmbed(scheduled) {
        if (!this.boardChannel) {
            this.logger.error('Board channel not initialized');
            return false;
        }

        if (!scheduled || !scheduled.template) {
            this.logger.error('Invalid scheduled object or missing template');
            return false;
        }

        if (!scheduled.boardMessageId) {
            this.logger.warn(`No board message ID for scheduled: ${scheduled.id}`);
            return false;
        }

        try {
            const message = await this.boardChannel.messages.fetch(scheduled.boardMessageId);
            const embed = await this.buildEmbed(scheduled);
            const components = this.buildActionButtons(scheduled);
            await message.edit({ embeds: [embed], components });

            return true;
        } catch (error) {
            // Deduplikacja logów błędów DNS - loguj tylko raz na 5 minut
            const isDnsError = error.code === 'EAI_AGAIN' || error.syscall === 'getaddrinfo';
            const now = Date.now();

            if (isDnsError) {
                // Loguj błąd DNS tylko raz na 5 minut
                if (now - this.lastDnsErrorLog > 5 * 60 * 1000) {
                    this.logger.error(`❌ DNS error - cannot reach Discord API (will retry): ${error.message}`);
                    this.lastDnsErrorLog = now;
                }
            } else {
                // Inne błędy - loguj normalnie
                this.logger.error(`Failed to update embed for ${scheduled.id}:`, error);

                // If message not found, create new one
                if (error.code === 10008) {
                    await this.createEmbed(scheduled);
                }
            }

            return false;
        }
    }

    // Delete embed
    async deleteEmbed(scheduled) {
        if (!this.boardChannel) {
            this.logger.error('Board channel not initialized');
            return false;
        }

        if (!scheduled.boardMessageId) {
            return true; // Nothing to delete
        }

        try {
            const message = await this.boardChannel.messages.fetch(scheduled.boardMessageId);
            await message.delete();

            this.logger.info(`Deleted board embed for scheduled: ${scheduled.id}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to delete embed for ${scheduled.id}:`, error);
            return false;
        }
    }

    // Build embed for scheduled reminder
    async buildEmbed(scheduled) {
        const template = scheduled.template;

        // Use template color if available (for embed type), otherwise default
        let color = 0x5865F2; // Default Blurple
        if (template.type === 'embed' && template.embedColor) {
            color = parseInt(template.embedColor, 16);
        }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTimestamp(new Date(scheduled.createdAt));

        // Title
        const typeIcon = template.type === 'text' ? '📝' : '📋';
        embed.setTitle(`${typeIcon} Scheduled Reminder - ID: ${scheduled.id}`);

        // Template info
        embed.addFields({
            name: '📝 Template',
            value: template.name,
            inline: true
        });

        embed.addFields({
            name: '📋 Type',
            value: template.type === 'text' ? 'Text' : 'Embed',
            inline: true
        });

        // Status
        const statusEmoji = scheduled.status === 'active' ? '🟢' : '⏸️';
        const statusText = scheduled.status === 'active' ? 'Active' : 'Paused';
        embed.addFields({
            name: '📊 Status',
            value: `${statusEmoji} ${statusText}`,
            inline: true
        });

        // Channel
        embed.addFields({
            name: '📍 Channel',
            value: `<#${scheduled.channelId}>`,
            inline: true
        });

        // Interval
        embed.addFields({
            name: '🔄 Interval',
            value: this.notificationManager.formatInterval(scheduled.interval),
            inline: true
        });

        // Next trigger with Discord timestamp
        const nextTriggerTimestamp = Math.floor(new Date(scheduled.nextTrigger).getTime() / 1000);
        embed.addFields({
            name: '⏭️ Next trigger',
            value: `<t:${nextTriggerTimestamp}:F>\n(<t:${nextTriggerTimestamp}:R>)`,
            inline: true
        });

        // Roles to ping
        if (scheduled.roles && scheduled.roles.length > 0) {
            const rolesText = scheduled.roles.map(r => `<@&${r}>`).join(', ');
            embed.addFields({
                name: '👥 Roles to ping',
                value: rolesText,
                inline: false
            });
        }

        // Template preview
        if (template.type === 'text') {
            const previewText = template.text.length > 200
                ? template.text.substring(0, 200) + '...'
                : template.text;
            embed.addFields({
                name: '💬 Message preview',
                value: previewText,
                inline: false
            });
        } else {
            let embedPreview = `**${template.embedTitle}**\n${template.embedDescription}`;
            if (embedPreview.length > 200) {
                embedPreview = embedPreview.substring(0, 200) + '...';
            }
            embed.addFields({
                name: '💬 Embed preview',
                value: embedPreview,
                inline: false
            });
        }

        // Creator - get nickname from guild
        let creatorName = 'Unknown';
        if (this.boardChannel && this.boardChannel.guild) {
            try {
                // Try cache first, then fetch if not found
                let member = this.boardChannel.guild.members.cache.get(scheduled.creator);
                if (!member) {
                    member = await this.boardChannel.guild.members.fetch(scheduled.creator);
                }
                if (member) {
                    creatorName = member.displayName;
                }
            } catch (error) {
                // User might have left the server or ID is invalid
                this.logger.warn(`Failed to fetch member ${scheduled.creator}: ${error.message}`);
            }
        }
        embed.setFooter({ text: `Created by ${creatorName}` });

        return embed;
    }

    // Update all active embeds
    async updateAllEmbeds() {
        // Sprawdź circuit breaker
        if (this.circuitBreakerOpen) {
            const now = Date.now();
            if (now < this.circuitBreakerUntil) {
                // Circuit breaker nadal otwarty - pomiń aktualizacje
                return;
            } else {
                // Czas minął - zamknij circuit breaker i spróbuj ponownie
                this.logger.info('🔄 Circuit breaker closed - resuming board updates');
                this.circuitBreakerOpen = false;
                this.circuitBreakerUntil = null;
                this.consecutiveFailures = 0;
            }
        }

        const activeScheduled = this.notificationManager.getAllScheduledWithTemplates();
        let failedCount = 0;

        for (const scheduled of activeScheduled) {
            if (scheduled.status === 'active') {
                const success = await this.updateEmbed(scheduled);
                if (!success) failedCount++;
            }
        }

        // Jeśli wszystkie aktualizacje zawiodły, otwórz circuit breaker
        if (activeScheduled.length > 0 && failedCount === activeScheduled.length) {
            this.consecutiveFailures++;

            if (this.consecutiveFailures >= 3) {
                // Otwórz circuit breaker na 5 minut
                this.circuitBreakerOpen = true;
                this.circuitBreakerUntil = Date.now() + (5 * 60 * 1000);
                this.logger.warn(`⚠️ Circuit breaker opened after ${this.consecutiveFailures} consecutive failures - pausing updates for 5 minutes`);
            }
        } else if (failedCount === 0) {
            // Reset licznika przy sukcesie
            if (this.consecutiveFailures > 0) {
                this.logger.success('✅ Board updates recovered successfully');
                this.consecutiveFailures = 0;
            }
        }
    }

    // Create or update control panel
    async ensureControlPanel() {
        if (!this.boardChannel) {
            this.logger.error('Board channel not initialized');
            return;
        }

        try {
            let existingPanel = null;

            // STEP 1: Try cached message ID first (fast path)
            if (this.controlPanelMessageId) {
                try {
                    existingPanel = await this.boardChannel.messages.fetch(this.controlPanelMessageId);
                    this.logger.info('Found control panel using cached ID');
                } catch (error) {
                    if (error.code === 10008) {
                        this.logger.warn('Cached control panel not found, searching channel');
                        await this.saveControlPanelMessageId(null);
                    } else {
                        throw error;
                    }
                }
            }

            // STEP 2: If no cached panel, search in channel (slow path)
            if (!existingPanel) {
                const allMessages = await this.boardChannel.messages.fetch({ limit: 100 });
                const allPanels = [];

                for (const [, message] of allMessages) {
                    if (message.author.id === this.client.user.id &&
                        message.embeds.length > 0 &&
                        message.embeds[0].title === '📋 Reminders Control Panel') {
                        allPanels.push(message);
                    }
                }

                if (allPanels.length > 0) {
                    existingPanel = allPanels[0]; // Keep first one
                    this.logger.info(`Found ${allPanels.length} control panel(s) in channel`);

                    // Delete ALL duplicates (including old cached one if different)
                    for (let i = 1; i < allPanels.length; i++) {
                        try {
                            await allPanels[i].delete();
                            this.logger.info(`Deleted duplicate control panel: ${allPanels[i].id}`);
                        } catch (error) {
                            this.logger.warn(`Failed to delete duplicate:`, error.message);
                        }
                    }
                }
            }

            // STEP 3: If panel exists - update it
            if (existingPanel) {
                try {
                    const controlPanel = await this.buildControlPanel();
                    await existingPanel.edit(controlPanel);
                    await this.saveControlPanelMessageId(existingPanel.id);
                    this.logger.success('Control panel found and updated');
                    return;
                } catch (error) {
                    this.logger.warn('Failed to update existing control panel, will delete and create new:', error.message);
                    try {
                        await existingPanel.delete();
                        this.logger.info('Deleted old control panel that failed to update');
                    } catch (deleteError) {
                        this.logger.warn('Failed to delete old control panel:', deleteError.message);
                    }
                }
            }

            // STEP 4: No panel exists - create new one
            const controlPanel = await this.buildControlPanel();
            const message = await this.boardChannel.send(controlPanel);
            await this.saveControlPanelMessageId(message.id);
            this.logger.success('Control panel created at bottom');

        } catch (error) {
            this.logger.error('Failed to ensure control panel:', error);
        }
    }

    // Update existing control panel (lightweight - NEVER creates new one)
    async updateControlPanel() {
        if (!this.boardChannel) {
            this.logger.error('Board channel not initialized');
            return;
        }

        try {
            let panelMessage = null;

            // Try to use known message ID first
            if (this.controlPanelMessageId) {
                try {
                    panelMessage = await this.boardChannel.messages.fetch(this.controlPanelMessageId);
                } catch (error) {
                    if (error.code === 10008) {
                        this.logger.warn('Cached control panel message not found, searching channel');
                        await this.saveControlPanelMessageId(null);
                    } else {
                        throw error;
                    }
                }
            }

            // If we don't have the message, search for it (but don't create)
            if (!panelMessage) {
                const messages = await this.boardChannel.messages.fetch({ limit: 100 });
                for (const [, message] of messages) {
                    if (message.author.id === this.client.user.id &&
                        message.embeds.length > 0 &&
                        message.embeds[0].title === '📋 Reminders Control Panel') {
                        panelMessage = message;
                        await this.saveControlPanelMessageId(message.id);
                        this.logger.info('Found control panel in channel');
                        break;
                    }
                }
            }

            // If we found the panel, update it
            if (panelMessage) {
                const controlPanel = await this.buildControlPanel();
                await panelMessage.edit(controlPanel);
                this.logger.success('Control panel updated');
            } else {
                // Panel doesn't exist - don't create it, just log warning
                this.logger.warn('Control panel not found - skipping update (will be created on next bot restart)');
            }
        } catch (error) {
            this.logger.error('Failed to update control panel:', error);
        }
    }

    // Build control panel with info
    async buildControlPanel() {
        const currentTimezone = this.timezoneManager.getGlobalTimezone();
        const currentTime = this.timezoneManager.getCurrentTime();

        // Get events list channel
        const eventsChannelId = this.eventManager.getListChannelId();
        let eventsChannelText = '';
        if (eventsChannelId) {
            eventsChannelText = `📋 **Events List Channel:** <#${eventsChannelId}>\n`;
        } else {
            eventsChannelText = `📋 **Events List Channel:** _Not set (use "Put a List" button)_\n`;
        }

        // Get all templates
        const templates = this.notificationManager.getAllTemplates();
        let templatesText = '';

        if (templates.length === 0) {
            templatesText = '_No templates yet. Create one with `/new-reminder`_';
        } else {
            // Fetch creator names for all templates
            const templateLines = await Promise.all(templates.map(async (t) => {
                const typeIcon = t.type === 'text' ? '📝' : '📋';
                const createdDate = new Date(t.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });

                // Get creator's nickname from guild
                let creatorName = 'Unknown';
                if (this.boardChannel && this.boardChannel.guild) {
                    try {
                        // Try cache first, then fetch if not found
                        let member = this.boardChannel.guild.members.cache.get(t.creator);
                        if (!member) {
                            member = await this.boardChannel.guild.members.fetch(t.creator);
                        }
                        if (member) {
                            creatorName = member.displayName;
                        }
                    } catch (error) {
                        // User might have left the server or ID is invalid
                        this.logger.warn(`Failed to fetch member ${t.creator}: ${error.message}`);
                    }
                }

                return `${typeIcon} **${t.name}** - ${creatorName} - ${createdDate}`;
            }));

            templatesText = templateLines.join('\n');
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2) // Blurple
            .setTitle('📋 Reminders & Events Control Panel')
            .setDescription(
                '**How to use:**\n' +
                'Use the buttons below to manage reminders and events.\n\n' +
                '**Reminders:** Create templates → Schedule with interval → Auto-send to channels\n' +
                '**Events:** Add events → They appear on the events list channel\n\n' +
                `🕐 **Current timezone:** ${currentTimezone}\n` +
                `⏰ **Current time:** ${currentTime}\n` +
                `${eventsChannelText}\n` +
                `**📚 Available Templates (${templates.length}):**\n${templatesText}\n\n` +
                'All active reminders will appear above this panel.'
            )
            .setFooter({ text: 'Reminder System' });

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('board_new_reminder')
                    .setLabel('New Reminder')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('➕'),
                new ButtonBuilder()
                    .setCustomId('board_set_reminder')
                    .setLabel('Set Reminder')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('⏰'),
                new ButtonBuilder()
                    .setCustomId('board_edit_reminder')
                    .setLabel('Edit Reminder')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✏️'),
                new ButtonBuilder()
                    .setCustomId('board_set_timezone')
                    .setLabel('Set Time Zone')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🕐')
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('board_add_event')
                    .setLabel('Add Event')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📅'),
                new ButtonBuilder()
                    .setCustomId('board_delete_event')
                    .setLabel('Delete Event')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗑️'),
                new ButtonBuilder()
                    .setCustomId('board_edit_event')
                    .setLabel('Edit Event')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✏️'),
                new ButtonBuilder()
                    .setCustomId('board_put_list')
                    .setLabel('Put a List')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📋')
            );

        return { embeds: [embed], components: [row1, row2] };
    }

    // Build action buttons for scheduled reminder
    buildActionButtons(scheduled) {
        const row = new ActionRowBuilder();

        // Pause/Resume button
        if (scheduled.status === 'active') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`scheduled_pause_${scheduled.id}`)
                    .setLabel('Pause')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⏸️')
            );
        } else if (scheduled.status === 'paused') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`scheduled_resume_${scheduled.id}`)
                    .setLabel('Resume')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('▶️')
            );
        }

        // Edit button
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`scheduled_edit_${scheduled.id}`)
                .setLabel('Edit')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✏️')
        );

        // Delete button
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`scheduled_delete_${scheduled.id}`)
                .setLabel('Delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

        return [row];
    }
}

module.exports = BoardManager;
