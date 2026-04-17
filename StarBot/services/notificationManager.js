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

// ==================== NOTIFICATION MANAGER ====================

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

            if (!this.data.messagesToDelete) {
                this.data.messagesToDelete = [];
                await this.saveData();
                this.logger.info('Data migration: added messagesToDelete field');
            }
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.data = {
                    templates: [],
                    scheduled: [],
                    messagesToDelete: [],
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

    // ==================== TEMPLATES ====================

    async createTemplate(creatorId, name, type, content) {
        const id = this.generateId();
        const template = {
            id: `tpl_${id}`,
            name,
            type,
            creator: creatorId,
            createdAt: new Date().toISOString(),
            ...content
        };

        this.data.templates.push(template);
        await this.saveData();

        this.logger.info(`Created template: ${template.id} "${name}" (${type})`);
        return template;
    }

    getTemplate(id) {
        return this.data.templates.find(t => t.id === id);
    }

    getAllTemplates() {
        return this.data.templates;
    }

    getTemplatesByCreator(creatorId) {
        return this.data.templates.filter(t => t.creator === creatorId);
    }

    async updateTemplate(id, updates) {
        const index = this.data.templates.findIndex(t => t.id === id);
        if (index !== -1) {
            this.data.templates[index] = { ...this.data.templates[index], ...updates };
            await this.saveData();
            this.logger.info(`Updated template: ${id}`);
            return true;
        }
        return false;
    }

    async deleteTemplate(id) {
        const initialLength = this.data.templates.length;
        this.data.templates = this.data.templates.filter(t => t.id !== id);

        if (this.data.templates.length < initialLength) {
            this.data.scheduled = this.data.scheduled.filter(s => s.templateId !== id);
            await this.saveData();
            this.logger.info(`Deleted template: ${id} and all associated scheduled reminders`);
            return true;
        }
        return false;
    }

    // ==================== SCHEDULED REMINDERS ====================

    async createScheduled(creatorId, templateId, firstTrigger, interval, channelId, roles = [], notificationType = 0, isManual = false) {
        const id = this.generateId();

        let intervalMs = null;
        let monthlyDay = null;

        if (isManual) {
            interval = null;
            firstTrigger = null;
        } else if (interval && interval.trim() !== '') {
            if (!this.validateInterval(interval)) {
                throw new Error('Invalid interval format. Use: 1s, 1m, 1h, 1d (max 90d), "ee", "msc". Leave empty for one-time reminder.');
            }

            intervalMs = this.parseInterval(interval);

            if (interval !== 'ee' && interval !== 'msc') {
                const maxInterval = 90 * 24 * 60 * 60 * 1000;
                if (intervalMs && intervalMs > maxInterval) {
                    throw new Error('Interval cannot exceed 90 days');
                }
            }

            if (interval === 'msc' && firstTrigger) {
                monthlyDay = getWarsawComponents(new Date(firstTrigger)).day;
            }
        } else {
            interval = null;
        }

        const scheduled = {
            id: `sch_${id}`,
            templateId,
            creator: creatorId,
            createdAt: new Date().toISOString(),
            firstTrigger: firstTrigger ? new Date(firstTrigger).toISOString() : null,
            interval,
            intervalMs,
            monthlyDay,
            nextTrigger: firstTrigger ? new Date(firstTrigger).toISOString() : null,
            channelId,
            roles,
            status: isManual ? 'manual' : 'active',
            boardMessageId: null,
            triggerCount: 0,
            isOneTime: !isManual && interval === null,
            isManual,
            notificationType: parseInt(notificationType) || 0
        };

        this.data.scheduled.push(scheduled);
        await this.saveData();

        const tpl = this.getTemplate(templateId);
        this.logger.info(`Created scheduled reminder: ${scheduled.id} (template: "${tpl?.name || templateId}", ${isManual ? 'manual' : interval ? 'interval: ' + interval : 'one-time'}, type: ${notificationType === 1 ? 'standardized' : 'standard'})`);
        return scheduled;
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

    getScheduled(id) {
        return this.data.scheduled.find(s => s.id === id);
    }

    getAllScheduled() {
        return this.data.scheduled;
    }

    getActiveScheduled() {
        return this.data.scheduled.filter(s => s.status === 'active');
    }

    getScheduledByCreator(creatorId) {
        return this.data.scheduled.filter(s => s.creator === creatorId);
    }

    getScheduledByTemplate(templateId) {
        return this.data.scheduled.filter(s => s.templateId === templateId);
    }

    async updateScheduled(id, updates) {
        const index = this.data.scheduled.findIndex(s => s.id === id);
        if (index !== -1) {
            this.data.scheduled[index] = { ...this.data.scheduled[index], ...updates };
            await this.saveData();
            this.logger.info(`Updated scheduled reminder: ${id}`);
            return true;
        }
        return false;
    }

    async deleteScheduled(id) {
        const initialLength = this.data.scheduled.length;
        this.data.scheduled = this.data.scheduled.filter(s => s.id !== id);

        if (this.data.scheduled.length < initialLength) {
            await this.saveData();
            this.logger.info(`Deleted scheduled reminder: ${id}`);
            return true;
        }
        return false;
    }

    async pauseScheduled(id) {
        return await this.updateScheduled(id, { status: 'paused' });
    }

    async resumeScheduled(id) {
        const scheduled = this.getScheduled(id);
        if (!scheduled) return false;

        const now = new Date();
        const nextTrigger = new Date(scheduled.nextTrigger);

        if (nextTrigger > now) {
            return await this.updateScheduled(id, { status: 'active' });
        }

        // nextTrigger passed while paused
        if (scheduled.isOneTime || !scheduled.interval) {
            await this.deleteScheduled(id);
            await this.deleteTemplate(scheduled.templateId);
            this.logger.info(`One-time reminder ${id} expired while paused - deleted`);
            return { deleted: true };
        }

        // Recurring: advance nextTrigger to next future occurrence
        let current = nextTrigger;
        let triggerCount = scheduled.triggerCount || 0;

        while (current <= now) {
            if (scheduled.interval === 'msc') {
                const originalDay = scheduled.monthlyDay || getWarsawComponents(current).day;
                current = addOneMonthWarsaw(current, originalDay);
            } else if (scheduled.interval === 'ee') {
                const cyclePosition = triggerCount % 9;
                const intervalMs = cyclePosition === 8
                    ? 4 * 24 * 60 * 60 * 1000
                    : 3 * 24 * 60 * 60 * 1000;
                current = new Date(current.getTime() + intervalMs);
            } else {
                current = new Date(current.getTime() + scheduled.intervalMs);
            }
            triggerCount++;
        }

        return await this.updateScheduled(id, {
            status: 'active',
            nextTrigger: current.toISOString(),
            triggerCount
        });
    }

    async updateNextTrigger(id) {
        const scheduled = this.getScheduled(id);
        if (!scheduled) return false;

        if (!scheduled.interval || scheduled.interval === null || scheduled.isOneTime) {
            this.logger.info(`One-time reminder ${id} executed - marking as completed`);
            return await this.updateScheduled(id, { status: 'completed', triggerCount: 1 });
        }

        const lastTrigger = new Date(scheduled.nextTrigger);
        let nextTrigger;
        const newTriggerCount = (scheduled.triggerCount || 0) + 1;

        if (scheduled.interval === 'msc') {
            const originalDay = scheduled.monthlyDay || getWarsawComponents(lastTrigger).day;
            nextTrigger = addOneMonthWarsaw(lastTrigger, originalDay).toISOString();
        } else {
            let nextIntervalMs;
            if (scheduled.interval === 'ee') {
                const cyclePosition = (scheduled.triggerCount || 0) % 9;
                nextIntervalMs = cyclePosition === 8
                    ? 4 * 24 * 60 * 60 * 1000
                    : 3 * 24 * 60 * 60 * 1000;
            } else {
                nextIntervalMs = scheduled.intervalMs;
            }
            nextTrigger = new Date(lastTrigger.getTime() + nextIntervalMs).toISOString();
        }

        return await this.updateScheduled(id, { nextTrigger, triggerCount: newTriggerCount });
    }

    async updateBoardMessageId(id, messageId) {
        return await this.updateScheduled(id, { boardMessageId: messageId });
    }

    getScheduledWithTemplate(id) {
        const scheduled = this.getScheduled(id);
        if (!scheduled) return null;

        const template = this.getTemplate(scheduled.templateId);
        if (!template) return null;

        return { ...scheduled, template };
    }

    getAllScheduledWithTemplates() {
        return this.data.scheduled.map(s => ({
            ...s,
            template: this.getTemplate(s.templateId)
        })).filter(s => s.template !== undefined);
    }

    getActiveCountByUser(userId) {
        return this.data.scheduled.filter(
            s => s.creator === userId && s.status === 'active'
        ).length;
    }

    getTotalActiveCount() {
        return this.data.scheduled.filter(s => s.status === 'active').length;
    }

    // ==================== MESSAGES TO DELETE (TYPE 1 - STANDARDIZED) ====================

    async addMessageToDelete(messageId, channelId) {
        const deleteAt = Date.now() + (23 * 60 * 60 * 1000 + 50 * 60 * 1000);

        this.data.messagesToDelete.push({ messageId, channelId, deleteAt });
        await this.saveData();
        this.logger.info(`Scheduled deletion of message ${messageId} at ${new Date(deleteAt).toLocaleString()}`);
    }

    getMessagesToDeleteNow() {
        const now = Date.now();
        return this.data.messagesToDelete.filter(m => m.deleteAt <= now);
    }

    async removeMessageFromDeleteList(messageId) {
        this.data.messagesToDelete = this.data.messagesToDelete.filter(m => m.messageId !== messageId);
        await this.saveData();
    }
}

module.exports = NotificationManager;
