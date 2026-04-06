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
        this.manualPanelMessageId = null;

        // Circuit breaker for DNS/network errors
        this.circuitBreakerOpen = false;
        this.circuitBreakerUntil = null;
        this.consecutiveFailures = 0;
        this.lastNetworkErrorLog = 0;
    }

    async initialize() {
        try {
            const channel = await this.client.channels.fetch(this.config.notificationsBoardChannelId);
            if (!channel) {
                this.logger.error('Notifications board channel not found');
                return;
            }

            this.boardChannel = channel;
            this.logger.success('BoardManager initialized');

            this.controlPanelMessageId = this.eventManager.getControlPanelMessageId();
            this.manualPanelMessageId = this.eventManager.getManualPanelMessageId();

            this.startPeriodicUpdates();

            // On startup: clean up old individual embeds, then init panels
            await this.syncAllNotifications();
            await this.initializeControlPanel();
        } catch (error) {
            this.logger.error('Failed to initialize BoardManager:', error);
        }
    }

    startPeriodicUpdates() {
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

    async saveControlPanelMessageId(messageId) {
        this.controlPanelMessageId = messageId;
        await this.eventManager.setControlPanelMessageId(messageId);
    }

    async saveManualPanelMessageId(messageId) {
        this.manualPanelMessageId = messageId;
        await this.eventManager.setManualPanelMessageId(messageId);
    }

    // On startup: delete all stale individual reminder embeds from board
    async syncAllNotifications() {
        const allScheduled = this.notificationManager.getAllScheduled();
        this.logger.info(`Cleaning up ${allScheduled.length} individual reminder embeds from board...`);

        for (const scheduled of allScheduled) {
            if (scheduled.boardMessageId) {
                try {
                    const msg = await this.boardChannel.messages.fetch(scheduled.boardMessageId);
                    await msg.delete();
                    this.logger.info(`Deleted old board embed for: ${scheduled.id}`);
                } catch (error) {
                    // Message already gone - fine
                }
                await this.notificationManager.updateBoardMessageId(scheduled.id, null);
            }
        }
    }

    // Individual embeds are no longer used - control panel shows everything
    async createEmbed(scheduled) {
        await this.ensureControlPanel();
        return null;
    }

    async updateEmbed(scheduled) {
        // Individual embeds removed - no-op
        return true;
    }

    async deleteEmbed(scheduled) {
        if (!scheduled.boardMessageId) return true;

        try {
            const message = await this.boardChannel.messages.fetch(scheduled.boardMessageId);
            await message.delete();
            this.logger.info(`Deleted board embed for scheduled: ${scheduled.id}`);
            return true;
        } catch (error) {
            if (error.code === 10008) return true;
            this.logger.error(`Failed to delete embed for ${scheduled.id}:`, error);
            return false;
        }
    }

    // Periodic update: just refresh the control panel
    async updateAllEmbeds() {
        if (this.circuitBreakerOpen) {
            const now = Date.now();
            if (now < this.circuitBreakerUntil) return;
            this.logger.info('Circuit breaker closed - resuming board updates');
            this.circuitBreakerOpen = false;
            this.circuitBreakerUntil = null;
            this.consecutiveFailures = 0;
        }

        try {
            await this.updateControlPanel();
            this.consecutiveFailures = 0;
        } catch (error) {
            const isNetworkError = error.code === 'EAI_AGAIN'
                || error.syscall === 'getaddrinfo'
                || error.name === 'ConnectTimeoutError'
                || error.code === 'UND_ERR_CONNECT_TIMEOUT';

            this.consecutiveFailures++;
            const now = Date.now();

            if (isNetworkError && now - this.lastNetworkErrorLog > 5 * 60 * 1000) {
                this.logger.warn(`Network error updating board: ${error.message}`);
                this.lastNetworkErrorLog = now;
            }

            if (this.consecutiveFailures >= 3) {
                this.circuitBreakerOpen = true;
                this.circuitBreakerUntil = Date.now() + (5 * 60 * 1000);
                this.logger.warn(`Circuit breaker opened after ${this.consecutiveFailures} failures - pausing for 5 minutes`);
            }
        }
    }

    // On startup: update in place without moving to bottom
    async initializeControlPanel() {
        if (!this.boardChannel) return;

        try {
            let existingPanel = null;

            if (this.controlPanelMessageId) {
                try {
                    existingPanel = await this.boardChannel.messages.fetch(this.controlPanelMessageId);
                } catch (error) {
                    if (error.code === 10008) {
                        await this.saveControlPanelMessageId(null);
                    } else throw error;
                }
            }

            if (!existingPanel) {
                const messages = await this.boardChannel.messages.fetch({ limit: 100 });
                for (const [, message] of messages) {
                    if (message.author.id === this.client.user.id &&
                        message.embeds.length > 0 &&
                        message.embeds[0].title === '\ud83d\udccb Reminders & Events Control Panel') {
                        existingPanel = message;
                        await this.saveControlPanelMessageId(message.id);
                        this.logger.info('Found control panel in channel');
                        break;
                    }
                }
            }

            const newPanel = await this.buildControlPanel();

            if (existingPanel) {
                // Smart diff: only edit if content changed
                const existingEmbed = existingPanel.embeds[0];
                const newEmbedData = newPanel.embeds[0].data;
                const existingContent = JSON.stringify({
                    description: existingEmbed.description,
                    fields: existingEmbed.fields
                });
                const newContent = JSON.stringify({
                    description: newEmbedData.description,
                    fields: newEmbedData.fields
                });

                if (existingContent !== newContent) {
                    await existingPanel.edit(newPanel);
                    this.logger.info('Updated control panel on startup');
                } else {
                    this.logger.info('Control panel unchanged on startup - skipped');
                }
            } else {
                const message = await this.boardChannel.send(newPanel);
                await this.saveControlPanelMessageId(message.id);
                this.logger.success('Control panel created on startup');
            }
        } catch (error) {
            this.logger.error('Failed to initialize control panel:', error);
        }

        await this.initializeManualPanel();
    }

    // During runtime: delete old panel and send new one at bottom
    async ensureControlPanel() {
        if (!this.boardChannel) return;

        try {
            let existingPanel = null;

            if (this.controlPanelMessageId) {
                try {
                    existingPanel = await this.boardChannel.messages.fetch(this.controlPanelMessageId);
                } catch (error) {
                    if (error.code === 10008) {
                        await this.saveControlPanelMessageId(null);
                    } else throw error;
                }
            }

            if (!existingPanel) {
                const allMessages = await this.boardChannel.messages.fetch({ limit: 100 });
                const allPanels = [];

                for (const [, message] of allMessages) {
                    if (message.author.id === this.client.user.id &&
                        message.embeds.length > 0 &&
                        message.embeds[0].title === '\ud83d\udccb Reminders & Events Control Panel') {
                        allPanels.push(message);
                    }
                }

                if (allPanels.length > 0) {
                    existingPanel = allPanels[0];
                    for (let i = 1; i < allPanels.length; i++) {
                        try {
                            await allPanels[i].delete();
                            this.logger.info(`Deleted duplicate control panel: ${allPanels[i].id}`);
                        } catch (e) {
                            this.logger.warn(`Failed to delete duplicate: ${e.message}`);
                        }
                    }
                }
            }

            if (existingPanel) {
                try {
                    await existingPanel.delete();
                } catch (error) {
                    this.logger.warn('Failed to delete old control panel:', error.message);
                }
                await this.saveControlPanelMessageId(null);
            }

            const controlPanel = await this.buildControlPanel();
            const message = await this.boardChannel.send(controlPanel);
            await this.saveControlPanelMessageId(message.id);
            this.logger.success('Control panel created at bottom');
        } catch (error) {
            this.logger.error('Failed to ensure control panel:', error);
        }

        await this.ensureManualPanel();
    }

    // Lightweight update: edit in place, never create new
    async updateControlPanel() {
        if (!this.boardChannel) return;

        try {
            let panelMessage = null;

            if (this.controlPanelMessageId) {
                try {
                    panelMessage = await this.boardChannel.messages.fetch(this.controlPanelMessageId);
                } catch (error) {
                    if (error.code === 10008) {
                        await this.saveControlPanelMessageId(null);
                    } else throw error;
                }
            }

            if (!panelMessage) {
                const messages = await this.boardChannel.messages.fetch({ limit: 100 });
                for (const [, message] of messages) {
                    if (message.author.id === this.client.user.id &&
                        message.embeds.length > 0 &&
                        message.embeds[0].title === '\ud83d\udccb Reminders & Events Control Panel') {
                        panelMessage = message;
                        await this.saveControlPanelMessageId(message.id);
                        break;
                    }
                }
            }

            if (panelMessage) {
                const controlPanel = await this.buildControlPanel();
                await panelMessage.edit(controlPanel);
            } else {
                this.logger.warn('Control panel not found - skipping update');
            }
        } catch (error) {
            const isNetworkError = error.code === 'EAI_AGAIN'
                || error.syscall === 'getaddrinfo'
                || error.name === 'ConnectTimeoutError'
                || error.code === 'UND_ERR_CONNECT_TIMEOUT';
            if (isNetworkError) {
                this.logger.warn(`Network error updating control panel: ${error.message}`);
            } else {
                this.logger.error('Failed to update control panel:', error);
            }
        }
    }

    // Build the control panel embed + buttons
    async buildControlPanel() {
        const eventsChannelId = this.eventManager.getListChannelId();
        const eventsChannelText = eventsChannelId
            ? `\ud83d\udccb **Events List Channel:** <#${eventsChannelId}>\n`
            : `\ud83d\udccb **Events List Channel:** _Not set (use "Put a List" button)_\n`;

        const templates = this.notificationManager.getAllTemplates();
        const allScheduled = this.notificationManager.getAllScheduledWithTemplates();
        const events = this.eventManager.getAllEvents();

        const isManualEntry = s => s.isManual || s.status === 'manual';
        const sortByNextTrigger = (a, b) => new Date(a.nextTrigger || 0) - new Date(b.nextTrigger || 0);

        const recurring = allScheduled.filter(s => s.status === 'active' && !isManualEntry(s) && s.interval && !s.isOneTime).sort(sortByNextTrigger);
        const oneTime   = allScheduled.filter(s => s.status === 'active' && !isManualEntry(s) && (!s.interval || s.isOneTime)).sort(sortByNextTrigger);
        const paused    = allScheduled.filter(s => s.status === 'paused' && !isManualEntry(s)).sort(sortByNextTrigger);
        const manual    = allScheduled.filter(s => isManualEntry(s));

        const activeScheduled = allScheduled.filter(s => s.status === 'active' && !isManualEntry(s));

        const buildSection = (list, title, showChannel = false) => {
            if (list.length === 0) return [{ name: title, value: '_None_', inline: false }];

            const lines = list.map(s => {
                const name = s.template?.name ?? 'Unknown template';
                const info = showChannel
                    ? (s.channelId ? `<#${s.channelId}>` : '')
                    : (s.nextTrigger ? `<t:${Math.floor(new Date(s.nextTrigger).getTime() / 1000)}:R>` : '');
                return `**${name}**${info ? ': ' + info : ''}`;
            });

            const fields = [];
            let current = '';
            for (const line of lines) {
                const next = current ? current + '\n' + line : line;
                if (next.length > 1024) { fields.push(current); current = line; }
                else current = next;
            }
            if (current) fields.push(current);

            return fields.map((value, i) => ({
                name: i === 0 ? title : '\u200b',
                value,
                inline: false
            }));
        };

        const dynamicFields = [
            {
                name: '\ud83d\udcca Statistics',
                value: `\ud83d\udcda Templates: **${templates.length}**\n\ud83d\udd14 Active notifications: **${activeScheduled.length}**\n\ud83d\udcc5 Events: **${events.length}**`,
                inline: false
            },
            ...buildSection(recurring, `\ud83d\udd04 Active recurring notifications (${recurring.length})`),
            ...buildSection(oneTime,   `\u23f0 One-time notifications (${oneTime.length})`),
            ...buildSection(paused,    `\u23f8\ufe0f Paused notifications (${paused.length})`),
            ...buildSection(manual,    `\ud83d\udd90\ufe0f Manual notifications (${manual.length})`, true),
        ].slice(0, 25);

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('\ud83d\udccb Reminders & Events Control Panel')
            .setDescription(eventsChannelText)
            .addFields(dynamicFields)
            .setFooter({ text: 'Reminder System' });

        // Row 1: New template | Put a List | Set Time Zone
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('board_new_reminder')
                    .setLabel('New Template')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('\u2795'),
                new ButtonBuilder()
                    .setCustomId('board_put_list')
                    .setLabel('Put a List')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('\ud83d\udccb'),
                new ButtonBuilder()
                    .setCustomId('board_set_timezone')
                    .setLabel('Set Time Zone')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('\ud83d\udd50')
            );

        // Row 2: Set Reminder | Edit Reminder
        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('board_set_reminder')
                    .setLabel('Set Reminder')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('\u23f0'),
                new ButtonBuilder()
                    .setCustomId('board_edit_reminder')
                    .setLabel('Edit Reminder')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('\u270f\ufe0f')
            );

        // Row 3: Add Event | Edit Event | Delete Event
        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('board_add_event')
                    .setLabel('Add Event')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('\ud83d\udcc5'),
                new ButtonBuilder()
                    .setCustomId('board_edit_event')
                    .setLabel('Edit Event')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('\u270f\ufe0f'),
                new ButtonBuilder()
                    .setCustomId('board_delete_event')
                    .setLabel('Delete Event')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('\ud83d\uddd1\ufe0f')
            );

        return { embeds: [embed], components: [row1, row2, row3] };
    }

    // Build the manual panel (quick-send buttons)
    buildManualPanel() {
        const allScheduled = this.notificationManager.getAllScheduledWithTemplates();
        const manual = allScheduled.filter(s => s.isManual || s.status === 'manual');

        if (manual.length === 0) return null;

        const rows = [];
        let currentRow = [];

        for (const s of manual) {
            if (currentRow.length === 5) {
                rows.push(new ActionRowBuilder().addComponents(currentRow));
                currentRow = [];
            }
            if (rows.length === 5) break;

            const templateName = (s.template?.name ?? 'Unknown').slice(0, 30);
            const channel = s.channelId ? this.client.channels.cache.get(s.channelId) : null;
            const channelLabel = channel ? `#${channel.name}` : `#${s.channelId}`;
            const label = `${templateName} \u2192 ${channelLabel}`.slice(0, 80);

            currentRow.push(
                new ButtonBuilder()
                    .setCustomId(`scheduled_send_${s.id}`)
                    .setLabel(label)
                    .setStyle(ButtonStyle.Primary)
            );
        }

        if (currentRow.length > 0) rows.push(new ActionRowBuilder().addComponents(currentRow));

        return { content: '\ud83d\udd90\ufe0f **Manual notifications** \u2014 click to send:', components: rows };
    }

    async ensureManualPanel() {
        if (!this.boardChannel) return;

        try {
            const panelData = this.buildManualPanel();

            let existingMsg = null;
            if (this.manualPanelMessageId) {
                try {
                    existingMsg = await this.boardChannel.messages.fetch(this.manualPanelMessageId);
                } catch (error) {
                    if (error.code === 10008) {
                        await this.saveManualPanelMessageId(null);
                    } else throw error;
                }
            }

            if (!panelData) {
                if (existingMsg) {
                    await existingMsg.delete().catch(() => {});
                    await this.saveManualPanelMessageId(null);
                    this.logger.info('Deleted manual panel - no manual notifications');
                }
                return;
            }

            // Delete old to send at bottom
            if (existingMsg) {
                await existingMsg.delete().catch(() => {});
                await this.saveManualPanelMessageId(null);
            }

            const message = await this.boardChannel.send(panelData);
            await this.saveManualPanelMessageId(message.id);
            this.logger.info('Manual panel sent at bottom');
        } catch (error) {
            this.logger.error('Error updating manual panel:', error);
        }
    }

    async initializeManualPanel() {
        if (!this.boardChannel) return;

        try {
            const panelData = this.buildManualPanel();

            let existingMsg = null;
            if (this.manualPanelMessageId) {
                try {
                    existingMsg = await this.boardChannel.messages.fetch(this.manualPanelMessageId);
                } catch (error) {
                    if (error.code === 10008) {
                        await this.saveManualPanelMessageId(null);
                    } else throw error;
                }
            }

            if (!panelData) {
                if (existingMsg) {
                    await existingMsg.delete().catch(() => {});
                    await this.saveManualPanelMessageId(null);
                }
                return;
            }

            if (existingMsg) {
                // Edit in place on startup (don't move to bottom)
                await existingMsg.edit(panelData).catch(() => {});
                return;
            }

            const message = await this.boardChannel.send(panelData);
            await this.saveManualPanelMessageId(message.id);
            this.logger.info('Manual panel created on startup');
        } catch (error) {
            this.logger.error('Error initializing manual panel:', error);
        }
    }

    // Kept for legacy compatibility with interactionHandlers send/preview buttons
    buildActionButtons(scheduled) {
        const row1 = new ActionRowBuilder();
        const row2 = new ActionRowBuilder();

        if (scheduled.status === 'active') {
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`scheduled_pause_${scheduled.id}`)
                    .setLabel('Pause')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('\u23f8\ufe0f')
            );
        } else if (scheduled.status === 'paused') {
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`scheduled_resume_${scheduled.id}`)
                    .setLabel('Resume')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('\u25b6\ufe0f')
            );
        }

        row1.addComponents(
            new ButtonBuilder()
                .setCustomId(`scheduled_edit_${scheduled.id}`)
                .setLabel('Edit')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('\u270f\ufe0f'),
            new ButtonBuilder()
                .setCustomId(`scheduled_delete_${scheduled.id}`)
                .setLabel('Delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('\ud83d\uddd1\ufe0f')
        );

        row2.addComponents(
            new ButtonBuilder()
                .setCustomId(`scheduled_send_${scheduled.id}`)
                .setLabel('Send')
                .setStyle(ButtonStyle.Success)
                .setEmoji('\ud83d\udce8'),
            new ButtonBuilder()
                .setCustomId(`scheduled_preview_${scheduled.id}`)
                .setLabel('Preview')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('\ud83d\udc41\ufe0f')
        );

        return [row1, row2];
    }
}

module.exports = BoardManager;
