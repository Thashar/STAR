const { EmbedBuilder } = require('discord.js');

class Scheduler {
    constructor(client, config, logger, notificationManager, boardManager) {
        this.client = client;
        this.config = config;
        this.logger = logger;
        this.notificationManager = notificationManager;
        this.boardManager = boardManager;
        this.checkInterval = null;
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
        const now = new Date();

        // Check scheduled reminders
        await this.checkScheduled(now);
    }

    async checkScheduled(now) {
        const scheduled = this.notificationManager.getActiveScheduled();

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
                    this.logger.info(`Triggered one-time reminder: ${sch.id} - removed from board`);
                } else {
                    // Recurring - update board embed
                    const updatedScheduled = this.notificationManager.getScheduledWithTemplate(sch.id);
                    await this.boardManager.updateEmbed(updatedScheduled);
                    this.logger.info(`Triggered recurring reminder: ${sch.id}`);
                }
            }
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
                this.logger.error(`Channel not found: ${scheduled.channelId}`);
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
                const embed = new EmbedBuilder()
                    .setDescription(template.embedDescription)
                    .setColor(colorHex)
                    .setTimestamp();

                if (template.embedTitle) {
                    embed.setTitle(template.embedTitle);
                }

                if (template.embedIcon) {
                    embed.setThumbnail(template.embedIcon);
                }

                embeds.push(embed);
            }

            await channel.send({ content, embeds });

            this.logger.success(`Notification sent to channel ${scheduled.channelId} (scheduled: ${scheduled.id})`);
        } catch (error) {
            this.logger.error(`Failed to trigger scheduled ${scheduled.id}:`, error);
        }
    }
}

module.exports = Scheduler;
