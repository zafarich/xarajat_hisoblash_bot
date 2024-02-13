// import bot
const {bot} = require("../services/bot.js");
const {Keyboard, InlineKeyboard} = require("grammy");
const {Menu, MenuRange} = require("@grammyjs/menu");

const bot_name = process.env.BOT_NAME;

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
  DELETE_USERS_BTN,
  DELETE_MY_EXPENSES,
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
const Join = require("../model/join");

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
  .text(EDIT_GROUP_NAME)
  .row()
  .text(GET_GROUP_JOIN_LINK)
  .row()
  .text(DELETE_USERS_BTN)
  .text(DELETE_GROUP)
  .row()
  .text(BACK)
  .resized();

const keyboard_home = new Keyboard()
  .text(GROUPS)
  .row()
  .text(CREATE_GROUP)
  .row()
  .resized();

async function sendGroupList(ctx) {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);

  if (user?.groups?.length) {
    await ctx.reply(
      "Guruhga harajat yozish uchun ustiga bosing \n\nGuruhlar 👇👇👇",
      {reply_markup: groups_menu}
    );
  } else {
    await ctx.reply(
      "Sizda guruhlar yo'q. \n\nGuruh yaratishingiz yoki guruhga qo'shilishingiz kerak"
    );
  }
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

async function calculationExpenses(ctx, send_everyone = false) {
  const chat_id = ctx.message?.from?.id || ctx?.update?.callback_query?.from.id;
  const user = await User.findByChatId(chat_id);
  const group_id = user.selectedGroupId;
  const group = await Group.findById(group_id);

  if (group.totalSpent == 0) {
    ctx.reply(`${group.name} guruhi uchun hali hech kim xarajat yozmagan`);
    return;
  }

  const followers = await User.find({groups: group_id}).populate("totalSpent");

  if (followers?.length === 1) {
    ctx.reply(
      "Hisob-kitob qilish uchun guruhda kamida 2 ta odam bo'lishi kerak"
    );
    return;
  }

  const numberOfFollowers = followers.length;
  const equalShare = parseInt(group.totalSpent / numberOfFollowers);

  let sending_text = `${
    group.name
  } guruhi uchun hisob-kitob: \n \nHar birimizga ${prettifyMoneyString(
    equalShare
  )} dan \n \n`;
  for (const follower of followers) {
    const get_money =
      (await follower.getTotalSpentInGroup(group_id)) - equalShare;
    let given = "";

    if (get_money < 0) {
      given = prettifyMoneyString(Math.abs(get_money)) + " ❌ beradi";
    }
    if (get_money > 0) {
      given = prettifyMoneyString(get_money) + " ✅ oladi";
    }
    if (get_money == 0) {
      given = " bir xil miqdorda xarajat yozilgan";
    }

    sending_text = sending_text + follower.name + `  ____  ` + given + `\n`;
  }

  if (send_everyone) {
    for (const follower of followers) {
      await bot.api.sendMessage(follower.chat_id, sending_text);
    }
  } else {
    ctx.reply(sending_text);
  }
}

async function clearGroupExpenses(
  chat_id,
  selected_group_id,
  is_home = false,
  append_text = ""
) {
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

  for (const follower of followers) {
    bot.api.sendMessage(
      follower.chat_id,
      `${group.name} guruh xarajatlari tozalandi ${append_text}`,
      {
        reply_markup: is_home ? keyboard_home : keyboard_group_detail,
      }
    );
  }
}
const expense_delete = new Menu("expense_delete")
  .text(DELETE_MY_EXPENSES, async (ctx) => {
    await ctx.reply("O'chirmoqchi bo'lgan xarajatni ustiga bosing", {
      reply_markup: delete_expense_item,
    });
  })
  .row();
const delete_expense_item = new Menu("delete_expense_item");
bot.use(delete_expense_item);
bot.use(expense_delete);

delete_expense_item.dynamic(async (ctx) => {
  const chat_id = ctx.message?.from?.id || ctx?.update?.callback_query?.from.id;
  const user = await User.findByChatId(chat_id);
  const group_id = user.selectedGroupId;

  const user_payments = await Payment.getUserPaymentsByGroup(
    user._id,
    group_id
  );
  const range = new MenuRange();

  user_payments.forEach((payment, index) => {
    range
      .text(
        `❌ ${formatDateWithHours(
          payment.createdAt
        )}  __  ${prettifyMoneyString(payment.amount)} ${payment.comment}`,
        async () => {
          await Payment.deletePaymentAndUpdateTotalSpent(payment._id);
          await ctx.reply("Xarajat o'chirildi");
        }
      )
      .row();
  });

  return range;
});

async function sendMyexpenses(ctx) {
  const chat_id = ctx.message?.from?.id || ctx?.update?.callback_query?.from.id;
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

  await ctx.reply(sending_text, {
    reply_markup: expense_delete,
  });
}

const groups_menu = new Menu("groups");
bot.use(groups_menu);
groups_menu.dynamic(async (ctx) => {
  const chat_id = ctx.message?.from?.id || ctx?.update?.callback_query?.from.id;

  const user = await User.findGroupsByChatId(chat_id);

  const range = new MenuRange();

  user?.groups?.forEach((group) => {
    range
      .text(`👥  ${group.name}`, async () => {
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

const user_delete_menu = new Menu("users_delete");
bot.use(user_delete_menu);
user_delete_menu.dynamic(async (ctx) => {
  const chat_id = ctx.message?.from?.id || ctx?.update?.callback_query?.from.id;
  const user = await User.findGroupsByChatId(chat_id);
  const range = new MenuRange();

  const group = await Group.findOne({
    admin: user._id,
    _id: user.selectedGroupId,
  });

  if (group) {
    const followers = await User.find({groups: group._id});
    for (const follower of followers.filter((i) => i.chat_id !== chat_id)) {
      range
        .text(`❌ ${follower.name}`, async () => {
          await User.updateOne(
            {_id: user._id},
            {
              $set: {screen: GROUP_MANAGE_SCREEN},
              new: true,
            }
          );

          await calculationExpenses(ctx, true);

          await User.updateOne(
            {_id: follower._id},
            {$set: {selectedGroupId: null}, $pull: {groups: group._id}}
          );

          const keyboard_home = new Keyboard()
            .text(GROUPS)
            .row()
            .text(CREATE_GROUP)
            .resized();

          bot.api.sendMessage(
            follower.chat_id,
            `Siz ${group.name} guruhidan chiqarildingiz`,
            {
              reply_markup: keyboard_home,
            }
          );

          await User.updateOne(
            {_id: follower.id},
            {$set: {screen: HOME, action: ""}, new: true}
          );

          ctx.reply(`${follower.name} ${group.name} guruhidan o'chirildi`, {
            reply_markup: user_delete_menu,
          });
        })
        .row();
    }
  }
  return range;
});

bot.command("start", async (ctx) => {
  const join_id = ObjectId.isValid(ctx?.match) ? ctx?.match : null;
  const chat_id = ctx.message.chat.id;
  const name = ctx.message.chat.first_name;
  const user = await User.findOne({chat_id: chat_id});
  const join = await Join.findOne({_id: join_id});
  let group = null;
  if (join) {
    group = await Group.findOne({_id: join.group});
  }

  async function FollowNewGroup(user_id, group_id) {
    if (join && group) {
      const find_user = join.users.find((item) => item.toString() == user_id);

      if (!find_user) {
        const admin_id = group.admin;
        const admin = await User.findById(admin_id);
        await User.findByIdAndUpdate(
          user_id,
          {$addToSet: {groups: group_id}},
          {new: true}
        );

        await Join.findByIdAndUpdate(
          join._id,
          {$addToSet: {users: user_id}},
          {new: true}
        );

        await User.updateOne(
          {_id: user_id},
          {$set: {selectedGroupId: group_id, screen: GROUP_DETAIL}}
        );

        const user_find = await User.findById(user_id);

        await ctx.reply(
          `${group.name} guruhi uchun xarajat yozishingiz va hisob-kitoblarni ko'rishingiz mumkin`,
          {
            reply_markup: keyboard_group_detail,
          }
        );

        await bot.api.sendMessage(
          admin.chat_id,
          `${user_find.name}  ${group.name} guruhiga qo'shildi`
        );
      }
    }
  }

  const user_payload = {
    name,
    chat_id,
  };
  if (!user) {
    let newUser = new User(user_payload);
    newUser.save();
    if (true) {
      // user?.groups?.length < 5;
      FollowNewGroup(newUser._id, group?._id);
    } else {
      await ctx.reply("Maksimal guruhlar soni 5 ta");
    }
  } else {
    await User.updateOne(
      {chat_id: user.chat_id},
      {
        $set: user_payload,
      }
    );

    FollowNewGroup(user._id, group?._id);
  }

  await returnHomePageButtons(
    `Guruhlar o'rtasida xisob-kitobni amalga oshiruvchi botga xush kelibsiz\n\nBu bot orqali siz guruhdoshlar(kvartiradoshlar) o'rtasida qilingan xarajatlarni oson va avtomatlashtirilgan holda hisob-kitob qilishingiz mumkin\n\nFoydalanish:\n\n1. Guruh yaratishni bosing va guruh nomini kiriting\n\n2. Bot sizga boshqa guruhdoshlaringiz qo'shilishi uchun havola bera. Shu havolani qo'shilishi kerak bo'lgan odamlarga jo'natasiz va ular shu orqali guruhga qo'shiladi\n\n3. Xarajat yozish - bu bo'limda siz qilgan xarajatingizni yozishingiz mumkin\n\n4. Hisob-kitob - bu bo'limda oldi-berdi xarajatlari hisb-kitob qilinadi\n\n5. Mening xarajatlarim - o'zingizning xarajatlaringizni ko'rishingiz va o'chirishingiz mumkin\n\n6. Umumiy - umumiy kim qancha xarajat yozganini ko'rish mumkin\n\n7. Guruh boshqaruvi - guruh xarajatlarini tozalash, nomini o'zgartirish, foydalanuvchilarni chiqarib tashlash, guruhni o'chirish amallarini bajarishingiz mumkin\n`,
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

  const user = await User.findOne({chat_id}).populate("groups");

  if (true) {
    // user?.groups?.length < 5
    await User.findOneAndUpdate(
      {chat_id},
      {$set: {action: CREATE_GROUP_ACTION, screen: GROUP_CREATING}}
    );
    const keyboard = new Keyboard().text(BACK).row().resized();
    await ctx.reply("Guruh nomini kiriting:", {
      reply_markup: keyboard,
    });
  } else {
    await ctx.reply("Maksimal guruhlar soni 5 ta");
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
  calculationExpenses(ctx);
});

// MY EXPENSES
bot.hears(MY_EXPENSES, async (ctx) => {
  await sendMyexpenses(ctx);
});

// ALL_SPEND_LIST
bot.hears(ALL_SPEND_LIST, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);
  const group_id = user.selectedGroupId;
  const group = await Group.findById(group_id);

  const users_list = await User.getAllUsersWithTotalSpending(group_id);
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

  if (group.admin.toString() !== user._id.toString()) {
    ctx.reply(
      " Bu bo'lim faqat guruh admin(guruh yaratgan foydalanuvchi)i uchun  \n\nXarajatlarni tozalash shu bo'limda amalga oshiriladi"
    );

    return;
  }

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
  const user = await User.findByChatId(chat_id);

  const group = await Group.findOne({
    admin: user._id,
    _id: user.selectedGroupId,
  });

  if (group) {
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
  }
});

bot.hears(EDIT_GROUP_NAME, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findOne({chat_id}).populate("selectedGroupId");

  const group = await Group.findOne({
    admin: user._id,
    _id: user.selectedGroupId,
  });

  if (group) {
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
  }
});

bot.hears(GET_GROUP_JOIN_LINK, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);
  const group_id = user.selectedGroupId;
  const group = await Group.findOne({_id: group_id, admin: user._id});

  if (group) {
    await User.findOneAndUpdate({chat_id}, {$set: {screen: GROUP_DETAIL}});

    const join = new Join({group: group_id});
    await join.save();

    await ctx.reply(
      `${group.name} guruhiga qo'shilish havolasi: \n \nhttps://t.me/${bot_name}?start=${join._id}`,
      {
        reply_markup: keyboard_group_detail,
      }
    );
  }
});

bot.hears(DELETE_USERS_BTN, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);

  const group = await Group.findOne({
    _id: user.selectedGroupId,
    admin: user._id,
  });

  if (group) {
    const followers = await User.find({groups: group._id});
    if (
      followers.length === 1 &&
      followers?.[0]?._id.toString() === group.admin.toString()
    ) {
      ctx.reply("Guruhda sizdan boshqa foydalanuvchi yo'q");
      return;
    }

    await ctx.reply("O'chirish kerak bo'lgan foydalanuvchi ustiga bosing: ", {
      reply_markup: user_delete_menu,
    });
  }
});

bot.hears(DELETE_GROUP, async (ctx) => {
  const chat_id = ctx.message.from.id;

  const updatedUser = await User.findOneAndUpdate(
    {chat_id},
    {$set: {screen: DELETE_GROUP_SCREEN}}
  );

  const group_id = updatedUser.selectedGroupId;
  const group = await Group.findOne({_id: group_id, admin: updatedUser._id});

  if (updatedUser && group) {
    const keyboard = new Keyboard().text(CONFIRM).row().text(BACK).resized();
    await ctx.reply(
      `${group.name} guruhi o'chirilishini tasdiqlang ❗️❗️ \n\nBarcha hisob-kitoblar 1 marta barcha foydalanuvchilarga yuboriladi \n\nGuruh o'chirilgandan keyin hisob-kitoblarni qayta ko'rib bo'lmaydi`,
      {
        reply_markup: keyboard,
      }
    );
  }
});

bot.hears(CONFIRM, async (ctx) => {
  const chat_id = ctx.message.from.id;
  const user = await User.findByChatId(chat_id);
  const screen = user?.screen;
  const selected_group_id = user.selectedGroupId;

  const group = await Group.findOne({
    _id: user.selectedGroupId,
    admin: user._id,
  });

  if (screen === CLEAR_EXPENSES_SCREEN && group) {
    await calculationExpenses(ctx, true);
    await clearGroupExpenses(chat_id, selected_group_id);
  }

  if (screen === DELETE_GROUP_SCREEN && group) {
    await calculationExpenses(ctx, true);

    await clearGroupExpenses(
      chat_id,
      selected_group_id,
      true,
      "va guruh o'chirildi"
    );

    await User.updateMany(
      {groups: selected_group_id},
      {
        $pull: {groups: selected_group_id},
        $set: {selectedGroupId: null, screen: HOME},
      }
    );

    await Group.findByIdAndDelete(selected_group_id);
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
    await User.findOneAndUpdate(
      {chat_id},
      {$set: {action: "", screen: GROUP_DETAIL}}
    );
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

  if (screen === DELETE_GROUP_SCREEN) {
    await User.findOneAndUpdate(
      {chat_id},
      {$set: {action: "", screen: GROUP_MANAGE_SCREEN}}
    );

    await ctx.reply(`O'chirish bekor qilindi`, {
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
    const group = await newGroup.save();

    const join = new Join({group: group._id});
    await join.save();

    await User.updateOne(
      {_id: user._id},
      {$set: {selectedGroupId: group._id, screen: GROUP_DETAIL}, new: true}
    );

    await ctx.reply(
      `${message} guruh yaratildi \n \nBoshqa guruhdoshlaringiz shu guruhga qo'shilish uchun quyidagi havolani ularga jo'nating 👇👇👇`,
      {
        reply_markup: keyboard_group_detail,
      }
    );

    await ctx.reply(`https://t.me/${bot_name}?start=${join._id}`);
  }

  // spend money
  if (action === SPEND_MONEY_ACTION) {
    const pattern = /^(\d+(\s+\S+)*)$/;

    if (!pattern.test(message)) {
      ctx.reply("To'g'ri formatda kiriting !!! \n\nMasalan 12000 nonga");
      return;
    }

    const amount = parseInt(message);

    function isInteger(str) {
      // Use a regular expression to check if the string is an integer
      return /^-?\d+$/.test(str);
    }

    let spaceIndex = message.indexOf(" ");
    let comment = "";

    if (spaceIndex !== -1) {
      comment = message.substring(spaceIndex + 1) || "";
    }

    if (isInteger(comment) || isInteger(comment.split(" ")?.[0])) {
      ctx.reply("To'g'ri formatda kiriting !!! \n\nMasalan 12000 nonga");
      return;
    }

    if (comment && (comment === "ming" || comment.split(" ")?.[0] === "ming")) {
      ctx.reply("To'g'ri formatda kiriting !!! \n\nMasalan 12000 nonga");
      return;
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
        } xarajat yozildi \n\nAgar xato bo'lgan bo'lsa mening xarajatlarim bo'limidan o'chirishingiz mumkin`,
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
