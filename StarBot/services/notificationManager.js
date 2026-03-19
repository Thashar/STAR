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
                    templates: [],
                    scheduled: [],
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

    // Create template (Text or Embed)
    async createTemplate(creatorId, name, type, content) {
        const id = this.generateId();
        const template = {
            id: `tpl_${id}`,
            name,
            type, // 'text' or 'embed'
            creator: creatorId,
            createdAt: new Date().toISOString(),
            ...content // { text } for text, { embedTitle, embedDescription, embedIcon, embedImage } for embed
        };

        this.data.templates.push(template);
        await this.saveData();

        this.logger.info(`Created template: ${template.id} (${type})`);
        return template;
    }

    // Get template by ID
    getTemplate(id) {
        return this.data.templates.find(t => t.id === id);
    }

    // Get all templates
    getAllTemplates() {
        return this.data.templates;
    }

    // Get templates by creator
    getTemplatesByCreator(creatorId) {
        return this.data.templates.filter(t => t.creator === creatorId);
    }

    // Update template
    async updateTemplate(id, updates) {
        const index = this.data.templates.findIndex(t => t.id === id);
        if (index !== -1) {
            this.data.templates[index] = {
                ...this.data.templates[index],
                ...updates
            };
            await this.saveData();
            this.logger.info(`Updated template: ${id}`);
            return true;
        }
        return false;
    }

    // Delete template
    async deleteTemplate(id) {
        const initialLength = this.data.templates.length;
        this.data.templates = this.data.templates.filter(t => t.id !== id);

        if (this.data.templates.length < initialLength) {
            // Also delete all scheduled reminders using this template
            this.data.scheduled = this.data.scheduled.filter(s => s.templateId !== id);
            await this.saveData();
            this.logger.info(`Deleted template: ${id} and all associated scheduled reminders`);
            return true;
        }
        return false;
    }

    // ==================== SCHEDULED REMINDERS ====================

    // Create scheduled reminder
    async createScheduled(creatorId, templateId, firstTrigger, interval, channelId, roles = []) {
        const id = this.generateId();

        // Validate interval
        if (!this.validateInterval(interval)) {
            throw new Error('Invalid interval format. Use: 1s, 1m, 1h, 1d (max 28d)');
        }

        // Parse interval to milliseconds
        const intervalMs = this.parseInterval(interval);
        const maxInterval = 28 * 24 * 60 * 60 * 1000; // 28 days in ms
        if (intervalMs > maxInterval) {
            throw new Error('Interval cannot exceed 28 days');
        }

        const scheduled = {
            id: `sch_${id}`,
            templateId,
            creator: creatorId,
            createdAt: new Date().toISOString(),
            firstTrigger: new Date(firstTrigger).toISOString(),
            interval,
            intervalMs,
            nextTrigger: new Date(firstTrigger).toISOString(),
            channelId,
            roles,
            status: 'active',
            boardMessageId: null
        };

        this.data.scheduled.push(scheduled);
        await this.saveData();

        this.logger.info(`Created scheduled reminder: ${scheduled.id} (template: ${templateId})`);
        return scheduled;
    }

    // Validate interval format (1s, 1m, 1h, 1d)
    validateInterval(interval) {
        return /^\d+[smhd]$/.test(interval);
    }

    // Parse interval to milliseconds
    parseInterval(interval) {
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

    // Format interval for display (e.g., "1d" -> "1 dzień", "5h" -> "5 godzin")
    formatInterval(interval) {
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

    // Get scheduled reminder by ID
    getScheduled(id) {
        return this.data.scheduled.find(s => s.id === id);
    }

    // Get all scheduled reminders
    getAllScheduled() {
        return this.data.scheduled;
    }

    // Get active scheduled reminders
    getActiveScheduled() {
        return this.data.scheduled.filter(s => s.status === 'active');
    }

    // Get scheduled reminders by creator
    getScheduledByCreator(creatorId) {
        return this.data.scheduled.filter(s => s.creator === creatorId);
    }

    // Get scheduled reminders by template
    getScheduledByTemplate(templateId) {
        return this.data.scheduled.filter(s => s.templateId === templateId);
    }

    // Update scheduled reminder
    async updateScheduled(id, updates) {
        const index = this.data.scheduled.findIndex(s => s.id === id);
        if (index !== -1) {
            this.data.scheduled[index] = {
                ...this.data.scheduled[index],
                ...updates
            };
            await this.saveData();
            this.logger.info(`Updated scheduled reminder: ${id}`);
            return true;
        }
        return false;
    }

    // Delete scheduled reminder
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

    // Pause scheduled reminder
    async pauseScheduled(id) {
        return await this.updateScheduled(id, { status: 'paused' });
    }

    // Resume scheduled reminder
    async resumeScheduled(id) {
        return await this.updateScheduled(id, { status: 'active' });
    }

    // Update next trigger for scheduled reminder
    async updateNextTrigger(id) {
        const scheduled = this.getScheduled(id);
        if (!scheduled) return false;

        const lastTrigger = new Date(scheduled.nextTrigger);
        const nextTrigger = new Date(lastTrigger.getTime() + scheduled.intervalMs).toISOString();

        return await this.updateScheduled(id, { nextTrigger });
    }

    // Update board message ID
    async updateBoardMessageId(id, messageId) {
        return await this.updateScheduled(id, { boardMessageId: messageId });
    }

    // Get scheduled reminder with template data
    getScheduledWithTemplate(id) {
        const scheduled = this.getScheduled(id);
        if (!scheduled) return null;

        const template = this.getTemplate(scheduled.templateId);
        if (!template) return null;

        return {
            ...scheduled,
            template
        };
    }

    // Get all scheduled with templates
    getAllScheduledWithTemplates() {
        return this.data.scheduled.map(s => ({
            ...s,
            template: this.getTemplate(s.templateId)
        })).filter(s => s.template !== undefined);
    }

    // Get count of active scheduled per user
    getActiveCountByUser(userId) {
        return this.data.scheduled.filter(
            s => s.creator === userId && s.status === 'active'
        ).length;
    }

    // Get total count of active scheduled
    getTotalActiveCount() {
        return this.data.scheduled.filter(s => s.status === 'active').length;
    }
}

module.exports = NotificationManager;
