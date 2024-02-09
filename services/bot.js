const {Bot} = require("grammy");

const bot = new Bot(process.env.BOT_TOKEN);

bot.start();

module.exports = {
  bot,
};
