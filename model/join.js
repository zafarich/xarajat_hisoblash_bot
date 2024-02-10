// models/Group.js
const mongoose = require("mongoose");

const JoinSchema = new mongoose.Schema(
  {
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
    },
  },
  {timestamps: true}
);

module.exports = mongoose.model("Join", JoinSchema);
