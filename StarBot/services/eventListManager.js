const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

const EVENT_SUBSCRIPTION_ROLE_ID = '1325137220960784464';

class EventListManager {
    constructor(client, config, logger, eventManager) {
        this.client = client;
        this.config = config;
        this.logger = logger;
        this.eventManager = eventManager;
        this.listChannel = null;
    }

    async initialize() {
        try {
            const channelId = this.eventManager.getListChannelId();
            if (channelId) {
                const channel = await this.client.channels.fetch(channelId);
                if (channel) {
                    this.listChannel = channel;
                    this.logger.success('EventListManager initialized');
                    await this.ensureEventsList();
                } else {
                    this.logger.warn('Events list channel not found');
                }
            } else {
                this.logger.info('Events list channel not set');
            }
        } catch (error) {
            this.logger.error('Failed to initialize EventListManager:', error);
        }
    }

    async setListChannel(channelId) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel) {
                throw new Error('Channel not found');
            }

            const oldChannelId = this.eventManager.getListChannelId();
            const oldMessageId = this.eventManager.getListMessageId();

            if (oldChannelId === channelId && oldMessageId) {
                this.logger.info('Events list already on this channel - no action needed');
                return { success: true, sameChannel: true, channelName: channel.name };
            }

            if (oldChannelId && oldMessageId && oldChannelId !== channelId) {
                try {
                    const oldChannel = await this.client.channels.fetch(oldChannelId);
                    if (oldChannel) {
                        const oldMessage = await oldChannel.messages.fetch(oldMessageId);
                        await oldMessage.delete();
                        this.logger.info(`Deleted old events list embed from channel: ${oldChannel.name}`);
                    }
                } catch (error) {
                    this.logger.warn(`Could not delete old events list embed: ${error.message}`);
                }
            }

            this.listChannel = channel;
            await this.eventManager.setListChannel(channelId);
            await this.ensureEventsList();

            this.logger.success(`Events list channel set to: ${channel.name}`);
            return { success: true, sameChannel: false, channelName: channel.name };
        } catch (error) {
            this.logger.error('Failed to set events list channel:', error);
            throw error;
        }
    }

    // Build the events list embed with 3-tier categorization
    buildEventsList() {
        const events = this.eventManager.getAllEvents();

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('\ud83d\udcc5 Upcoming Events')
            .setTimestamp();

        if (events.length === 0) {
            embed.setDescription('_No events scheduled. Use the control panel to add events._');
        } else {
            const sorted = [...events].sort((a, b) =>
                new Date(a.nextTrigger) - new Date(b.nextTrigger)
            );

            const now = Date.now();
            const h24 = 24 * 60 * 60 * 1000;
            const d7  = 7  * 24 * 60 * 60 * 1000;

            const soon  = sorted.filter(e => (new Date(e.nextTrigger).getTime() - now) < h24);
            const week  = sorted.filter(e => { const t = new Date(e.nextTrigger).getTime() - now; return t >= h24 && t < d7; });
            const later = sorted.filter(e => (new Date(e.nextTrigger).getTime() - now) >= d7);

            const buildLines = (list, withAlarm) =>
                list.map(e => {
                    const ts = Math.floor(new Date(e.nextTrigger).getTime() / 1000);
                    const suffix = withAlarm ? ' \ud83d\udea8' : '';
                    return `**${e.name}** - <t:${ts}:R>${suffix}`;
                }).join('\n');

            const sections = [];
            if (soon.length > 0)  sections.push(`## \ud83d\udea8 Next 24 Hours\n${buildLines(soon, true)}`);
            if (week.length > 0)  sections.push(`## \ud83d\udcc6 Next 7 Days\n${buildLines(week, false)}`);
            if (later.length > 0) sections.push(`## \ud83d\uddd3\ufe0f Later\n${buildLines(later, false)}`);

            embed.setDescription(sections.join('\n\n'));
        }

        embed.setFooter({ text: `Total events: ${events.length}` });
        return embed;
    }

    // Build subscribe button component
    buildSubscribeRow() {
        const btn = new ButtonBuilder()
            .setCustomId('event_notifications_subscribe')
            .setLabel('Get notified about upcoming Events!')
            .setStyle(ButtonStyle.Success)
            .setEmoji('\ud83d\udd14');

        return new ActionRowBuilder().addComponents(btn);
    }

    async ensureEventsList() {
        if (!this.listChannel) {
            this.logger.warn('Cannot update events list - no channel set');
            return;
        }

        try {
            const messageId = this.eventManager.getListMessageId();
            const embed = this.buildEventsList();
            const row = this.buildSubscribeRow();

            if (messageId) {
                try {
                    const message = await this.listChannel.messages.fetch(messageId);
                    await message.edit({ embeds: [embed], components: [row] });
                    this.logger.info('Updated events list');
                    return;
                } catch (error) {
                    this.logger.warn('Events list message not found, creating new one');
                }
            }

            const message = await this.listChannel.send({ embeds: [embed], components: [row] });
            await this.eventManager.setListMessageId(message.id);
            this.logger.success('Created events list');
        } catch (error) {
            this.logger.error('Failed to update events list:', error);
        }
    }
}

module.exports = EventListManager;
