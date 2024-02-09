const {bot} = require("../services/bot.js");
const {MenuMiddleware, MenuTemplate} = require("grammy-inline-menu");

// Create a simple menu.
const people = {Mark: {}, Paul: {}};

const foodSelectSubmenu = new MenuTemplate((ctx) => {
  return `Hey ${ctx.from.first_name}!`;
});

const users = [
  {
    id: 1,
    name: "Zafar",
  },
  {
    id: 2,
    name: "Jamshid",
  },
  {
    id: 3,
    name: "Sherzod",
  },
];

let selected_users = [...users];

foodSelectSubmenu.select("select", [...users.map((user) => user.id)], {
  columns: 1,
  buttonText: (_, key) => {
    return users.find((item) => item?.id == key)?.name;
  },
  set(ctx, key, newState) {
    const clicked_user = selected_users.find((item) => item.id == key);
    if (newState && !clicked_user) {
      selected_users.push(users.find((item) => item.id == key));
    }

    if (!newState && clicked_user) {
      selected_users = selected_users.filter((user) => user.id != key);
    }

    return true;
  },
  isSet(ctx, key) {
    return !!selected_users.find((item) => item.id == key);
  },
});

const menuMiddleware = new MenuMiddleware("/", foodSelectSubmenu);

// Make it interactive.
bot.use(menuMiddleware);

bot.command("start", async (ctx) => {
  menuMiddleware.replyToContext(ctx);
});
