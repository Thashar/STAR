const fs = require('fs').promises;
const path = require('path');

class NotificationManager {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.dataPath = path.join(__dirname, '../data/notifications.json');
        this.data = null;
    }

    async initialize() {
        try {
            await this.loadData();
            this.logger.success('NotificationManager initialized');
        } catch (error) {
            this.logger.error('Failed to initialize NotificationManager:', error);
            throw error;
        }
    }

    async loadData() {
        try {
            const fileContent = await fs.readFile(this.dataPath, 'utf8');
            this.data = JSON.parse(fileContent);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, create default structure
                this.data = {
                    reminders: [],
                    recurring: [],
                    events: [],
                    nextId: 1
                };
                await this.saveData();
            } else {
                throw error;
            }
        }
    }

    async saveData() {
        try {
            await fs.writeFile(
                this.dataPath,
                JSON.stringify(this.data, null, 2),
                'utf8'
            );
        } catch (error) {
            this.logger.error('Failed to save notifications data:', error);
            throw error;
        }
    }

    generateId() {
        const id = this.data.nextId;
        this.data.nextId++;
        return id;
    }

    // Create one-time reminder
    async createReminder(creatorId, triggerAt, message, channelId, roles = [], users = [], category = 'CUSTOM') {
        const id = this.generateId();
        const reminder = {
            id: `rem_${id}`,
            type: 'one-time',
            creator: creatorId,
            createdAt: new Date().toISOString(),
            triggerAt: new Date(triggerAt).toISOString(),
            channel: channelId,
            roles,
            users,
            message,
            category,
            status: 'active',
            boardMessageId: null
        };

        this.data.reminders.push(reminder);
        await this.saveData();

        this.logger.info(`Created one-time reminder: ${reminder.id}`);
        return reminder;
    }

    // Create recurring reminder
    async createRecurring(creatorId, time, frequency, message, channelId, roles = [], users = [], category = 'CUSTOM', daysOfWeek = null) {
        const id = this.generateId();

        // Check if time is interval format (1h, 2h, 1d, 2d) or time format (HH:MM)
        const isInterval = /^\d+[hd]$/.test(time);

        const recurring = {
            id: `rec_${id}`,
            type: isInterval ? 'interval' : frequency, // 'interval', 'daily', 'weekly', 'custom'
            creator: creatorId,
            createdAt: new Date().toISOString(),
            channel: channelId,
            roles,
            users,
            message,
            category,
            status: 'active',
            boardMessageId: null
        };

        if (isInterval) {
            // Interval-based recurring (1h, 2h, 1d, 2d)
            recurring.interval = time;
            recurring.time = null;
            recurring.daysOfWeek = null;
            recurring.nextTrigger = this.calculateNextTriggerFromInterval(time);
        } else {
            // Time-based recurring (HH:MM)
            recurring.time = time;
            recurring.interval = null;
            recurring.daysOfWeek = daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
            recurring.nextTrigger = this.calculateNextTrigger(time, daysOfWeek);
        }

        this.data.recurring.push(recurring);
        await this.saveData();

        this.logger.info(`Created recurring reminder: ${recurring.id} (${isInterval ? 'interval' : 'time-based'})`);
        return recurring;
    }

    // Create event
    async createEvent(creatorId, name, eventTime, message, channelId, roles = [], users = [], category = 'CUSTOM', notificationOffsets = [-86400000, -3600000, 0]) {
        const id = this.generateId();
        const event = {
            id: `evt_${id}`,
            type: 'event',
            creator: creatorId,
            createdAt: new Date().toISOString(),
            name,
            eventTime: new Date(eventTime).toISOString(),
            message,
            channel: channelId,
            roles,
            users,
            category,
            status: 'active',
            notifications: notificationOffsets.map(offset => ({
                offset,
                sent: false,
                triggerAt: new Date(new Date(eventTime).getTime() + offset).toISOString()
            })),
            boardMessageId: null
        };

        this.data.events.push(event);
        await this.saveData();

        this.logger.info(`Created event: ${event.id}`);
        return event;
    }

    // Parse interval format (1h, 2h, 1d, 2d) to milliseconds
    parseInterval(interval) {
        const match = interval.match(/^(\d+)(h|d)$/);
        if (!match) {
            throw new Error('Invalid interval format. Use format like: 1h, 2h, 1d, 2d');
        }

        const value = parseInt(match[1]);
        const unit = match[2];

        if (unit === 'h') {
            return value * 60 * 60 * 1000; // hours to ms
        } else if (unit === 'd') {
            return value * 24 * 60 * 60 * 1000; // days to ms
        }

        throw new Error('Invalid interval unit. Use h (hours) or d (days)');
    }

    // Calculate next trigger for interval-based recurring reminders
    calculateNextTriggerFromInterval(interval, lastTrigger = null) {
        const intervalMs = this.parseInterval(interval);
        const baseTime = lastTrigger ? new Date(lastTrigger) : new Date();

        const nextTrigger = new Date(baseTime.getTime() + intervalMs);
        return nextTrigger.toISOString();
    }

    // Calculate next trigger for time-based recurring reminders
    calculateNextTrigger(time, daysOfWeek = null) {
        const now = new Date();
        const [hours, minutes] = time.split(':').map(Number);

        const next = new Date();
        next.setHours(hours, minutes, 0, 0);

        // If time has passed today, move to tomorrow
        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }

        // If specific days are set, find next matching day
        if (daysOfWeek && daysOfWeek.length < 7) {
            while (!daysOfWeek.includes(next.getDay())) {
                next.setDate(next.getDate() + 1);
            }
        }

        return next.toISOString();
    }

    // Get notification by ID
    getNotification(id) {
        const allNotifications = [
            ...this.data.reminders,
            ...this.data.recurring,
            ...this.data.events
        ];
        return allNotifications.find(n => n.id === id);
    }

    // Get all notifications
    getAllNotifications() {
        return [
            ...this.data.reminders,
            ...this.data.recurring,
            ...this.data.events
        ];
    }

    // Get active notifications
    getActiveNotifications() {
        return this.getAllNotifications().filter(n => n.status === 'active');
    }

    // Get notifications by creator
    getNotificationsByCreator(creatorId) {
        return this.getAllNotifications().filter(n => n.creator === creatorId);
    }

    // Update notification
    async updateNotification(id, updates) {
        let found = false;

        // Search in reminders
        const reminderIndex = this.data.reminders.findIndex(r => r.id === id);
        if (reminderIndex !== -1) {
            this.data.reminders[reminderIndex] = {
                ...this.data.reminders[reminderIndex],
                ...updates
            };
            found = true;
        }

        // Search in recurring
        const recurringIndex = this.data.recurring.findIndex(r => r.id === id);
        if (recurringIndex !== -1) {
            this.data.recurring[recurringIndex] = {
                ...this.data.recurring[recurringIndex],
                ...updates
            };
            found = true;
        }

        // Search in events
        const eventIndex = this.data.events.findIndex(e => e.id === id);
        if (eventIndex !== -1) {
            this.data.events[eventIndex] = {
                ...this.data.events[eventIndex],
                ...updates
            };
            found = true;
        }

        if (found) {
            await this.saveData();
            this.logger.info(`Updated notification: ${id}`);
            return true;
        }

        return false;
    }

    // Delete notification
    async deleteNotification(id) {
        const initialLength = this.data.reminders.length + this.data.recurring.length + this.data.events.length;

        this.data.reminders = this.data.reminders.filter(r => r.id !== id);
        this.data.recurring = this.data.recurring.filter(r => r.id !== id);
        this.data.events = this.data.events.filter(e => e.id !== id);

        const newLength = this.data.reminders.length + this.data.recurring.length + this.data.events.length;

        if (newLength < initialLength) {
            await this.saveData();
            this.logger.info(`Deleted notification: ${id}`);
            return true;
        }

        return false;
    }

    // Pause notification
    async pauseNotification(id) {
        return await this.updateNotification(id, { status: 'paused' });
    }

    // Resume notification
    async resumeNotification(id) {
        return await this.updateNotification(id, { status: 'active' });
    }

    // Mark notification as completed
    async completeNotification(id) {
        return await this.updateNotification(id, { status: 'completed' });
    }

    // Update board message ID
    async updateBoardMessageId(id, messageId) {
        return await this.updateNotification(id, { boardMessageId: messageId });
    }

    // Update next trigger for recurring
    async updateNextTrigger(id) {
        const notification = this.getNotification(id);
        if (!notification) return false;

        let nextTrigger;

        if (notification.interval) {
            // Interval-based: calculate from last trigger to maintain consistent intervals
            nextTrigger = this.calculateNextTriggerFromInterval(notification.interval, notification.nextTrigger);
        } else if (notification.time) {
            // Time-based: calculate from now
            nextTrigger = this.calculateNextTrigger(notification.time, notification.daysOfWeek);
        } else {
            return false;
        }

        return await this.updateNotification(id, { nextTrigger });
    }

    // Get count of active notifications per user
    getActiveCountByUser(userId) {
        return this.getAllNotifications().filter(
            n => n.creator === userId && n.status === 'active'
        ).length;
    }

    // Get total count of active notifications
    getTotalActiveCount() {
        return this.getAllNotifications().filter(n => n.status === 'active').length;
    }
}

module.exports = NotificationManager;
