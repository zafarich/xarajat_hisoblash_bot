const chat_token = "6864993865:AAGXPf9Kbg63CmgzWeXTaPTybyC6oN5VXWw";
const admin_id = 907423583;
const {Telegraf} = require("telegraf");
const bot = new Telegraf(chat_token);
const mongoose = require("mongoose");
const DB_URI = process.env.DB_URI;
const User = require("./model/user");
const Payment = require("./model/payment");

function dateFormat(date) {
  let dateIso = new Date(date);
  let day = dateIso.getDate;

  return day;
}
mongoose.set("strictQuery", true);
// App & MongoDB Connections
mongoose
  .connect("mongodb://localhost:27017/kvartira", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {});

bot.start(async (ctx) => {
  let chat_id = ctx.message.chat.id;
  let name = ctx.message.chat.first_name;
  let user = await User.findOne({chat_id: chat_id});
  if (!user) {
    let newUser = new User({
      chat_id: chat_id,
      name: name,
    });

    newUser.save();
  } else {
    await User.updateOne(
      {chat_id: user.chat_id},
      {
        $set: {
          name,
          chat_id,
        },
      }
    );
  }
  let keys = [
    [{text: "Rasxod"}, {text: "Menikilar"}],
    [{text: "Umumiy"}, {text: "Hisob-kitob"}],
  ];

  if (chat_id == admin_id) {
    keys.push([{text: "Tozalash"}]);
  }

  bot.telegram.sendMessage(ctx.message.chat.id, "Boshladik!!!", {
    reply_markup: {
      keyboard: keys,
      resize_keyboard: true,
    },
  });
});

bot.hears("Rasxod", async (ctx) => {
  let chat_id = ctx.message.chat.id;
  await User.updateOne(
    {chat_id: chat_id},
    {
      $set: {
        writing: true,
      },
    }
  );
  ctx.reply("Summani kirit:");
});
bot.hears("Menikilar", async (ctx) => {
  let chat_id = ctx.message.chat.id;
  let user = await User.findOne({chat_id: chat_id});
  let user_id = user._id.toString();

  let rasxod = await Payment.find({user: user._id});

  let str = "";

  function dateFormat(date) {
    let dateIso = new Date(date);
    let day = dateIso.getDate();
    let month = dateIso.getMonth() + 1;
    let year = dateIso.getFullYear();

    if (day < 10) {
      day = "0" + day;
    }
    if (month < 10) {
      month = "0" + month;
    }

    return day + "-" + month + "-" + year;
  }

  if (rasxod.length) {
    rasxod.forEach((item) => {
      str = str + dateFormat(item.createdAt) + ` ---- ` + item.amount + `\n`;
    });

    ctx.reply(str);
  } else {
    ctx.reply("Sen rasxod qilmading JMOT");
  }
});

bot.hears("Umumiy", async (ctx) => {
  await User.aggregate([
    {
      $lookup: {
        from: "payments",
        localField: "_id",
        foreignField: "user",
        as: "payments",
      },
    },
    {
      $project: {
        name: 1,
        total: {$sum: "$payments.amount"},
      },
    },
  ]).exec((err, data) => {
    let str = "";
    data.forEach((item) => {
      str = str + item.name + ` ---- ` + item.total + `\n`;
    });
    ctx.reply(str);
  });
});

bot.hears("Hisob-kitob", async (ctx) => {
  let allSum = 0;

  await Payment.aggregate([
    {
      $group: {
        _id: null,
        total: {$sum: "$amount"},
      },
    },
  ]).exec((err, data) => {
    if (data) {
      if (data.length > 0) {
        allSum = data[0].total ? data[0].total : null;
      }
    }
  });

  const count = await User.countDocuments();

  let center = (allSum / count).toFixed(2);
  await User.aggregate([
    {
      $lookup: {
        from: "payments",
        localField: "_id",
        foreignField: "user",
        as: "payments",
      },
    },
    {
      $project: {
        name: 1,
        total: {$sum: "$payments.amount"},
      },
    },
  ]).exec((err, data) => {
    let str = "";
    data.forEach((item) => {
      let given = "";
      let rachot = item.total - center || 0;

      rachot = rachot * 1000;

      if (rachot < 0) {
        given = -rachot + " beradi ( - )";
      }
      if (rachot > 0) {
        given = rachot + " oladi ( + )";
      }
      if (rachot == 0) {
        given = " Rachchotsan";
      }
      str = str + item.name + ` ---- ` + given + `\n`;
    });
    ctx.reply(str);
  });
});

bot.hears("Tozalash", async (ctx) => {
  let chat_id = ctx.message.chat.id;
  let keys = [];
  if (chat_id == admin_id) {
    keys.push([{text: "Tasdiqlash"}]);
  }

  bot.telegram.sendMessage(ctx.message.chat.id, "Boshladik!!!", {
    reply_markup: {
      keyboard: keys,
      resize_keyboard: true,
    },
  });
});
bot.hears("Tasdiqlash", async (ctx) => {
  await Payment.remove().then((res) => {
    let chat_id = ctx.message.chat.id;
    let keys = [
      [{text: "Rasxod"}, {text: "Menikilar"}],
      [{text: "Umumiy"}, {text: "Hisob-kitob"}],
    ];
    if (chat_id == admin_id) {
      keys.push([{text: "Tozalash"}]);
    }

    bot.telegram.sendMessage(ctx.message.chat.id, "Tozalandi", {
      reply_markup: {
        keyboard: keys,
        resize_keyboard: true,
      },
    });
  });
});
bot.on("text", async (ctx) => {
  let chat_id = ctx.message.chat.id;
  let user = await User.findOne({chat_id: chat_id});

  let user_id = user._id.toString();

  let message = ctx.message.text;

  if (user) {
    if (user.writing) {
      let summa = parseInt(message);
      if (summa) {
        let payment = new Payment({
          user: user_id,
          amount: summa,
        });

        payment.save().then(async (res) => {
          await User.updateOne(
            {chat_id: chat_id},
            {
              $set: {
                writing: false,
              },
            }
          );

          let users = await User.find();

          users.forEach((item) => {
            ctx.telegram.sendMessage(
              item.chat_id,
              `${user.name} ${summa * 1000} so'm xarajat yozildi`
            );
          });

          // ctx.reply();
        });
      } else {
        ctx.reply("To'g'ri formatda kirit!!!");
      }
    }
  }
});

bot.launch();
