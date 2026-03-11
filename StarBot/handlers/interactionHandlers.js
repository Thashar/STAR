const messages = require('../config/messages');

async function handleInteraction(interaction, sharedState) {
    const { logger } = sharedState;

    try {
        // Obsługa komend slash
        if (interaction.isChatInputCommand()) {
            await handleSlashCommand(interaction, sharedState);
        }
        // Obsługa buttonów
        else if (interaction.isButton()) {
            await handleButton(interaction, sharedState);
        }
        // Obsługa select menu
        else if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction, sharedState);
        }

    } catch (error) {
        logger.error('Błąd podczas obsługi interakcji:', error);

        const errorMessage = messages.errors.generic;

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        }
    }
}

async function handleSlashCommand(interaction, sharedState) {
    const { logger } = sharedState;

    const commandName = interaction.commandName;
    logger.info(`Komenda: /${commandName} przez ${interaction.user.tag}`);

    switch (commandName) {
        case 'ping':
            await interaction.reply({ content: '🏓 Pong!', ephemeral: true });
            break;

        default:
            await interaction.reply({
                content: '❌ Nieznana komenda.',
                ephemeral: true
            });
    }
}

async function handleButton(interaction, sharedState) {
    const { logger } = sharedState;

    const customId = interaction.customId;
    logger.info(`Button: ${customId} przez ${interaction.user.tag}`);

    // Tutaj dodaj obsługę buttonów
    await interaction.reply({
        content: messages.info.processing,
        ephemeral: true
    });
}

async function handleSelectMenu(interaction, sharedState) {
    const { logger } = sharedState;

    const customId = interaction.customId;
    logger.info(`Select Menu: ${customId} przez ${interaction.user.tag}`);

    // Tutaj dodaj obsługę select menu
    await interaction.reply({
        content: messages.info.processing,
        ephemeral: true
    });
}

module.exports = {
    handleInteraction
};
