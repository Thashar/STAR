const fs = require('fs').promises;
const path = require('path');

// ==================== TIMEZONE HELPERS (Warsaw-aware for msc interval) ====================

const WARSAW_TZ = 'Europe/Warsaw';

function getWarsawComponents(dateUTC) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: WARSAW_TZ,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
    }).formatToParts(dateUTC);
    const get = type => parseInt(parts.find(p => p.type === type).value);
    return {
        year: get('year'),
        month: get('month'),
        day: get('day'),
        hours: get('hour') % 24,
        minutes: get('minute'),
        seconds: get('second')
    };
}

function warsawComponentsToUTC(year, month1, day, hours, minutes, seconds = 0) {
    const refDate = new Date(Date.UTC(year, month1 - 1, day, 0, 0, 0));
    const tzParts = new Intl.DateTimeFormat('en-US', {
        timeZone: WARSAW_TZ, hour: '2-digit', hour12: false
    }).formatToParts(refDate);
    const warsawHourAtMidnight = parseInt(tzParts.find(p => p.type === 'hour').value) % 24;
    const offsetMs = warsawHourAtMidnight * 60 * 60 * 1000;
    return new Date(Date.UTC(year, month1 - 1, day, hours, minutes, seconds) - offsetMs);
}

function addOneMonthWarsaw(dateUTC, originalDay) {
    const { year, month, hours, minutes, seconds } = getWarsawComponents(dateUTC);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const daysInNextMonth = new Date(nextYear, nextMonth, 0).getDate();
    const actualDay = Math.min(originalDay, daysInNextMonth);
    return warsawComponentsToUTC(nextYear, nextMonth, actualDay, hours, minutes, seconds);
}

// ==================== EVENT MANAGER ====================

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

            // Migration: add manualPanelMessageId if not present
            if (this.data.manualPanelMessageId === undefined) {
                this.data.manualPanelMessageId = null;
                await this.saveData();
                this.logger.info('Data migration: added manualPanelMessageId field');
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.data = {
                    events: [],
                    listChannelId: null,
                    listMessageId: null,
                    controlPanelMessageId: null,
                    manualPanelMessageId: null,
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

    async createEvent(creatorId, name, firstTrigger, interval) {
        const id = this.generateId();

        let intervalMs = null;
        let monthlyDay = null;

        if (interval && interval.trim() !== '') {
            if (!this.validateInterval(interval)) {
                throw new Error('Invalid interval format. Use: 1s, 1m, 1h, 1d (max 90d), "ee", "msc". Leave empty for one-time event.');
            }

            intervalMs = this.parseInterval(interval);

            if (interval !== 'ee' && interval !== 'msc') {
                const maxInterval = 90 * 24 * 60 * 60 * 1000;
                if (intervalMs && intervalMs > maxInterval) {
                    throw new Error('Interval cannot exceed 90 days');
                }
            }

            if (interval === 'msc') {
                monthlyDay = getWarsawComponents(new Date(firstTrigger)).day;
            }
        } else {
            interval = null;
        }

        const event = {
            id: `evt_${id}`,
            name,
            creator: creatorId,
            createdAt: new Date().toISOString(),
            firstTrigger: new Date(firstTrigger).toISOString(),
            interval,
            intervalMs,
            monthlyDay,
            nextTrigger: new Date(firstTrigger).toISOString(),
            triggerCount: 0,
            isOneTime: interval === null
        };

        this.data.events.push(event);
        await this.saveData();

        this.logger.info(`Created event: ${event.id} (${interval ? 'recurring' : 'one-time'})`);
        return event;
    }

    validateInterval(interval) {
        if (!interval || interval.trim() === '') {
            return true;
        }
        return /^\d+[smhd]$/.test(interval) || interval === 'ee' || interval === 'msc';
    }

    parseInterval(interval) {
        if (interval === 'ee' || interval === 'msc') {
            return null;
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

    formatInterval(interval) {
        if (!interval || interval === null) {
            return 'One-time';
        }
        if (interval === 'msc') {
            return 'Monthly (same day)';
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

    getEvent(id) {
        return this.data.events.find(e => e.id === id);
    }

    getAllEvents() {
        return this.data.events;
    }

    async updateEvent(id, updates) {
        const index = this.data.events.findIndex(e => e.id === id);
        if (index !== -1) {
            this.data.events[index] = { ...this.data.events[index], ...updates };
            await this.saveData();
            this.logger.info(`Updated event: ${id}`);
            return true;
        }
        return false;
    }

    async deleteEvent(id) {
        const initialLength = this.data.events.length;
        this.data.events = this.data.events.filter(e => e.id !== id);

        if (this.data.events.length < initialLength) {
            await this.saveData();
            this.logger.info(`Deleted event: ${id}`);
            return true;
        }
        return false;
    }

    async updateNextTrigger(id) {
        const event = this.getEvent(id);
        if (!event) return false;

        if (!event.interval || event.interval === null || event.isOneTime) {
            this.logger.info(`One-time event ${id} executed - removing from list`);
            return await this.deleteEvent(id);
        }

        const lastTrigger = new Date(event.nextTrigger);
        let nextTrigger;
        const newTriggerCount = (event.triggerCount || 0) + 1;

        if (event.interval === 'msc') {
            const originalDay = event.monthlyDay || getWarsawComponents(lastTrigger).day;
            nextTrigger = addOneMonthWarsaw(lastTrigger, originalDay).toISOString();
        } else {
            let nextIntervalMs;
            if (event.interval === 'ee') {
                const cyclePosition = (event.triggerCount || 0) % 9;
                nextIntervalMs = cyclePosition === 8
                    ? 4 * 24 * 60 * 60 * 1000
                    : 3 * 24 * 60 * 60 * 1000;
            } else {
                nextIntervalMs = event.intervalMs;
            }
            nextTrigger = new Date(lastTrigger.getTime() + nextIntervalMs).toISOString();
        }

        return await this.updateEvent(id, { nextTrigger, triggerCount: newTriggerCount });
    }

    // ==================== LIST CHANNEL ====================

    async setListChannel(channelId) {
        this.data.listChannelId = channelId;
        this.data.listMessageId = null;
        await this.saveData();
        this.logger.info(`Set events list channel: ${channelId}`);
    }

    getListChannelId() {
        return this.data.listChannelId;
    }

    async setListMessageId(messageId) {
        this.data.listMessageId = messageId;
        await this.saveData();
    }

    getListMessageId() {
        return this.data.listMessageId;
    }

    async setControlPanelMessageId(messageId) {
        this.data.controlPanelMessageId = messageId;
        await this.saveData();
    }

    getControlPanelMessageId() {
        return this.data.controlPanelMessageId;
    }

    async setManualPanelMessageId(messageId) {
        this.data.manualPanelMessageId = messageId;
        await this.saveData();
    }

    getManualPanelMessageId() {
        return this.data.manualPanelMessageId;
    }
}

module.exports = EventManager;
