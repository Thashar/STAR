const { EmbedBuilder } = require('discord.js');

class Scheduler {
    constructor(client, config, logger, notificationManager, boardManager, eventManager, eventListManager) {
        this.client = client;
        this.config = config;
        this.logger = logger;
        this.notificationManager = notificationManager;
        this.boardManager = boardManager;
        this.eventManager = eventManager;
        this.eventListManager = eventListManager;
        this.checkInterval = null;
        this.isChecking = false;
    }

    initialize() {
        this.checkInterval = setInterval(async () => {
            await this.checkNotifications();
        }, 30000);

        this.logger.success('Scheduler initialized - checking every 30 seconds');

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
            await this.checkScheduled(now);
            await this.checkEvents(now);
            await this.checkMessagesToDelete();
        } finally {
            this.isChecking = false;
        }
    }

    async checkScheduled(now) {
        const scheduled = this.notificationManager.getActiveScheduled();
        let anyTriggered = false;

        for (const sch of scheduled) {
            if (sch.isManual) continue;

            const nextTriggerTime = new Date(sch.nextTrigger);

            if (now >= nextTriggerTime) {
                await this.triggerScheduled(sch);

                const isOneTime = !sch.interval || sch.interval === null || sch.isOneTime;

                if (isOneTime) {
                    await this.notificationManager.deleteScheduled(sch.id);
                    await this.notificationManager.deleteTemplate(sch.templateId);
                    await this.boardManager.ensureControlPanel();
                    const tplName = sch.templateId;
                    this.logger.info(`Triggered one-time reminder: ${sch.id} "${tplName}" - deleted scheduled and template`);
                } else {
                    await this.notificationManager.updateNextTrigger(sch.id);
                    await this.boardManager.updateControlPanel();
                    const tplName = this.notificationManager.getTemplate(sch.templateId)?.name || sch.templateId;
                    this.logger.info(`Triggered recurring reminder: ${sch.id} "${tplName}"`);
                }

                anyTriggered = true;
            }
        }

        if (anyTriggered) {
            await this.boardManager.updateControlPanel();
        }

        // Delete paused one-time reminders whose trigger time has passed
        const allScheduled = this.notificationManager.getAllScheduled();
        for (const sch of allScheduled) {
            if (sch.status !== 'paused' || sch.isManual) continue;
            if (sch.interval && !sch.isOneTime) continue;
            const nextTriggerTime = new Date(sch.nextTrigger);
            if (now >= nextTriggerTime) {
                await this.notificationManager.deleteScheduled(sch.id);
                await this.notificationManager.deleteTemplate(sch.templateId);
                await this.boardManager.updateControlPanel();
                this.logger.info(`Paused one-time reminder ${sch.id} expired - deleted`);
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
                this.logger.error(`Channel not found (id: ${scheduled.channelId}) for scheduled ${scheduled.id}`);
                return;
            }

            let content = '';
            const embeds = [];

            if (scheduled.roles && scheduled.roles.length > 0) {
                content += scheduled.roles.map(r => `<@&${r}>`).join(' ') + '\n\n';
            }

            if (template.type === 'text') {
                content += template.text;
            } else if (template.type === 'embed') {
                const colorHex = parseInt(template.embedColor || '5865F2', 16);
                const now = new Date();
                const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

                const embed = new EmbedBuilder()
                    .setDescription(template.embedDescription)
                    .setColor(colorHex)
                    .setFooter({ text: `Notification System \u2022 ${timeStr}` });

                if (template.embedTitle) embed.setTitle(template.embedTitle);
                if (template.embedIcon) embed.setThumbnail(template.embedIcon);
                if (template.embedImage) embed.setImage(template.embedImage);

                embeds.push(embed);
            }

            const message = await channel.send({ content, embeds });

            this.logger.success(`Notification "${template.name}" sent to #${channel.name} (${scheduled.id})`);

            if (scheduled.notificationType === 1) {
                await this.notificationManager.addMessageToDelete(message.id, scheduled.channelId);
                this.logger.info(`Message ${message.id} in #${channel.name} scheduled for auto-delete in 23h 50min`);
            }
        } catch (error) {
            this.logger.error(`Failed to trigger scheduled ${scheduled.id}:`, error);
        }
    }

    async checkEvents(now) {
        if (!this.eventManager || !this.eventListManager) return;

        const events = this.eventManager.getAllEvents();
        let anyTriggered = false;

        for (const event of events) {
            const nextTriggerTime = new Date(event.nextTrigger);
            if (now >= nextTriggerTime) {
                const isOneTime = !event.interval || event.isOneTime;

                await this.eventManager.updateNextTrigger(event.id);
                anyTriggered = true;

                if (isOneTime) {
                    this.logger.info(`One-time event ${event.id} (${event.name}) expired - removed`);
                } else {
                    const updated = this.eventManager.getEvent(event.id);
                    const nextTs = updated ? Math.floor(new Date(updated.nextTrigger).getTime() / 1000) : '?';
                    this.logger.info(`Recurring event ${event.id} (${event.name}) triggered - next: <t:${nextTs}:F>`);
                }
            }
        }

        if (anyTriggered) {
            await this.eventListManager.ensureEventsList();
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
                if (error.code === 10008) {
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
