const mongoose = require("mongoose");
const url = "mongodb://127.0.0.1:27017/xarajat";

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(url, {});
    console.log(`MongoDB connected : ${conn.connection.host}`);
  } catch (err) {
    console.log(err);
  }
};
module.exports = connectDB;
