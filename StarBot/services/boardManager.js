const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

class BoardManager {
    constructor(client, config, logger, notificationManager, timezoneManager) {
        this.client = client;
        this.config = config;
        this.logger = logger;
        this.notificationManager = notificationManager;
        this.timezoneManager = timezoneManager;
        this.boardChannel = null;
        this.updateInterval = null;
        this.controlPanelMessageId = null;
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
            this.logger.error(`Failed to update embed for ${scheduled.id}:`, error);
            // If message not found, create new one
            if (error.code === 10008) {
                await this.createEmbed(scheduled);
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
        const activeScheduled = this.notificationManager.getAllScheduledWithTemplates();

        for (const scheduled of activeScheduled) {
            if (scheduled.status === 'active') {
                await this.updateEmbed(scheduled);
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
            // Fetch last message in channel to check if control panel already exists
            const messages = await this.boardChannel.messages.fetch({ limit: 1 });
            const lastMessage = messages.first();

            // Check if last message is control panel from this bot
            if (lastMessage &&
                lastMessage.author.id === this.client.user.id &&
                lastMessage.embeds.length > 0 &&
                lastMessage.embeds[0].title === '📋 Reminders Control Panel') {

                // Control panel already exists at bottom - just update it
                this.controlPanelMessageId = lastMessage.id;
                this.logger.info('Control panel already exists at bottom - no action needed');
                return;
            }

            // Delete ALL old control panels (fetch more messages to find all panels)
            const allMessages = await this.boardChannel.messages.fetch({ limit: 100 });
            for (const [messageId, message] of allMessages) {
                if (message.author.id === this.client.user.id &&
                    message.embeds.length > 0 &&
                    message.embeds[0].title === '📋 Reminders Control Panel') {
                    try {
                        await message.delete();
                        this.logger.info(`Deleted old control panel: ${messageId}`);
                    } catch (error) {
                        this.logger.warn(`Failed to delete old control panel ${messageId}:`, error.message);
                    }
                }
            }

            // Create new control panel at bottom
            const controlPanel = await this.buildControlPanel();
            const message = await this.boardChannel.send(controlPanel);
            this.controlPanelMessageId = message.id;
            this.logger.success('Control panel created at bottom');

        } catch (error) {
            this.logger.error('Failed to ensure control panel:', error);
        }
    }

    // Build control panel with info
    async buildControlPanel() {
        const currentTimezone = this.timezoneManager.getGlobalTimezone();
        const currentTime = this.timezoneManager.getCurrentTime();

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
            .setTitle('📋 Reminders Control Panel')
            .setDescription(
                '**How to use the reminder system:**\n\n' +
                '**1️⃣ `/new-reminder`** - Create reminder template (Text or Embed)\n' +
                '**2️⃣ `/set-reminder`** - Schedule reminder from template\n' +
                '**3️⃣ `/edit-reminder`** - Edit or delete templates and scheduled reminders\n' +
                '**🕐 `/set-time-zone`** - Set bot time zone for accurate scheduling\n\n' +
                '📝 **Text** - Plain text message\n' +
                '📋 **Embed** - Message with embedded content\n\n' +
                `🕐 **Current timezone:** ${currentTimezone}\n` +
                `⏰ **Current time:** ${currentTime}\n\n` +
                `**📚 Available Templates (${templates.length}):**\n${templatesText}\n\n` +
                'All active reminders will appear above this panel.'
            )
            .setFooter({ text: 'STAR Bot reminder system' });

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
