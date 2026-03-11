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
        // Check for notifications to trigger every minute
        this.checkInterval = setInterval(async () => {
            await this.checkNotifications();
        }, 60000); // 1 minute

        this.logger.success('Scheduler initialized - checking every 1 minute');

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

        // Check one-time reminders
        await this.checkReminders(now);

        // Check recurring reminders
        await this.checkRecurring(now);

        // Check event notifications
        await this.checkEvents(now);
    }

    async checkReminders(now) {
        const reminders = this.notificationManager.data.reminders.filter(
            r => r.status === 'active'
        );

        for (const reminder of reminders) {
            const triggerTime = new Date(reminder.triggerAt);

            if (now >= triggerTime) {
                await this.triggerNotification(reminder);

                // Mark as completed and delete from board
                await this.notificationManager.completeNotification(reminder.id);
                await this.boardManager.deleteEmbed(reminder);

                this.logger.info(`Triggered one-time reminder: ${reminder.id}`);
            }
        }
    }

    async checkRecurring(now) {
        const recurring = this.notificationManager.data.recurring.filter(
            r => r.status === 'active'
        );

        for (const rec of recurring) {
            const nextTriggerTime = new Date(rec.nextTrigger);

            if (now >= nextTriggerTime) {
                await this.triggerNotification(rec);

                // Calculate next trigger
                await this.notificationManager.updateNextTrigger(rec.id);

                // Update board embed
                const updatedNotification = this.notificationManager.getNotification(rec.id);
                await this.boardManager.updateEmbed(updatedNotification);

                this.logger.info(`Triggered recurring reminder: ${rec.id}`);
            }
        }
    }

    async checkEvents(now) {
        const events = this.notificationManager.data.events.filter(
            e => e.status === 'active'
        );

        for (const event of events) {
            let allSent = true;
            let anyTriggered = false;

            for (const notification of event.notifications) {
                if (!notification.sent) {
                    const triggerTime = new Date(notification.triggerAt);

                    if (now >= triggerTime) {
                        await this.triggerNotification(event, notification);
                        notification.sent = true;
                        anyTriggered = true;
                        this.logger.info(`Triggered event notification: ${event.id} (offset: ${notification.offset})`);
                    } else {
                        allSent = false;
                    }
                } else if (!notification.sent) {
                    allSent = false;
                }
            }

            if (anyTriggered) {
                // Update the event in storage
                await this.notificationManager.updateNotification(event.id, {
                    notifications: event.notifications
                });

                // Update board embed
                const updatedEvent = this.notificationManager.getNotification(event.id);
                await this.boardManager.updateEmbed(updatedEvent);
            }

            // If all notifications sent, mark event as completed
            if (allSent && event.notifications.every(n => n.sent)) {
                await this.notificationManager.completeNotification(event.id);
                await this.boardManager.deleteEmbed(event);
                this.logger.info(`Completed event: ${event.id}`);
            }
        }
    }

    async triggerNotification(notification, eventNotification = null) {
        try {
            const channel = await this.client.channels.fetch(notification.channel);
            if (!channel) {
                this.logger.error(`Channel not found: ${notification.channel}`);
                return;
            }

            let content = '';

            // Add role pings
            if (notification.roles && notification.roles.length > 0) {
                content += notification.roles.map(r => `<@&${r}>`).join(' ') + ' ';
            }

            // Add user pings
            if (notification.users && notification.users.length > 0) {
                content += notification.users.map(u => `<@${u}>`).join(' ') + ' ';
            }

            content += '\n';

            // Message content
            if (notification.type === 'event' && eventNotification) {
                const eventTime = new Date(notification.eventTime);
                const eventTimestamp = Math.floor(eventTime.getTime() / 1000);

                let stageText = '';
                const offsetHours = Math.floor(eventNotification.offset / (1000 * 60 * 60));
                if (offsetHours === 0) {
                    stageText = '🎯 **EVENT STARTING NOW!**';
                } else if (offsetHours < 0) {
                    stageText = `⏰ **Reminder: ${Math.abs(offsetHours)} hour(s) until event**`;
                }

                content += `📅 **${notification.name}**\n`;
                content += `${stageText}\n`;
                content += `Event time: <t:${eventTimestamp}:F> (<t:${eventTimestamp}:R>)\n\n`;
                content += notification.message || '';
            } else if (notification.type === 'one-time') {
                content += `⏰ **REMINDER**\n${notification.message}`;
            } else {
                content += `🔄 **RECURRING REMINDER**\n${notification.message}`;
            }

            await channel.send({ content });

            this.logger.success(`Notification sent to channel ${notification.channel}`);
        } catch (error) {
            this.logger.error(`Failed to trigger notification ${notification.id}:`, error);
        }
    }
}

module.exports = Scheduler;
