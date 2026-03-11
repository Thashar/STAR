const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const messages = require('../config/messages');

class BoardManager {
    constructor(client, config, logger, notificationManager) {
        this.client = client;
        this.config = config;
        this.logger = logger;
        this.notificationManager = notificationManager;
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
        const activeNotifications = this.notificationManager.getActiveNotifications();
        this.logger.info(`Syncing ${activeNotifications.length} active notifications to board`);

        for (const notification of activeNotifications) {
            if (notification.boardMessageId) {
                // Check if message still exists
                try {
                    await this.boardChannel.messages.fetch(notification.boardMessageId);
                    // Message exists, update it
                    await this.updateEmbed(notification);
                } catch (error) {
                    // Message doesn't exist, create new one
                    await this.createEmbed(notification);
                }
            } else {
                // No message ID, create new embed
                await this.createEmbed(notification);
            }
        }
    }

    // Create embed for notification
    async createEmbed(notification) {
        if (!this.boardChannel) {
            this.logger.error('Board channel not initialized');
            return null;
        }

        try {
            const embed = this.buildEmbed(notification);
            const components = this.buildActionButtons(notification);
            const message = await this.boardChannel.send({ embeds: [embed], components });

            // Update notification with message ID
            await this.notificationManager.updateBoardMessageId(notification.id, message.id);

            this.logger.info(`Created board embed for notification: ${notification.id}`);
            return message;
        } catch (error) {
            this.logger.error(`Failed to create embed for ${notification.id}:`, error);
            return null;
        }
    }

    // Update existing embed
    async updateEmbed(notification) {
        if (!this.boardChannel) {
            this.logger.error('Board channel not initialized');
            return false;
        }

        if (!notification.boardMessageId) {
            this.logger.warn(`No board message ID for notification: ${notification.id}`);
            return false;
        }

        try {
            const message = await this.boardChannel.messages.fetch(notification.boardMessageId);
            const embed = this.buildEmbed(notification);
            const components = this.buildActionButtons(notification);
            await message.edit({ embeds: [embed], components });

            return true;
        } catch (error) {
            this.logger.error(`Failed to update embed for ${notification.id}:`, error);
            // If message not found, create new one
            if (error.code === 10008) {
                await this.createEmbed(notification);
            }
            return false;
        }
    }

    // Delete embed
    async deleteEmbed(notification) {
        if (!this.boardChannel) {
            this.logger.error('Board channel not initialized');
            return false;
        }

        if (!notification.boardMessageId) {
            return true; // Nothing to delete
        }

        try {
            const message = await this.boardChannel.messages.fetch(notification.boardMessageId);
            await message.delete();

            this.logger.info(`Deleted board embed for notification: ${notification.id}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to delete embed for ${notification.id}:`, error);
            return false;
        }
    }

    // Build embed for notification
    buildEmbed(notification) {
        const category = this.config.categories[notification.category] || this.config.categories.CUSTOM;
        const embed = new EmbedBuilder()
            .setColor(category.color)
            .setTimestamp(new Date(notification.createdAt));

        // Title based on type
        if (notification.type === 'one-time') {
            embed.setTitle(`${category.emoji} ${messages.notifications.oneTimeTitle} - ID: ${notification.id}`);
        } else if (notification.type === 'event') {
            embed.setTitle(`${category.emoji} ${messages.notifications.eventTitle} - ID: ${notification.id}`);
            embed.addFields({ name: '📛 Event Name', value: notification.name, inline: false });
        } else {
            embed.setTitle(`${category.emoji} ${messages.notifications.recurringTitle} - ID: ${notification.id}`);
        }

        // Message content
        embed.setDescription(notification.message || 'No message');

        // Channel
        embed.addFields({
            name: messages.notifications.fields.channel,
            value: `<#${notification.channel}>`,
            inline: true
        });

        // Category
        embed.addFields({
            name: messages.notifications.fields.category,
            value: messages.categories[notification.category] || notification.category,
            inline: true
        });

        // Status
        const statusText = messages.notifications.status[notification.status] || notification.status;
        embed.addFields({
            name: messages.notifications.fields.status,
            value: statusText,
            inline: true
        });

        // Roles to ping
        if (notification.roles && notification.roles.length > 0) {
            const rolesText = notification.roles.map(r => `<@&${r}>`).join(', ');
            embed.addFields({
                name: messages.notifications.fields.roles,
                value: rolesText,
                inline: false
            });
        }

        // Trigger time with Discord timestamps
        if (notification.type === 'one-time') {
            const triggerTimestamp = Math.floor(new Date(notification.triggerAt).getTime() / 1000);
            embed.addFields({
                name: messages.notifications.fields.triggerAt,
                value: `<t:${triggerTimestamp}:F> (<t:${triggerTimestamp}:R>)`,
                inline: false
            });
        } else if (notification.type === 'event') {
            const eventTimestamp = Math.floor(new Date(notification.eventTime).getTime() / 1000);
            embed.addFields({
                name: '🎯 Event Time',
                value: `<t:${eventTimestamp}:F> (<t:${eventTimestamp}:R>)`,
                inline: false
            });

            // Notification stages
            const stagesText = notification.notifications
                .map(n => {
                    const triggerTimestamp = Math.floor(new Date(n.triggerAt).getTime() / 1000);
                    const offsetHours = Math.floor(n.offset / (1000 * 60 * 60));
                    const status = n.sent ? '✅' : '⏳';
                    if (offsetHours === 0) {
                        return `${status} At event start: <t:${triggerTimestamp}:R>`;
                    } else if (offsetHours < 0) {
                        return `${status} ${Math.abs(offsetHours)}h before: <t:${triggerTimestamp}:R>`;
                    } else {
                        return `${status} ${offsetHours}h after: <t:${triggerTimestamp}:R>`;
                    }
                })
                .join('\n');

            embed.addFields({
                name: '📢 Notification Stages',
                value: stagesText || 'No stages',
                inline: false
            });
        } else {
            // Recurring
            const nextTriggerTimestamp = Math.floor(new Date(notification.nextTrigger).getTime() / 1000);
            embed.addFields({
                name: messages.notifications.fields.nextTrigger,
                value: `<t:${nextTriggerTimestamp}:F> (<t:${nextTriggerTimestamp}:R>)`,
                inline: false
            });

            // Frequency
            let frequencyText;
            if (notification.interval) {
                // Interval-based: "Every 1 hour", "Every 2 days"
                const match = notification.interval.match(/^(\d+)(h|d)$/);
                if (match) {
                    const value = match[1];
                    const unit = match[2] === 'h' ? (value === '1' ? 'hour' : 'hours') : (value === '1' ? 'day' : 'days');
                    frequencyText = `Every ${value} ${unit}`;
                } else {
                    frequencyText = `Every ${notification.interval}`;
                }
            } else {
                // Time-based: "daily at HH:MM" or "weekly at HH:MM (Mon, Wed, Fri)"
                frequencyText = notification.type;
                if (notification.time) {
                    frequencyText += ` at ${notification.time}`;
                }
                if (notification.daysOfWeek && notification.daysOfWeek.length < 7) {
                    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const days = notification.daysOfWeek.map(d => dayNames[d]).join(', ');
                    frequencyText += ` (${days})`;
                }
            }

            embed.addFields({
                name: messages.notifications.fields.frequency,
                value: frequencyText,
                inline: false
            });
        }

        // Creator
        embed.setFooter({ text: `Created by ${notification.creator}` });

        return embed;
    }

    // Update all active embeds
    async updateAllEmbeds() {
        const activeNotifications = this.notificationManager.getActiveNotifications();

        for (const notification of activeNotifications) {
            await this.updateEmbed(notification);
        }
    }

    // Create or update control panel
    async ensureControlPanel() {
        if (!this.boardChannel) {
            this.logger.error('Board channel not initialized');
            return;
        }

        try {
            // Check if control panel exists
            if (this.controlPanelMessageId) {
                try {
                    const message = await this.boardChannel.messages.fetch(this.controlPanelMessageId);
                    // Update existing panel
                    await message.edit(this.buildControlPanel());
                    return;
                } catch (error) {
                    // Message doesn't exist, create new one
                    this.controlPanelMessageId = null;
                }
            }

            // Create new control panel
            const message = await this.boardChannel.send(this.buildControlPanel());
            this.controlPanelMessageId = message.id;
            this.logger.success('Control panel created');

        } catch (error) {
            this.logger.error('Failed to ensure control panel:', error);
        }
    }

    // Build control panel with button
    buildControlPanel() {
        const embed = new EmbedBuilder()
            .setColor(0x5865F2) // Blurple
            .setTitle('📋 Notification Control Panel')
            .setDescription('Click the button below to create a new notification.\n\nYou can create:\n• ⏰ **One-time reminders** - Trigger once at specific time\n• 🔄 **Recurring reminders** - Daily or weekly schedules\n• 📅 **Events** - Multi-stage notifications (24h, 1h, start)')
            .setFooter({ text: 'All active notifications will appear above this panel' });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('notification_create')
                    .setLabel('➕ Add New Notification')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔔')
            );

        return { embeds: [embed], components: [row] };
    }

    // Build action buttons for notification embed
    buildActionButtons(notification) {
        const row = new ActionRowBuilder();

        // Modify button
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`notification_modify_${notification.id}`)
                .setLabel('Modify')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('✏️')
        );

        // Pause/Resume button
        if (notification.status === 'active') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`notification_pause_${notification.id}`)
                    .setLabel('Pause')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⏸️')
            );
        } else if (notification.status === 'paused') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`notification_resume_${notification.id}`)
                    .setLabel('Resume')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('▶️')
            );
        }

        // Delete button
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`notification_delete_${notification.id}`)
                .setLabel('Delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

        return [row];
    }
}

module.exports = BoardManager;
