require("dotenv").config();

const connectDB = require("./services/mongodb");

connectDB();

const {bot} = require("./services/bot.js");

require("./commands/start.js");

// Handle other messages.
bot.on("message", (ctx) => ctx.reply("Got another message!"));
