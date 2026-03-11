require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

module.exports = {
    token: process.env.STARBOT_TOKEN,
    clientId: process.env.STARBOT_CLIENT_ID,
    guildId: process.env.STARBOT_GUILD_ID
};
