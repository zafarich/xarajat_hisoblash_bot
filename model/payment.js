// models/Payment.js
const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
    },
    payer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
    },
    comment: {
      type: String,
      default: "",
    },
  },
  {timestamps: true}
);

// Static method to create a new payment
PaymentSchema.statics.createPayment = async function (
  amount,
  payerId,
  groupId,
  comment
) {
  try {
    const payment = new this({
      amount,
      payer: payerId,
      group: groupId,
      comment,
    });
    await payment.save();
    return payment;
  } catch (error) {
    throw error;
  }
};

// Add a method to update totalSpent in the associated user
PaymentSchema.methods.updateUserTotalSpent = async function () {
  const user = await mongoose.model("User").findById(this.payer);

  if (user) {
    await user.updateTotalSpent(this.group, this.amount);
  }
};

// Static method to get a list of payments made by a specific user in a specific group
PaymentSchema.statics.getUserPaymentsByGroup = async function (
  userId,
  groupId
) {
  try {
    const payments = await this.find({payer: userId, group: groupId}).exec();
    return payments;
  } catch (error) {
    throw error;
  }
};

// Add a post-save hook to update user's totalSpent after saving a payment
PaymentSchema.post("save", function () {
  this.updateUserTotalSpent();
});

module.exports = mongoose.model("Payment", PaymentSchema);
