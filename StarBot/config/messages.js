module.exports = {
    errors: {
        generic: '❌ An unexpected error occurred. Please try again later.',
        noPermission: '❌ You do not have permission to perform this action.',
        invalidInput: '❌ Invalid input provided.',
        notificationNotFound: '❌ Notification not found.',
        maxNotificationsReached: '❌ Maximum number of notifications reached.',
        invalidTime: '❌ Invalid time format. Please use ISO format or relative time (e.g., "2h", "30m").',
        channelNotConfigured: '❌ Notifications board channel is not configured. Please contact an administrator.',
        invalidCategory: '❌ Invalid category. Available: BOSS_EVENTS, DAILY_REMINDERS, ADMIN, COMMUNITY, CUSTOM.'
    },

    success: {
        generic: '✅ Operation completed successfully!',
        notificationCreated: '✅ Notification created successfully! ID: {id}',
        notificationUpdated: '✅ Notification updated successfully!',
        notificationDeleted: '✅ Notification deleted successfully!',
        notificationPaused: '⏸️ Notification paused.',
        notificationResumed: '▶️ Notification resumed.'
    },

    info: {
        processing: '⏳ Processing...',
        notificationsCount: '📋 You have {count} active notification(s).'
    },

    notifications: {
        oneTimeTitle: '⏰ One-Time Reminder',
        recurringTitle: '🔄 Recurring Reminder',
        eventTitle: '📅 Event Notification',
        announcementTitle: '📢 Announcement',

        fields: {
            type: 'Type',
            message: 'Message',
            channel: 'Channel',
            roles: 'Ping Roles',
            users: 'Ping Users',
            triggerAt: 'Trigger At',
            nextTrigger: 'Next Trigger',
            frequency: 'Frequency',
            category: 'Category',
            creator: 'Created By',
            status: 'Status'
        },

        status: {
            active: '✅ Active',
            paused: '⏸️ Paused',
            completed: '✔️ Completed',
            failed: '❌ Failed'
        },

        frequency: {
            daily: 'Daily',
            weekly: 'Weekly',
            custom: 'Custom Interval'
        }
    },

    categories: {
        BOSS_EVENTS: '⚔️ Boss Events',
        DAILY_REMINDERS: '🎯 Daily Reminders',
        ADMIN: '🛡️ Administration',
        COMMUNITY: '🎉 Community',
        CUSTOM: '⭐ Custom'
    }
};
