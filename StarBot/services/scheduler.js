const { EmbedBuilder } = require('discord.js');

class Scheduler {
    constructor(client, config, logger, notificationManager, boardManager) {
        this.client = client;
        this.config = config;
        this.logger = logger;
        this.notificationManager = notificationManager;
        this.boardManager = boardManager;
        this.checkInterval = null;
        this.isChecking = false;
    }

    initialize() {
        // Check for notifications to trigger every 30 seconds
        this.checkInterval = setInterval(async () => {
            await this.checkNotifications();
        }, 30000); // 30 seconds

        this.logger.success('Scheduler initialized - checking every 30 seconds');

        // Also check immediately on start
        setTimeout(() => this.checkNotifications(), 5000);
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            this.logger.info('Scheduler stopped');
        }
    }

    async checkNotifications() {
        if (this.isChecking) return;
        this.isChecking = true;
        try {
            const now = new Date();

            // Check scheduled reminders
            await this.checkScheduled(now);

            // Check messages to delete (type 1 - standardized, 23h 50min)
            await this.checkMessagesToDelete();
        } finally {
            this.isChecking = false;
        }
    }

    async checkScheduled(now) {
        const scheduled = this.notificationManager.getActiveScheduled();
        let anyTriggered = false;

        for (const sch of scheduled) {
            const nextTriggerTime = new Date(sch.nextTrigger);

            if (now >= nextTriggerTime) {
                await this.triggerScheduled(sch);

                // Check if this is a one-time reminder
                const isOneTime = !sch.interval || sch.interval === null || sch.isOneTime;

                // Update next trigger (for one-time will set status 'completed')
                await this.notificationManager.updateNextTrigger(sch.id);

                if (isOneTime) {
                    // One-time - delete embed from board
                    await this.boardManager.deleteEmbed(sch);
                    const tplName = this.notificationManager.getTemplate(sch.templateId)?.name || sch.templateId;
                    this.logger.info(`Triggered one-time reminder: ${sch.id} "${tplName}" - removed from board`);
                } else {
                    // Recurring - update board embed with new next trigger
                    const updatedScheduled = this.notificationManager.getScheduledWithTemplate(sch.id);
                    await this.boardManager.updateEmbed(updatedScheduled);
                    const tplName = updatedScheduled?.template?.name || sch.templateId;
                    this.logger.info(`Triggered recurring reminder: ${sch.id} "${tplName}"`);
                }

                anyTriggered = true;
            }
        }

        // Update control panel after any trigger to reflect new order and timestamps
        if (anyTriggered) {
            await this.boardManager.updateControlPanel();
        }
    }

    async triggerScheduled(scheduled) {
        try {
            const template = this.notificationManager.getTemplate(scheduled.templateId);
            if (!template) {
                this.logger.error(`Template not found for scheduled: ${scheduled.id} (templateId: ${scheduled.templateId})`);
                return;
            }

            const channel = await this.client.channels.fetch(scheduled.channelId);
            if (!channel) {
                this.logger.error(`Channel not found (id: ${scheduled.channelId}) for scheduled ${scheduled.id}`);
                return;
            }

            let content = '';
            const embeds = [];

            // Add role pings
            if (scheduled.roles && scheduled.roles.length > 0) {
                content += scheduled.roles.map(r => `<@&${r}>`).join(' ') + '\n\n';
            }

            // Build message based on template type
            if (template.type === 'text') {
                content += template.text;
            } else if (template.type === 'embed') {
                const colorHex = parseInt(template.embedColor || '5865F2', 16);
                const now = new Date();
                const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

                const embed = new EmbedBuilder()
                    .setDescription(template.embedDescription)
                    .setColor(colorHex)
                    .setFooter({ text: `Notification System • ${timeStr}` });

                if (template.embedTitle) {
                    embed.setTitle(template.embedTitle);
                }

                if (template.embedIcon) {
                    embed.setThumbnail(template.embedIcon);
                }

                embeds.push(embed);
            }

            const message = await channel.send({ content, embeds });

            this.logger.success(`Notification "${template.name}" sent to #${channel.name} (${scheduled.id})`);

            // If type 1 (standardized) - schedule auto-delete after 23h 50min
            if (scheduled.notificationType === 1) {
                await this.notificationManager.addMessageToDelete(message.id, scheduled.channelId);
                this.logger.info(`Message ${message.id} in #${channel.name} scheduled for auto-delete in 23h 50min`);
            }
        } catch (error) {
            this.logger.error(`Failed to trigger scheduled ${scheduled.id}:`, error);
        }
    }

    async checkMessagesToDelete() {
        const messagesToDelete = this.notificationManager.getMessagesToDeleteNow();

        for (const msg of messagesToDelete) {
            try {
                const channel = await this.client.channels.fetch(msg.channelId);
                if (!channel) {
                    this.logger.warn(`Channel not found (id: ${msg.channelId}) - removing message ${msg.messageId} from delete list`);
                    await this.notificationManager.removeMessageFromDeleteList(msg.messageId);
                    continue;
                }

                await channel.messages.delete(msg.messageId);
                this.logger.success(`Deleted message ${msg.messageId} from #${channel.name} (23h 50min elapsed)`);
                await this.notificationManager.removeMessageFromDeleteList(msg.messageId);
            } catch (error) {
                if (error.code === 10008) { // Unknown Message
                    this.logger.warn(`Message ${msg.messageId} no longer exists - removing from list`);
                    await this.notificationManager.removeMessageFromDeleteList(msg.messageId);
                } else {
                    this.logger.error(`Failed to delete message ${msg.messageId}:`, error);
                }
            }
        }
    }
}

module.exports = Scheduler;
