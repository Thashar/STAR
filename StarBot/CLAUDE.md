# StarBot - Notifications Management System

**Bot:** StarBot ⭐
**Color:** Yellow
**Language:** English
**Last Updated:** March 2026

---

## 📋 Overview

StarBot is a comprehensive notification management system for Discord servers. It provides:
- **One-time reminders** - Trigger at a specific date/time
- **Recurring reminders** - Daily or weekly schedules
- **Event notifications** - Multi-stage notifications (24h before, 1h before, at start)
- **Live notifications board** - All active notifications displayed on a dedicated channel with Discord timestamps
- **Auto-updating embeds** - Notifications update every minute showing time remaining

---

## 🏗️ Structure

```
StarBot/
├── config/
│   ├── config.js          # Bot configuration (token, channels, categories)
│   └── messages.js        # All text messages and errors (English)
├── handlers/
│   └── interactionHandlers.js  # Slash commands handling
├── services/
│   ├── notificationManager.js  # CRUD operations for notifications
│   ├── boardManager.js         # Manages embeds on notifications board
│   └── scheduler.js            # Checks and triggers notifications
├── data/
│   └── notifications.json      # Persistent storage
├── commands.js            # Slash command definitions
├── deploy-commands.js     # Deploy commands to Discord
└── index.js               # Main bot file
```

---

## 🔐 Environment Variables

```env
STARBOT_TOKEN=bot_token_here
STARBOT_CLIENT_ID=client_id
STARBOT_GUILD_ID=guild_id
STARBOT_NOTIFICATIONS_BOARD_CHANNEL=channel_id  # Channel where all active notifications are displayed
```

---

## 🎯 Features

### 1. One-Time Reminders

Create a reminder that triggers once at a specific time.

**Command:**
```
/reminder
  time: "2024-12-31 20:00" or "2h" or "30m"
  message: "Meeting with team"
  channel: #general (optional, default: current channel)
  role: @Members (optional)
  category: BOSS_EVENTS/DAILY_REMINDERS/ADMIN/COMMUNITY/CUSTOM
```

**Board Display:**
- Embed created on notifications board channel
- Shows trigger time with Discord timestamp: `<t:timestamp:F>` and relative time `<t:timestamp:R>`
- Auto-updates every minute
- Deleted from board after triggering

### 2. Recurring Reminders

Create a reminder that repeats daily or weekly.

**Command:**
```
/recurring
  time: "20:00" (HH:MM format)
  frequency: daily or weekly
  message: "Time for daily login! 🎯"
  channel: #announcements (optional)
  role: @Members (optional)
  days: "0,1,2" (optional, for weekly - 0=Sun, 1=Mon, etc.)
  category: DAILY_REMINDERS (optional)
```

**Board Display:**
- Shows next trigger time with Discord timestamp
- Shows frequency (Daily at 20:00, Weekly on Mon,Wed,Fri at 20:00)
- Never deleted - stays on board and updates after each trigger

### 3. Event Notifications

Create an event with multi-stage notifications.

**Command:**
```
/event
  name: "Raid Boss - Ender Dragon"
  time: "2024-12-31 21:00"
  message: "Event description"
  channel: #events (optional)
  role: @Raiders (optional)
  notifications: "24,1,0" (optional, hours before event - default: 24h, 1h, at start)
  category: BOSS_EVENTS (optional)
```

**Board Display:**
- Shows event time with Discord timestamp
- Lists all notification stages:
  - ✅ = Sent
  - ⏳ = Pending
  - Shows when each stage triggers (relative time)
- Deleted from board after all stages complete

### 4. Notifications Board

**Dedicated channel** where ALL active notifications are displayed as embeds:
- Each notification = 1 embed
- Auto-updates every 1 minute
- Uses Discord timestamps (auto-updates in user's timezone)
- Shows all details: message, channel, roles to ping, trigger time, category, status

**Board Features:**
- Live countdown for all notifications
- Color-coded by category
- Status indicators (Active, Paused, Completed)
- Notification ID for management

### 5. Notification Management

**List your notifications:**
```
/notifications [filter: all/mine/active]
```

**Delete notification:**
```
/delete-notification id: rem_1
```
- Deletes from storage and board
- Only creator or admin can delete

**Pause notification:**
```
/pause-notification id: rec_2
```
- Status changes to "Paused"
- Won't trigger until resumed
- Embed updates to show paused status

**Resume notification:**
```
/resume-notification id: rec_2
```
- Status changes back to "Active"
- Continues normal operation

**Refresh board (Admin only):**
```
/refresh-board
```
- Syncs all notifications to board
- Recreates missing embeds
- Useful after bot restart

---

## 📊 Categories

Notifications can be categorized:

| Category | Emoji | Color | Use Case |
|----------|-------|-------|----------|
| BOSS_EVENTS | ⚔️ | Red | Boss raids, PvP events |
| DAILY_REMINDERS | 🎯 | Green | Daily login, dailies |
| ADMIN | 🛡️ | Blue | Admin meetings, moderation |
| COMMUNITY | 🎉 | Yellow | Community events, parties |
| CUSTOM | ⭐ | Magenta | Custom notifications |

---

## 🔧 Setup

### 1. Install Dependencies

```bash
cd /c/Users/Thash/Desktop/Bots/STAR
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in:
```env
STARBOT_TOKEN=your_bot_token
STARBOT_CLIENT_ID=your_client_id
STARBOT_GUILD_ID=your_guild_id
STARBOT_NOTIFICATIONS_BOARD_CHANNEL=channel_id_for_board
```

### 3. Deploy Slash Commands

```bash
npm run deploy-commands
```

### 4. Start Bot

```bash
npm run starbot
# or
npm start
```

---

## ⚙️ Configuration

**File:** `config/config.js`

```javascript
{
    notificationsBoardChannelId: process.env.STARBOT_NOTIFICATIONS_BOARD_CHANNEL,
    timezone: 'Europe/Warsaw',
    boardUpdateInterval: 60000, // 1 minute
    maxNotificationsPerUser: 50,
    maxTotalNotifications: 200,
    categories: {
        BOSS_EVENTS: { emoji: '⚔️', color: 0xFF0000 },
        // ... more categories
    }
}
```

---

## 🔄 How It Works

### Architecture

**3 Main Services:**

1. **NotificationManager** (`services/notificationManager.js`)
   - CRUD operations for notifications
   - Stores data in `data/notifications.json`
   - Calculates next trigger times for recurring reminders

2. **BoardManager** (`services/boardManager.js`)
   - Creates/updates/deletes embeds on notifications board
   - Updates all embeds every minute
   - Syncs notifications to board on startup

3. **Scheduler** (`services/scheduler.js`)
   - Checks every minute for notifications to trigger
   - Sends notifications to configured channels
   - Updates next trigger time for recurring reminders
   - Marks one-time reminders as completed

### Data Flow

**Creating a notification:**
1. User runs `/reminder` command
2. Handler parses input and validates
3. NotificationManager creates notification in storage
4. BoardManager creates embed on board channel
5. User gets confirmation with notification ID

**Triggering a notification:**
1. Scheduler checks every minute
2. Finds notification(s) ready to trigger
3. Sends message to configured channel with role pings
4. For one-time: marks as completed, BoardManager deletes embed
5. For recurring: calculates next trigger, BoardManager updates embed
6. For events: marks stage as sent, BoardManager updates embed

---

## 📝 Examples

### Example 1: Boss Raid Reminder (One-time)

```
/reminder
  time: 2h
  message: Boss raid in 2 hours! Get ready!
  channel: #raids
  role: @Raiders
  category: BOSS_EVENTS
```

**Result:**
- Creates embed on notifications board showing "Triggers in 2 hours"
- After 2 hours: sends message to #raids pinging @Raiders
- Embed deleted from board

### Example 2: Daily Login Reminder (Recurring)

```
/recurring
  time: 20:00
  frequency: daily
  message: Time for daily login! Don't forget your rewards 🎯
  channel: #announcements
  role: @Members
  category: DAILY_REMINDERS
```

**Result:**
- Creates embed showing "Next trigger: Today at 20:00" (or tomorrow if past 20:00)
- Every day at 20:00: sends message to #announcements
- Embed updates to show next trigger time

### Example 3: Event with Multi-Stage Notifications

```
/event
  name: Raid Boss - Ender Dragon
  time: 2024-12-31 21:00
  message: Epic raid event! Join us in The End!
  channel: #events
  role: @Raiders
  notifications: 24,1,0
  category: BOSS_EVENTS
```

**Result:**
- Creates embed showing event time and 3 stages (24h, 1h, at start)
- 24h before: sends reminder to #events
- 1h before: sends reminder to #events
- At 21:00: sends "EVENT STARTING NOW!" to #events
- After all stages: embed deleted from board

---

## 🐛 Troubleshooting

**Bot doesn't start:**
- Check `STARBOT_TOKEN` in `.env`
- Check `STARBOT_NOTIFICATIONS_BOARD_CHANNEL` is set
- Check logs in `logs/bots-YYYY-MM-DD.log`

**Commands don't work:**
- Run `npm run deploy-commands` to register commands
- Check bot has permission to send messages and embeds
- Check bot is in the guild specified in `STARBOT_GUILD_ID`

**Notifications board not updating:**
- Check bot has permission to read/send messages in notifications board channel
- Check `boardUpdateInterval` in config (default 1 minute)
- Run `/refresh-board` (admin only) to force sync

**Notifications not triggering:**
- Check scheduler is running (logs show "Scheduler initialized")
- Check notification status is "Active" not "Paused"
- Check trigger time is in the future

---

## 📚 Code Reference

**Creating a notification programmatically:**

```javascript
// One-time reminder
const reminder = await notificationManager.createReminder(
    userId,
    new Date('2024-12-31 20:00'),
    'Meeting reminder',
    channelId,
    [roleId],
    [],
    'ADMIN'
);
await boardManager.createEmbed(reminder);

// Recurring reminder
const recurring = await notificationManager.createRecurring(
    userId,
    '20:00',
    'daily',
    'Daily reminder',
    channelId,
    [roleId],
    [],
    'DAILY_REMINDERS'
);
await boardManager.createEmbed(recurring);

// Event
const event = await notificationManager.createEvent(
    userId,
    'Event Name',
    new Date('2024-12-31 21:00'),
    'Event description',
    channelId,
    [roleId],
    [],
    'BOSS_EVENTS',
    [-86400000, -3600000, 0] // 24h, 1h, at start
);
await boardManager.createEmbed(event);
```

---

## ✅ Checklist for Deployment

- [ ] Set up `.env` with all required variables
- [ ] Create notifications board channel
- [ ] Run `npm install`
- [ ] Run `npm run deploy-commands`
- [ ] Start bot with `npm run starbot`
- [ ] Test with `/reminder time:5m message:Test`
- [ ] Verify embed appears on notifications board
- [ ] Wait 5 minutes and verify trigger works
- [ ] Test `/notifications` command
- [ ] Test `/pause-notification` and `/resume-notification`
