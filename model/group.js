// models/Group.js
const mongoose = require("mongoose");

const GroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    totalSpent: {
      type: Number,
      default: 0,
    },
  },
  {timestamps: true}
);

GroupSchema.post("save", async function (group) {
  const User = mongoose.model("User");
  try {
    // Update the groups field for the user with the same ID as the admin ID
    await User.findByIdAndUpdate(
      this.admin,
      {$addToSet: {groups: group._id}, $set: {action: ""}},

      {new: true}
    );
  } catch (error) {
    console.error("Error updating user's groups:", error);
    // Handle the error appropriately
  }
});

module.exports = mongoose.model("Group", GroupSchema);
