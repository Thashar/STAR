# StarBot - Template-Based Notifications System

**Bot:** StarBot ⭐
**Color:** Yellow
**Language:** English (ALL UI, logs, notifications in English)
**Last Updated:** March 2026

> **Note:** This bot is fully English - all user interface, logs, notifications, and messages are in English only.

---

## 📋 Overview

StarBot is a comprehensive template-based notification management system for Discord servers. It provides:
- **Notification templates** - Create reusable Text or Embed templates
- **Scheduled reminders** - Schedule templates with flexible intervals (1s to 60d, or 'ee' pattern)
- **Notification types** - Standard (type 0) or Standardized (type 1, auto-delete after 23h 50min)
- **Live notifications board** - All active scheduled reminders displayed on a dedicated channel
- **Auto-updating embeds** - Notifications update every minute showing time remaining

---

## 🏗️ Structure

```
StarBot/
├── config/
│   ├── config.js          # Bot configuration (token, channels, categories)
│   └── messages.js        # All text messages and errors
├── handlers/
│   └── interactionHandlers.js  # Slash commands + interaction handling
├── services/
│   ├── notificationManager.js  # Templates + Scheduled CRUD operations
│   ├── boardManager.js         # Manages embeds on notifications board
│   └── scheduler.js            # Checks and triggers notifications
├── data/
│   └── notifications.json      # Persistent storage (templates + scheduled)
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

### New System Architecture

The system is built on **two main concepts**:

1. **Templates** - Reusable notification content (Text or Embed)
2. **Scheduled** - Instances of templates with timing, channels, and role pings

---

### 1. Create Notification Templates (`/new-reminder`)

Create reusable templates for notifications.

**Command:**
```
/new-reminder
```

**Flow:**
1. Choose type: **Text** or **Embed**
2. Fill modal:
   - **Text**: Name + text content
   - **Embed**: Name + embed title + description + icon URL (optional) + image URL (optional)
3. Preview appears with:
   - ✅ **Zatwierdź** - Save template
   - ❌ **Odrzuć** - Cancel
   - ✏️ **Edytuj** - Edit values

**Result:**
- Template saved to database with ID (e.g., `tpl_1`)
- Ready to be scheduled with `/set-reminder`

**Example Templates:**
- **Text**: "Boss spawns in 1 hour! Get ready!"
- **Embed**: Rich notification with title, description, icon, and image

---

### 2. Schedule Reminders (`/set-reminder`)

Schedule a template to be sent repeatedly.

**Command:**
```
/set-reminder
```

**Flow:**
1. Select template from list (with pagination if >25 templates)
2. Fill modal:
   - **First trigger**: `YYYY-MM-DD HH:MM` (e.g., "2026-03-20 10:00")
   - **Interval**: `1s`, `1m`, `1h`, `1d` (max 60d), or `ee` for special pattern
     - Examples: `5m` = every 5 minutes, `1h` = every hour, `1d` = every day
     - Special: `ee` = EE Pattern (8 triggers every 3 days, then 9th trigger after 4 days, repeating cyclically)
   - **Type**: `0` = Standard (choose channel) | `1` = Standardized (uses events list channel, auto-delete after 23h 50min)
3. For type 0: Select channel from dropdown; for type 1: channel auto-set to events list
4. Select roles to ping (optional, multi-select up to 10)
5. Confirm to create scheduled reminder

**Result:**
- Scheduled reminder created with ID (e.g., `sch_1`)
- Appears on notifications board
- Triggers automatically at intervals

**Examples:**
```
Example 1 - Regular interval:
Template: "Boss Reminder" (Text)
First trigger: 2026-03-20 10:00
Interval: 1d (every day)
Channel: #raids
Roles: @Raiders
→ Sends notification every day at 10:00

Example 2 - EE Pattern:
Template: "Special Event" (Embed)
First trigger: 2026-03-20 18:00
Interval: ee (EE Pattern)
Channel: #events
Roles: @Everyone
→ Sends 8 times every 3 days, then once after 4 days, repeating cyclically
```

---

### 3. Edit/Delete Reminders (`/edit-reminder`)

Manage templates and scheduled reminders.

**Command:**
```
/edit-reminder
```

**Flow:**
1. Choose type:
   - **Template** - Edit/delete templates
   - **Scheduled** (with ⏰ prefix) - Edit/delete scheduled reminders
2. Select from list (with pagination)
3. Preview appears with:
   - ✏️ **Edytuj** - Edit values (modal)
   - 🗑️ **Usuń** - Delete (confirmation)

**Template Actions:**
- **Edit**: Change name, text/embed content
- **Delete**: Removes template + ALL scheduled reminders using it

**Scheduled Actions:**
- **Edit**: Change first trigger, interval
- **Delete**: Removes scheduled reminder only

---

### 4. Notifications Board

**Dedicated channel** where ALL scheduled reminders are displayed as embeds:

**Board Features:**
- Each scheduled reminder = 1 embed
- Auto-updates every 1 minute
- Shows:
  - Template name and type (Text/Embed)
  - Next trigger time (Discord timestamp with relative time)
  - Interval (formatted: "1 dzień", "5 godzin")
  - Channel
  - Roles to ping
  - Status (Active/Paused)
  - Preview of message content

**Embed Buttons:**
- ⏸️ **Wstrzymaj** / ▶️ **Wznów** - Pause/Resume
- ✏️ **Edytuj** - Edit timing
- 🗑️ **Usuń** - Delete

**Control Panel:**
- At bottom of board channel
- Explains how to use the system
- Three interactive buttons:
  - ➕ **New Reminder** (gray) - Opens `/new-reminder` flow
  - ⏰ **Set Reminder** (green) - Opens `/set-reminder` flow
  - ✏️ **Edit Reminder** (blue) - Opens `/edit-reminder` flow

---

## 🔄 How It Works

### Architecture

**3 Main Services:**

1. **NotificationManager** (`services/notificationManager.js`)
   - Manages templates (create, read, update, delete)
   - Manages scheduled reminders (create, read, update, delete)
   - Stores data in `data/notifications.json`
   - Calculates next trigger times
   - Validates intervals (max 60 days, or 'ee' for special pattern)
   - Handles notification types: 0 = standard, 1 = standardized (auto-delete 23h 50min)
   - Handles dynamic interval calculation for 'ee' pattern (3d x8, then 4d, repeating)

2. **BoardManager** (`services/boardManager.js`)
   - Creates/updates/deletes embeds on notifications board
   - Updates all embeds every minute
   - Syncs scheduled reminders to board on startup
   - Manages control panel at bottom of board

3. **Scheduler** (`services/scheduler.js`)
   - Checks every 30 seconds for scheduled reminders to trigger
   - Fetches template and builds message
   - Sends Text or Embed notification to configured channel
   - Updates next trigger time
   - Updates board embed

### Data Structure

**File:** `data/notifications.json`

```json
{
  "templates": [
    {
      "id": "tpl_1",
      "name": "Boss Reminder",
      "type": "text",
      "creator": "userId",
      "createdAt": "ISO string",
      "text": "Boss spawns soon!"
    },
    {
      "id": "tpl_2",
      "name": "Event Announcement",
      "type": "embed",
      "creator": "userId",
      "createdAt": "ISO string",
      "embedTitle": "Community Event",
      "embedDescription": "Join us for...",
      "embedIcon": "https://...",
      "embedImage": "https://..."
    }
  ],
  "scheduled": [
    {
      "id": "sch_1",
      "templateId": "tpl_1",
      "creator": "userId",
      "createdAt": "ISO string",
      "firstTrigger": "ISO string",
      "interval": "1d",
      "intervalMs": 86400000,
      "nextTrigger": "ISO string",
      "channelId": "channelId",
      "roles": ["roleId1", "roleId2"],
      "status": "active",
      "boardMessageId": "messageId",
      "triggerCount": 0  // For 'ee' pattern: tracks cycle position (0-8)
    }
  ],
  "nextId": 3
}
```

### Data Flow

**Creating a scheduled reminder:**
1. User runs `/new-reminder` → creates template
2. User runs `/set-reminder` → selects template, sets timing
3. NotificationManager creates scheduled reminder in storage
4. BoardManager creates embed on board channel
5. User gets confirmation

**Triggering a notification:**
1. Scheduler checks every 30 seconds
2. Finds scheduled reminder(s) ready to trigger
3. Fetches template from NotificationManager
4. Builds message (Text or Embed based on template type)
5. Sends to configured channel with role pings
6. Updates next trigger time
7. BoardManager updates embed

**EE Pattern interval calculation:**
- For `interval: "ee"`, the next trigger is calculated dynamically based on `triggerCount % 9`:
  - Positions 0-7 (first 8 triggers): Add 3 days
  - Position 8 (9th trigger): Add 4 days
  - Then cycle repeats (position 0 again)
- `triggerCount` increments after each trigger
- Example cycle: 3d → 3d → 3d → 3d → 3d → 3d → 3d → 3d → 4d → (repeat)

---

## 📝 Examples

### Example 1: Daily Boss Reminder

**Step 1: Create Template**
```
/new-reminder
→ Type: Text
→ Name: "Boss Reminder"
→ Text: "Boss spawns in 1 hour! Get ready @everyone!"
→ Approve
→ Result: Template tpl_1 created
```

**Step 2: Schedule It**
```
/set-reminder
→ Select: "Boss Reminder"
→ First trigger: 2026-03-20 10:00
→ Interval: 1d
→ Channel: #raids
→ Roles: @Raiders
→ Result: Scheduled sch_1 created
→ Sends every day at 10:00
```

### Example 2: Hourly Event Reminder with Embed

**Step 1: Create Template**
```
/new-reminder
→ Type: Embed
→ Name: "Event Announcement"
→ Title: "Community Event Starting Soon!"
→ Description: "Join us in the main hall!"
→ Icon: https://...
→ Image: https://...
→ Approve
→ Result: Template tpl_2 created
```

**Step 2: Schedule It**
```
/set-reminder
→ Select: "Event Announcement"
→ First trigger: 2026-03-20 15:00
→ Interval: 1h
→ Channel: #events
→ Roles: @Members, @VIP
→ Result: Scheduled sch_2 created
→ Sends every hour starting at 15:00
```

### Example 3: EE Pattern Reminder

**Step 1: Create Template**
```
/new-reminder
→ Type: Text or Embed
→ Name: "Special Event"
→ Content: Your message
→ Approve
→ Result: Template tpl_3 created
```

**Step 2: Schedule It**
```
/set-reminder
→ Select: "Special Event"
→ First trigger: 2026-03-20 18:00
→ Interval: ee
→ Channel: #events
→ Roles: @Everyone
→ Result: Scheduled sch_3 created
→ Sends 8 times every 3 days, then once after 4 days, repeating cyclically
```

**Trigger timeline:**
```
Trigger 1: 2026-03-20 18:00 (Day 0)
Trigger 2: 2026-03-23 18:00 (Day 3)  - +3d
Trigger 3: 2026-03-26 18:00 (Day 6)  - +3d
Trigger 4: 2026-03-29 18:00 (Day 9)  - +3d
Trigger 5: 2026-04-01 18:00 (Day 12) - +3d
Trigger 6: 2026-04-04 18:00 (Day 15) - +3d
Trigger 7: 2026-04-07 18:00 (Day 18) - +3d
Trigger 8: 2026-04-10 18:00 (Day 21) - +3d
Trigger 9: 2026-04-14 18:00 (Day 25) - +4d (9th trigger)
Trigger 10: 2026-04-17 18:00 (Day 28) - +3d (cycle repeats)
...
```

---

## ⚙️ Configuration

**File:** `config/config.js`

```javascript
{
    notificationsBoardChannelId: process.env.STARBOT_NOTIFICATIONS_BOARD_CHANNEL,
    boardUpdateInterval: 60000, // 1 minute
    maxNotificationsPerUser: 50,
    maxTotalNotifications: 200
}
```

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

**Notifications not triggering:**
- Check scheduler is running (logs show "Scheduler initialized - checking every 30 seconds")
- Check notification status is "Active" not "Paused"
- Check trigger time is in the future

---

## 📚 Code Reference

**Creating a template programmatically:**

```javascript
// Text template
const textTemplate = await notificationManager.createTemplate(
    userId,
    'Template Name',
    'text',
    { text: 'Notification message' }
);

// Embed template
const embedTemplate = await notificationManager.createTemplate(
    userId,
    'Template Name',
    'embed',
    {
        embedTitle: 'Title',
        embedDescription: 'Description',
        embedIcon: 'https://...',
        embedImage: 'https://...'
    }
);
```

**Creating a scheduled reminder programmatically:**

```javascript
const scheduled = await notificationManager.createScheduled(
    userId,
    'tpl_1', // template ID
    '2026-03-20T10:00:00.000Z', // first trigger
    '1d', // interval
    'channelId',
    ['roleId1', 'roleId2'] // roles
);
await boardManager.createEmbed(scheduled);
```

---

## ✅ Checklist for Deployment

- [ ] Set up `.env` with all required variables
- [ ] Create notifications board channel
- [ ] Run `npm install`
- [ ] Run `npm run deploy-commands`
- [ ] Start bot with `npm run starbot`
- [ ] Test with `/new-reminder` to create template
- [ ] Test with `/set-reminder` to schedule it
- [ ] Verify embed appears on notifications board
- [ ] Wait for trigger and verify it works
- [ ] Test `/edit-reminder` to edit/delete

---

## 🎯 Key Differences from Old System

**Old System:**
- 3 types: one-time, recurring, event
- Created directly with full params in one command
- `/reminder`, `/recurring`, `/event` commands

**New System:**
- 2-step: Create template → Schedule it
- Reusable templates (create once, schedule many times)
- `/new-reminder`, `/set-reminder`, `/edit-reminder` commands
- More flexible intervals (1s to 60d) vs. fixed daily/weekly
- Notification types: Standard (type 0) and Standardized (type 1, auto-delete 23h 50min)
- Cleaner separation: content (template) vs. timing (scheduled)
