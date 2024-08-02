const mongoose = require("mongoose");
// this is a schema
const tokenSchema = new mongoose.Schema(
  {
    chat_id: { type: String, required: true },
    chain: { type: String, required: true },
    token: { type: String, required: true },
    volume: { type: Number, required: true },
    buys: { type: Array, default: [] },
    photo: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Token", tokenSchema);
