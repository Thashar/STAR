const fs = require('fs').promises;
const path = require('path');

class TimezoneManager {
    constructor(logger) {
        this.logger = logger;
        this.dataPath = path.join(__dirname, '../data/user_timezones.json');
        this.timezones = null;
    }

    async initialize() {
        try {
            await this.loadData();
            this.logger.success('TimezoneManager initialized');
        } catch (error) {
            this.logger.error('Failed to initialize TimezoneManager:', error);
            throw error;
        }
    }

    async loadData() {
        try {
            const fileContent = await fs.readFile(this.dataPath, 'utf8');
            this.timezones = JSON.parse(fileContent);
        } catch (error) {
            if (error.code === 'ENOENT') {
                this.timezones = { users: {} };
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
                JSON.stringify(this.timezones, null, 2),
                'utf8'
            );
        } catch (error) {
            this.logger.error('Failed to save timezone data:', error);
            throw error;
        }
    }

    // Get user's timezone (returns UTC +00:00 if not set)
    getUserTimezone(userId) {
        return this.timezones.users[userId] || 'UTC';
    }

    // Set user's timezone
    async setUserTimezone(userId, timezone) {
        this.timezones.users[userId] = timezone;
        await this.saveData();
        this.logger.info(`Set timezone for user ${userId}: ${timezone}`);
    }

    // Get current time in user's timezone
    getCurrentTimeForUser(userId) {
        const timezone = this.getUserTimezone(userId);
        const now = new Date();

        try {
            return now.toLocaleString('sv-SE', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }).replace(',', '');
        } catch (error) {
            // Fallback to UTC if timezone is invalid
            this.logger.warn(`Invalid timezone ${timezone} for user ${userId}, using UTC`);
            return now.toLocaleString('sv-SE', {
                timeZone: 'UTC',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }).replace(',', '');
        }
    }

    // Common timezones list
    getCommonTimezones() {
        return [
            { label: 'UTC (UTC+00:00)', value: 'UTC' },
            { label: 'London (UTC+00:00)', value: 'Europe/London' },
            { label: 'Berlin (UTC+01:00)', value: 'Europe/Berlin' },
            { label: 'Warsaw (UTC+01:00)', value: 'Europe/Warsaw' },
            { label: 'Paris (UTC+01:00)', value: 'Europe/Paris' },
            { label: 'Athens (UTC+02:00)', value: 'Europe/Athens' },
            { label: 'Moscow (UTC+03:00)', value: 'Europe/Moscow' },
            { label: 'Dubai (UTC+04:00)', value: 'Asia/Dubai' },
            { label: 'Karachi (UTC+05:00)', value: 'Asia/Karachi' },
            { label: 'Dhaka (UTC+06:00)', value: 'Asia/Dhaka' },
            { label: 'Bangkok (UTC+07:00)', value: 'Asia/Bangkok' },
            { label: 'Singapore (UTC+08:00)', value: 'Asia/Singapore' },
            { label: 'Tokyo (UTC+09:00)', value: 'Asia/Tokyo' },
            { label: 'Sydney (UTC+10:00)', value: 'Australia/Sydney' },
            { label: 'Auckland (UTC+12:00)', value: 'Pacific/Auckland' },
            { label: 'Los Angeles (UTC-08:00)', value: 'America/Los_Angeles' },
            { label: 'Denver (UTC-07:00)', value: 'America/Denver' },
            { label: 'Chicago (UTC-06:00)', value: 'America/Chicago' },
            { label: 'New York (UTC-05:00)', value: 'America/New_York' },
            { label: 'São Paulo (UTC-03:00)', value: 'America/Sao_Paulo' }
        ];
    }
}

module.exports = TimezoneManager;
