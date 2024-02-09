// Example Logic (e.g., in your controller or route)
const User = require("path/to/UserModel");
const Group = require("path/to/GroupModel");
const Payment = require("path/to/PaymentModel");

// Assuming 'User', 'Group', and 'Payment' models are properly imported

const userId = "your_user_id"; // Replace with the actual user ID
const groupId = "your_group_id"; // Replace with the actual group ID
const amount = 10000; // Replace with the actual payment amount

// Create a payment
const payment = new Payment({
  amount: amount,
  payer: userId,
  group: groupId,
});

// Save the payment
await payment.save();

// Update the totalSpent field in the Group model
const group = await Group.findById(groupId);
group.totalSpent += amount;
await group.save();

// Calculate the equal share for each follower
const followers = await User.find({groups: groupId});
const numberOfFollowers = followers.length;
const equalShare = group.totalSpent / numberOfFollowers;

// Update the totalSpent field for each follower
for (const follower of followers) {
  follower.updateTotalSpent(groupId, equalShare);
}
