const fs = require('fs').promises;
const path = require('path');

class EventManager {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.dataPath = path.join(__dirname, '../data/events.json');
        this.data = null;
    }

    async initialize() {
        try {
            await this.loadData();
            this.logger.success('EventManager initialized');
        } catch (error) {
            this.logger.error('Failed to initialize EventManager:', error);
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
                    events: [],
                    listChannelId: null,
                    listMessageId: null,
                    controlPanelMessageId: null,
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
            this.logger.error('Failed to save events data:', error);
            throw error;
        }
    }

    generateId() {
        const id = this.data.nextId;
        this.data.nextId++;
        return id;
    }

    // ==================== EVENTS ====================

    // Create event
    async createEvent(creatorId, name, firstTrigger, interval) {
        const id = this.generateId();

        let intervalMs = null;

        // If interval provided, validate it
        if (interval && interval.trim() !== '') {
            // Validate interval
            if (!this.validateInterval(interval)) {
                throw new Error('Invalid interval format. Use: 1s, 1m, 1h, 1d (max 28d), or "ee". Leave empty for one-time event.');
            }

            // Parse interval to milliseconds
            intervalMs = this.parseInterval(interval);

            // Check max interval (skip for "ee" pattern)
            if (interval !== 'ee') {
                const maxInterval = 28 * 24 * 60 * 60 * 1000; // 28 days in ms
                if (intervalMs > maxInterval) {
                    throw new Error('Interval cannot exceed 28 days');
                }
            }
        } else {
            // No interval - one-time event
            interval = null;
        }

        const event = {
            id: `evt_${id}`,
            name,
            creator: creatorId,
            createdAt: new Date().toISOString(),
            firstTrigger: new Date(firstTrigger).toISOString(),
            interval, // null for one-time
            intervalMs, // null for one-time
            nextTrigger: new Date(firstTrigger).toISOString(),
            triggerCount: 0, // For "ee" pattern tracking
            isOneTime: interval === null // Flag for one-time event
        };

        this.data.events.push(event);
        await this.saveData();

        this.logger.info(`Event created: "${name}" (${interval ? 'recurring: ' + interval : 'one-time'})`);
        return event;
    }

    // Validate interval format
    // Returns true if interval is empty (one-time) or valid
    validateInterval(interval) {
        // Empty interval = one-time event
        if (!interval || interval.trim() === '') {
            return true;
        }
        return /^\d+[smhd]$/.test(interval) || interval === 'ee';
    }

    // Parse interval to milliseconds
    parseInterval(interval) {
        if (interval === 'ee') {
            return null; // Dynamic, calculated per trigger
        }

        const match = interval.match(/^(\d+)([smhd])$/);
        if (!match) {
            throw new Error('Invalid interval format');
        }

        const value = parseInt(match[1]);
        const unit = match[2];

        switch (unit) {
            case 's': return value * 1000;
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            default: throw new Error('Invalid interval unit');
        }
    }

    // Format interval for display
    formatInterval(interval) {
        // One-time event
        if (!interval || interval === null) {
            return 'One-time';
        }

        if (interval === 'ee') {
            return 'EE Pattern (3d x8, then 4d, repeat)';
        }

        const match = interval.match(/^(\d+)([smhd])$/);
        if (!match) return interval;

        const value = parseInt(match[1]);
        const unit = match[2];

        const units = {
            's': value === 1 ? 'second' : 'seconds',
            'm': value === 1 ? 'minute' : 'minutes',
            'h': value === 1 ? 'hour' : 'hours',
            'd': value === 1 ? 'day' : 'days'
        };

        return `${value} ${units[unit]}`;
    }

    // Get event by ID
    getEvent(id) {
        return this.data.events.find(e => e.id === id);
    }

    // Get all events
    getAllEvents() {
        return this.data.events;
    }

    // Update event
    async updateEvent(id, updates) {
        const index = this.data.events.findIndex(e => e.id === id);
        if (index !== -1) {
            this.data.events[index] = {
                ...this.data.events[index],
                ...updates
            };
            await this.saveData();
            this.logger.info(`Event updated: "${this.data.events[index].name}"`);
            return true;
        }
        return false;
    }

    // Delete event
    async deleteEvent(id) {
        const event = this.getEvent(id);
        const initialLength = this.data.events.length;
        this.data.events = this.data.events.filter(e => e.id !== id);

        if (this.data.events.length < initialLength) {
            await this.saveData();
            this.logger.info(`Event deleted: "${event?.name ?? id}"`);
            return true;
        }
        return false;
    }

    // Update next trigger for event
    async updateNextTrigger(id) {
        const event = this.getEvent(id);
        if (!event) return false;

        // If this is a one-time event, delete it
        if (!event.interval || event.interval === null || event.isOneTime) {
            this.logger.info(`One-time event executed: "${event.name}" - removing from list`);
            return await this.deleteEvent(id);
        }

        const lastTrigger = new Date(event.nextTrigger);
        let nextIntervalMs;
        let newTriggerCount = (event.triggerCount || 0) + 1;

        // Special "ee" pattern: 3d x8, then 4d, repeat
        if (event.interval === 'ee') {
            const cyclePosition = (event.triggerCount || 0) % 9;
            if (cyclePosition === 8) {
                nextIntervalMs = 4 * 24 * 60 * 60 * 1000; // 4 days
            } else {
                nextIntervalMs = 3 * 24 * 60 * 60 * 1000; // 3 days
            }
        } else {
            nextIntervalMs = event.intervalMs;
        }

        const nextTrigger = new Date(lastTrigger.getTime() + nextIntervalMs).toISOString();

        return await this.updateEvent(id, {
            nextTrigger,
            triggerCount: newTriggerCount
        });
    }

    // ==================== LIST CHANNEL ====================

    // Set list channel
    async setListChannel(channelId) {
        this.data.listChannelId = channelId;
        this.data.listMessageId = null; // Reset message ID
        await this.saveData();
        this.logger.info(`Events list channel set (id: ${channelId})`);
    }

    // Get list channel ID
    getListChannelId() {
        return this.data.listChannelId;
    }

    // Set list message ID
    async setListMessageId(messageId) {
        this.data.listMessageId = messageId;
        await this.saveData();
    }

    // Get list message ID
    getListMessageId() {
        return this.data.listMessageId;
    }

    // Set control panel message ID
    async setControlPanelMessageId(messageId) {
        this.data.controlPanelMessageId = messageId;
        await this.saveData();
    }

    // Get control panel message ID
    getControlPanelMessageId() {
        return this.data.controlPanelMessageId;
    }
}

module.exports = EventManager;
