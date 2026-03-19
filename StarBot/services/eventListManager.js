const { EmbedBuilder } = require('discord.js');

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

                    // Create or update list
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

    // Set list channel
    async setListChannel(channelId) {
        try {
            const channel = await this.client.channels.fetch(channelId);
            if (!channel) {
                throw new Error('Channel not found');
            }

            // Get old channel and message IDs before switching
            const oldChannelId = this.eventManager.getListChannelId();
            const oldMessageId = this.eventManager.getListMessageId();

            // Check if it's the same channel
            if (oldChannelId === channelId && oldMessageId) {
                this.logger.info('Events list already on this channel - no action needed');
                return {
                    success: true,
                    sameChannel: true,
                    channelName: channel.name
                };
            }

            // Delete old embed from previous channel if exists
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
                    // Continue anyway - not critical
                }
            }

            // Set new channel
            this.listChannel = channel;
            await this.eventManager.setListChannel(channelId);

            // Create new list on new channel
            await this.ensureEventsList();

            this.logger.success(`Events list channel set to: ${channel.name}`);
            return {
                success: true,
                sameChannel: false,
                channelName: channel.name
            };
        } catch (error) {
            this.logger.error('Failed to set events list channel:', error);
            throw error;
        }
    }

    // Build events list embed
    buildEventsList() {
        const events = this.eventManager.getAllEvents();

        const embed = new EmbedBuilder()
            .setColor(0x5865F2) // Blurple
            .setTitle('📅 Upcoming Events')
            .setTimestamp();

        if (events.length === 0) {
            embed.setDescription('_No events scheduled. Use the control panel to add events._');
        } else {
            // Sort events by next trigger (earliest first)
            const sortedEvents = [...events].sort((a, b) => {
                return new Date(a.nextTrigger) - new Date(b.nextTrigger);
            });

            let description = '';
            for (const event of sortedEvents) {
                const timestamp = Math.floor(new Date(event.nextTrigger).getTime() / 1000);
                description += `**${event.name}** - <t:${timestamp}:R> ⏳\n`;
            }

            embed.setDescription(description);
        }

        embed.setFooter({ text: `Total events: ${events.length}` });

        return embed;
    }

    // Ensure events list exists and is updated
    async ensureEventsList() {
        if (!this.listChannel) {
            this.logger.warn('Cannot update events list - no channel set');
            return;
        }

        try {
            const messageId = this.eventManager.getListMessageId();
            const embed = this.buildEventsList();

            if (messageId) {
                // Try to update existing message
                try {
                    const message = await this.listChannel.messages.fetch(messageId);
                    await message.edit({ embeds: [embed] });
                    this.logger.info('Updated events list');
                    return;
                } catch (error) {
                    // Message doesn't exist, create new one
                    this.logger.warn('Events list message not found, creating new one');
                }
            }

            // Create new message
            const message = await this.listChannel.send({ embeds: [embed] });
            await this.eventManager.setListMessageId(message.id);
            this.logger.success('Created events list');

        } catch (error) {
            this.logger.error('Failed to update events list:', error);
        }
    }
}

module.exports = EventListManager;
