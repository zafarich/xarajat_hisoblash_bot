// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    chat_id: {
      type: Number,
      required: true,
    },
    action: {
      type: String,
      default: "",
    },
    screen: {
      type: String,
      default: "",
    },
    selectedGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
    },
    groups: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group",
      },
    ],
    totalSpent: [
      {
        group: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Group",
        },
        amount: {
          type: Number,
          default: 0,
        },
      },
    ],
  },
  {timestamps: true}
);

// Static method to find a user by chat_id
UserSchema.statics.findByChatId = async function (chat_id) {
  return this.findOne({chat_id}).exec();
};

// Add a method to find groups by chat_id
UserSchema.statics.findGroupsByChatId = async function (chat_id) {
  return this.findOne({chat_id}).populate("groups");
};

// Add a method to update the 'action' field by chat_id
UserSchema.statics.updateActionByChatId = async function (chat_id, newAction) {
  return this.findOneAndUpdate(
    {chat_id: chat_id},
    {$set: {action: newAction}},
    {new: true}
  );
};

// Static method to follow a new group
UserSchema.statics.followNewGroup = async function (userId, groupId) {
  return this.findByIdAndUpdate(
    userId,
    {$addToSet: {groups: groupId}},
    {new: true}
  ).exec();
};

// Add a method to update totalSpent
UserSchema.methods.updateTotalSpent = async function (group, amount) {
  const index = this.totalSpent.findIndex((entry) => entry.group.equals(group));

  if (index !== -1) {
    this.totalSpent[index].amount += amount;
  } else {
    this.totalSpent.push({group, amount});
  }

  await this.save();
};

// Add a method to get total spending by user in a group
UserSchema.methods.getTotalSpentInGroup = function (group) {
  const entry = this.totalSpent.find((entry) => entry.group.equals(group));
  return entry ? entry.amount : 0;
};

UserSchema.methods.getTotalSpendingByGroup = async function (groupId) {
  const Payment = mongoose.model("Payment");
  try {
    const totalSpending = await Payment.aggregate([
      {
        $match: {payer: this._id, group: groupId},
      },
      {
        $group: {
          _id: null,
          totalAmount: {$sum: "$amount"},
        },
      },
    ]).exec();

    return totalSpending.length > 0 ? totalSpending[0].totalAmount : 0;
  } catch (error) {
    throw error;
  }
};

// Method to get a list of all users with their total spending for a specific group
UserSchema.statics.getAllUsersWithTotalSpendingByGroup = async function (
  groupId
) {
  const Payment = mongoose.model("Payment");

  try {
    const usersWithTotalSpending = await this.aggregate([
      {
        $match: {groups: groupId},
      },
      {
        $lookup: {
          from: "payments", // Replace with the actual name of your 'payments' collection
          localField: "_id",
          foreignField: "payer",
          as: "payments",
        },
      },
      {
        $unwind: {
          path: "$payments",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          "payments.group": groupId,
        },
      },
      {
        $group: {
          _id: "$_id",
          name: {$first: "$name"},
          totalAmount: {$sum: "$payments.amount"},
        },
      },
    ]).exec();

    return usersWithTotalSpending;
  } catch (error) {
    throw error;
  }
};

// Static method to get total spending for all users in a specific group
UserSchema.statics.getAllUsersWithTotalSpending = async function (groupId) {
  const Payment = mongoose.model("Payment");

  try {
    const usersWithTotalSpending = await this.aggregate([
      {
        $match: {groups: groupId},
      },
      {
        $lookup: {
          from: "payments", // Replace with the actual name of your 'payments' collection
          let: {userId: "$_id"},
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {$eq: ["$payer", "$$userId"]},
                    {$eq: ["$group", groupId]},
                  ],
                },
              },
            },
          ],
          as: "payments",
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          totalAmount: {$sum: "$payments.amount"},
        },
      },
    ]).exec();

    return usersWithTotalSpending;
  } catch (error) {
    throw error;
  }
};

// Add a method to get total spending by all users in a group
UserSchema.statics.getTotalSpendingInGroup = async function (group) {
  const users = await this.find({groups: group});
  return users.reduce((total, user) => {
    const entry = user.totalSpent.find((entry) => entry.group.equals(group));
    return total + (entry ? entry.amount : 0);
  }, 0);
};

module.exports = mongoose.model("User", UserSchema);
