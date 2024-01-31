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
        writing: {
            type: Boolean,
            default: false,
        },  
    },
    { timestamps: true }
);
module.exports = mongoose.model("User", UserSchema);
