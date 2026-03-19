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
                this.timezones = { timezone: 'UTC' };
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

    // Get bot's global timezone
    getGlobalTimezone() {
        return this.timezones.timezone || 'UTC';
    }

    // Set bot's global timezone
    async setGlobalTimezone(timezone) {
        this.timezones.timezone = timezone;
        await this.saveData();
        this.logger.info(`Set bot timezone: ${timezone}`);
    }

    // Get current time in bot's timezone
    getCurrentTime() {
        const timezone = this.getGlobalTimezone();
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
            this.logger.warn(`Invalid timezone ${timezone}, using UTC`);
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

    // Positive/UTC timezones (UTC+00:00 and higher)
    getPositiveTimezones() {
        return [
            { label: 'UTC (UTC+00:00)', value: 'UTC' },
            { label: 'London (UTC+00:00)', value: 'Europe/London' },
            { label: 'Berlin (UTC+01:00)', value: 'Europe/Berlin' },
            { label: 'Warsaw (UTC+01:00)', value: 'Europe/Warsaw' },
            { label: 'Paris (UTC+01:00)', value: 'Europe/Paris' },
            { label: 'Rome (UTC+01:00)', value: 'Europe/Rome' },
            { label: 'Athens (UTC+02:00)', value: 'Europe/Athens' },
            { label: 'Helsinki (UTC+02:00)', value: 'Europe/Helsinki' },
            { label: 'Istanbul (UTC+03:00)', value: 'Europe/Istanbul' },
            { label: 'Moscow (UTC+03:00)', value: 'Europe/Moscow' },
            { label: 'Dubai (UTC+04:00)', value: 'Asia/Dubai' },
            { label: 'Karachi (UTC+05:00)', value: 'Asia/Karachi' },
            { label: 'Dhaka (UTC+06:00)', value: 'Asia/Dhaka' },
            { label: 'Bangkok (UTC+07:00)', value: 'Asia/Bangkok' },
            { label: 'Hong Kong (UTC+08:00)', value: 'Asia/Hong_Kong' },
            { label: 'Singapore (UTC+08:00)', value: 'Asia/Singapore' },
            { label: 'Tokyo (UTC+09:00)', value: 'Asia/Tokyo' },
            { label: 'Seoul (UTC+09:00)', value: 'Asia/Seoul' },
            { label: 'Sydney (UTC+10:00)', value: 'Australia/Sydney' },
            { label: 'Melbourne (UTC+10:00)', value: 'Australia/Melbourne' },
            { label: 'Auckland (UTC+12:00)', value: 'Pacific/Auckland' }
        ];
    }

    // Negative timezones (UTC-01:00 and lower)
    getNegativeTimezones() {
        return [
            { label: 'Azores (UTC-01:00)', value: 'Atlantic/Azores' },
            { label: 'São Paulo (UTC-03:00)', value: 'America/Sao_Paulo' },
            { label: 'Buenos Aires (UTC-03:00)', value: 'America/Argentina/Buenos_Aires' },
            { label: 'Santiago (UTC-04:00)', value: 'America/Santiago' },
            { label: 'New York (UTC-05:00)', value: 'America/New_York' },
            { label: 'Toronto (UTC-05:00)', value: 'America/Toronto' },
            { label: 'Chicago (UTC-06:00)', value: 'America/Chicago' },
            { label: 'Mexico City (UTC-06:00)', value: 'America/Mexico_City' },
            { label: 'Denver (UTC-07:00)', value: 'America/Denver' },
            { label: 'Phoenix (UTC-07:00)', value: 'America/Phoenix' },
            { label: 'Los Angeles (UTC-08:00)', value: 'America/Los_Angeles' },
            { label: 'Vancouver (UTC-08:00)', value: 'America/Vancouver' },
            { label: 'Anchorage (UTC-09:00)', value: 'America/Anchorage' },
            { label: 'Honolulu (UTC-10:00)', value: 'Pacific/Honolulu' }
        ];
    }
}

module.exports = TimezoneManager;
