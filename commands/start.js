// import bot
const {bot} = require("../services/bot.js");
const {Keyboard, InlineKeyboard} = require("grammy");
const {Menu, MenuRange} = require("@grammyjs/menu");

function formatDateWithHours(isoDate) {
  const date = new Date(isoDate);

  // Extract the date components
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0"); // Month is zero-based
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

function prettifyMoneyString(moneyString) {
  // Add spaces every three digits
  const formattedMoneyString = moneyString
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return formattedMoneyString;
}

// constants
const {
  GROUPS,
  CREATE_GROUP,
  SPEND_MONEY,
  CALCULATION,
  MY_EXPENSES,
  ALL_SPEND_LIST,
  GROUP_MANAGE,
  BACK,
  CONFIRM,
  CLEAR_EXPENSES,
  EDIT_GROUP_NAME,
  GET_GROUP_JOIN_LINK,
  DELETE_GROUP,
} = require("../utils/keyboard_constants");
const {
  HOME,
  GROUP_DETAIL,
  GROUP_CREATING,
  GROUP_MANAGE_SCREEN,
  WRITING_PAYMENT,
  CLEAR_EXPENSES_SCREEN,
  EDIT_GROUP_NAME_SCREEN,
  DELETE_GROUP_SCREEN,
} = require("../utils/screen_constants");
const {
  CREATE_GROUP_ACTION,
  SPEND_MONEY_ACTION,
  GROUP_NAME_UPDATE,
  CONFIRM_CLEAR_EXPENSES,
  EDIT_GROUP_NAME_ACTION,
} = require("../utils/user_action_constants");

const ObjectId = require("mongodb").ObjectId;
const User = require("../model/user");
const Group = require("../model/group");
const Payment = require("../model/payment");

const keyboard_group_detail = new Keyboard()
  .text(SPEND_MONEY)
  .text(CALCULATION)
  .row()
  .text(MY_EXPENSES)
  .text(ALL_SPEND_LIST)
  .row()
  .text(GROUP_MANAGE)
  .row()
  .text(BACK)
  .resized();

const keyboard_group_mange = new Keyboard()
  .text(CLEAR_EXPENSES)
  .row()
  .text(EDIT_GROUP_NAME)
  .row()
  .text(GET_GROUP_JOIN_LINK)
  .row()
  .text(DELETE_GROUP)
  .row()
  .text(BACK)
  .resized();

async function sendGroupList(ctx) {
  await ctx.reply("Guruhlar: ", {reply_markup: groups_menu});
}

async function returnHomePageButtons(text, ctx) {
  const keyboard = new Keyboard()
    .text(GROUPS)
    .row()
    .text(CREATE_GROUP)
    .resized();
  await ctx.reply(text, {
    reply_markup: keyboard,
  });
}

const groups_menu = new Menu("groups");
bot.use(groups_menu);
groups_menu.dynamic(async (ctx) => {
  const chat_id = ctx.message?.from?.id || ctx?.update?.callback_query?.from.id;

  const user = await User.findGroupsByChatId(chat_id);

  const range = new MenuRange();

  user.groups.forEach((group) => {
    range
      .text(group.name, async () => {
        await User.updateOne(
          {_id: user._id},
          {$set: {selectedGroupId: group._id, screen: GROUP_DETAIL}, new: true}
        );

        await ctx.reply(
          `${group.name} guruhi uchun xarajat yozishingiz va hisob-kitoblarni ko'rishingiz mumkin`,
          {
            reply_markup: keyboard_group_detail,
          }
        );
      })
      .row();
  });
  return range;
});

bot.command("start", async (ctx) => {
  const join_group_id = ObjectId.isValid(ctx?.match) ? ctx?.match : null;
  const chat_id = ctx.message.chat.id;
  const name = ctx.message.chat.first_name;
  const user = await User.findOne({chat_id: chat_id});
  const group = await Group.findOne({_id: join_group_id});
  const user_payload = {
    name,
    chat_id,
  };
  if (!user) {
    let newUser = new User(user_payload);
    newUser.save();
    if (group) {
      await User.followNewGroup(newUser._id, group._id);
    }
  } else {
    await User.updateOne(
      {chat_id: user.chat_id},
      {
        $set: user_payload,
      }
    );
    if (group) {
      await User.followNewGroup(user._id, group._id);
    }
  }

  returnHomePageButtons(
    "Guruhlar o'rtasida xisob-kitobni amalga oshiruvchi botga xush kelibsiz",
    ctx
  );
});

// HEARS

// HOME SCREEN
bot.hears(GROUPS, async (ctx) => {
  sendGroupList(ctx);
});
bot.hears(CREATE_GROUP, async (ctx) => {
  const chat_id = ctx.message.from.id;

  const updatedUser = await User.findOneAndUpdate(
    {chat_id},
    {$set: {action: CREATE_GROUP_ACTION, screen: GROUP_CREATING}}
  );

  if (updatedUser) {
    const keyboard = new Keyboard().text(BACK).row().resized();

    await ctx.reply("Guruh nomini kiriting:", {
      reply_markup: keyboard,
    });
  }
});

// GROUP DETAIL - MAIN BOARD
bot.hears(SPEND_MONEY, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const updatedUser = await User.updateOne(
    {chat_id},
    {$set: {action: SPEND_MONEY_ACTION, screen: WRITING_PAYMENT}}
  );

  if (updatedUser) {
    const keyboard = new Keyboard().text(BACK).row().resized();
    await ctx.reply(
      "Xarajat uchun summa va izohni kiriting \nIzoh kiritish ixtiyoriy \n \n Masalan: 12000 nonga",
      {
        reply_markup: keyboard,
      }
    );
  }
});

// GET CALCULATIONS
bot.hears(CALCULATION, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);
  const group_id = user.selectedGroupId;
  const group = await Group.findById(group_id);

  if (group.totalSpent == 0) {
    ctx.reply(`${group.name} guruhi uchun hali hech kim xarajat yozmagan`);
    return;
  }

  const followers = await User.find({groups: group_id}).populate("totalSpent");
  const numberOfFollowers = followers.length;
  const equalShare = parseInt(group.totalSpent / numberOfFollowers);

  let sending_text = `${
    group.name
  } guruhi uchun hisob-kitob: \n \nHar birimizga ${prettifyMoneyString(
    equalShare
  )} dan \n \n`;
  for (const follower of followers) {
    const get_money = follower.getTotalSpentInGroup(group_id) - equalShare;
    let given = "";

    if (get_money < 0) {
      given = prettifyMoneyString(Math.abs(get_money)) + " ❌ beradi";
    }
    if (get_money > 0) {
      given = prettifyMoneyString(get_money) + " ✅ oladi";
    }
    if (get_money == 0) {
      given = " bermayi ham olmaydi ham 🟰";
    }
    sending_text = sending_text + follower.name + `  ____  ` + given + `\n`;
  }

  ctx.reply(sending_text);
});

// MY EXPENSES
bot.hears(MY_EXPENSES, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);
  const group_id = user.selectedGroupId;
  const group = await Group.findById(group_id);

  const total_amount = await user.getTotalSpendingByGroup(group_id);

  if (total_amount == 0) {
    ctx.reply(`Siz ${group.name} guruhi uchun xarajat yozmagansiz`);
    return;
  }

  const user_payments = await Payment.getUserPaymentsByGroup(
    user._id,
    group_id
  );

  let sending_text = `${group.name} guruhi uchun sarflagan xarajatlarim:  \n \n`;

  user_payments.forEach((payment, index) => {
    sending_text =
      sending_text +
      `${index + 1}. ${formatDateWithHours(
        payment.createdAt
      )}  ___  ${prettifyMoneyString(payment.amount)} ${payment.comment}\n`;
  });
  sending_text = sending_text + `\nJami: ${prettifyMoneyString(total_amount)}`;

  ctx.reply(sending_text);
});

// ALL_SPEND_LIST
bot.hears(ALL_SPEND_LIST, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);
  const group_id = user.selectedGroupId;
  const group = await Group.findById(group_id);

  const users_list = await User.getAllUsersWithTotalSpendingByGroup(group_id);
  if (group.totalSpent == 0) {
    ctx.reply(`${group.name} guruhi uchun hali hech kim xarajat yozmagan`);
    return;
  }
  let sending_text = `${group.name} guruhi uchun ${prettifyMoneyString(
    group.totalSpent
  )} sarflandi \n \n`;

  users_list.forEach((user_item, index) => {
    sending_text =
      sending_text +
      `${index + 1}. ${user_item.name}  ___  ${prettifyMoneyString(
        user_item.totalAmount
      )}\n`;
  });

  ctx.reply(sending_text);
});

bot.hears(GROUP_MANAGE, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);
  const group_id = user.selectedGroupId;
  const group = await Group.findById(group_id);
  const updatedUser = await User.findOneAndUpdate(
    {chat_id},
    {$set: {screen: GROUP_MANAGE_SCREEN}}
  );

  if (updatedUser) {
    await ctx.reply(`${group.name} guruh boshqaruvi`, {
      reply_markup: keyboard_group_mange,
    });
  }
});

// GROUP MANAGE HEARS
bot.hears(CLEAR_EXPENSES, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const updatedUser = await User.findOneAndUpdate(
    {chat_id},
    {$set: {action: CONFIRM_CLEAR_EXPENSES, screen: CLEAR_EXPENSES_SCREEN}}
  );

  if (updatedUser) {
    const keyboard = new Keyboard().text(CONFIRM).row().text(BACK).resized();
    await ctx.reply(
      `Xarajatlarni tozalashni tasdiqlang \n\nO'chirilgan ma'lumotlarni qayta tiklash imkoni majvud emas !!!`,
      {
        reply_markup: keyboard,
      }
    );
  }
});

bot.hears(EDIT_GROUP_NAME, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findOne({chat_id}).populate("selectedGroupId");
  const updatedUser = await User.findOneAndUpdate(
    {chat_id},
    {$set: {action: EDIT_GROUP_NAME_ACTION, screen: EDIT_GROUP_NAME_SCREEN}}
  );

  if (updatedUser) {
    const group = user.selectedGroupId.name;

    ctx.reply(`${group} uchun yangi nom kiriting:`, {
      reply_markup: new Keyboard().text(BACK).resized(),
    });
  }
});

bot.hears(GET_GROUP_JOIN_LINK, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);
  const group_id = user.selectedGroupId;
  const group = await Group.findById(group_id);

  await User.findOneAndUpdate({chat_id}, {$set: {screen: GROUP_DETAIL}});

  await ctx.reply(
    `${group.name} guruhiga qo'shilish havolasi: \n \nhttps://t.me/xarajat_hisoblash_bot?start=${user.selectedGroupId}`,
    {
      reply_markup: keyboard_group_detail,
    }
  );
});

bot.hears(CONFIRM, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);
  const screen = user?.screen;

  const selected_group_id = user.selectedGroupId;
  if (screen === CLEAR_EXPENSES_SCREEN) {
    await User.updateMany(
      {"totalSpent.group": selected_group_id},
      {$pull: {totalSpent: {group: selected_group_id}}}
    );

    await Payment.deleteMany({group: selected_group_id});

    const group = await Group.findByIdAndUpdate(selected_group_id, {
      totalSpent: 0,
    });

    await User.findOneAndUpdate(
      {chat_id},
      {$set: {action: "", screen: GROUP_DETAIL}}
    );

    const followers = await User.find({groups: selected_group_id.toString()});

    for (const follower of followers.filter((i) => i.chat_id !== chat_id)) {
      bot.api.sendMessage(
        follower.chat_id,
        `${group.name} guruh xarajatlari tozalandi`
      );
    }

    await ctx.reply(`${group.name} guruh xarajatlari tozalandi`, {
      reply_markup: keyboard_group_detail,
    });
  }
});
bot.hears(BACK, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);
  const screen = user?.screen;

  if (screen === GROUP_DETAIL) {
    await User.findOneAndUpdate({chat_id}, {$set: {action: "", screen: HOME}});
    sendGroupList(ctx);
    returnHomePageButtons("Bosh sahifa", ctx);
  }

  if (screen === GROUP_CREATING) {
    returnHomePageButtons("Bosh sahifa", ctx);
    sendGroupList(ctx);
    await User.findOneAndUpdate({chat_id}, {$set: {action: "", screen: HOME}});
  }

  if (screen === WRITING_PAYMENT) {
    await User.findOneAndUpdate(
      {chat_id},
      {$set: {action: "", screen: GROUP_DETAIL}}
    );

    await ctx.reply(`Xarajat yozish bekor qilindi`, {
      reply_markup: keyboard_group_detail,
    });
  }

  if (screen === GROUP_MANAGE_SCREEN) {
    await ctx.reply(`Orqaga`, {
      reply_markup: keyboard_group_detail,
    });
  }

  if (screen === CLEAR_EXPENSES_SCREEN) {
    await User.findOneAndUpdate(
      {chat_id},
      {$set: {action: "", screen: GROUP_MANAGE_SCREEN}}
    );

    await ctx.reply(`Tasdiqlash bekor qilindi`, {
      reply_markup: keyboard_group_mange,
    });
  }

  if (screen === EDIT_GROUP_NAME_SCREEN) {
    await User.findOneAndUpdate(
      {chat_id},
      {$set: {action: "", screen: GROUP_MANAGE_SCREEN}}
    );

    await ctx.reply(`Tasdiqlash bekor qilindi`, {
      reply_markup: keyboard_group_mange,
    });
  }
});

bot.on("message", async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);
  const action = user.action;

  const message = ctx.message.text;

  // create group
  if (action === CREATE_GROUP_ACTION) {
    const newGroup = new Group({
      name: message, // Replace with the desired group name
      admin: user._id,
    });

    // Save the new group
    await newGroup.save();

    await ctx.reply(
      `${message} guruh yaratildi \n \n Qo'shilish uchun havola:`
    );
    await ctx.reply(`https://t.me/xarajat_hisoblash_bot?start=${newGroup._id}`);
  }

  // spend money
  if (action === SPEND_MONEY_ACTION) {
    const pattern = /^(\d+(\s+\S+)*)$/;

    if (!pattern.test(message)) {
      ctx.reply("To'g'ri formatda kiriting !!!");
      return;
    }

    const amount = parseInt(message);

    let spaceIndex = message.indexOf(" ");
    let comment = "";

    if (spaceIndex !== -1) {
      comment = message.substring(spaceIndex + 1) || "";
    }

    if (comment.split(" ")?.length > 5) {
      ctx.reply("Izoh 5 ta so'zdan ko'p bo'lmasligi kerak");
      return;
    }

    if (amount) {
      const payment = new Payment({
        amount: amount,
        payer: user._id,
        group: user.selectedGroupId,
        comment: comment,
      });
      // Save the payment
      await payment.save();

      const group = await Group.findById(user.selectedGroupId);
      group.totalSpent += amount;
      await group.save();

      const followers = await User.find({groups: group._id});

      await User.findOneAndUpdate(
        {chat_id},
        {$set: {action: "", screen: GROUP_DETAIL}}
      );

      for (const follower of followers.filter((i) => i.chat_id !== chat_id)) {
        bot.api.sendMessage(
          follower.chat_id,
          `${user.name} ${group.name} guruhi uchun ${amount} ${
            comment ? `( ${comment} )` : ""
          } xarajat yozdi`
        );
      }

      await ctx.reply(
        `${group.name} guruhi uchun ${amount} ${
          comment ? `( ${comment} )` : ""
        } xarajat yozildi`,
        {
          reply_markup: keyboard_group_detail,
        }
      );
    }
  }

  if (action === EDIT_GROUP_NAME_ACTION) {
    const updatedGroup = await Group.updateOne(
      {
        admin: user._id,
        _id: user.selectedGroupId,
      },
      {$set: {name: message}}
    );

    if (updatedGroup) {
      await User.findOneAndUpdate(
        {chat_id},
        {$set: {action: "", screen: GROUP_DETAIL}}
      );

      ctx.reply(`Guruh nomi ${message} ga o'zgartirildi`, {
        reply_markup: keyboard_group_detail,
      });
    }
  }
});

// getAllUsersWithTotalSpendingByGroup
