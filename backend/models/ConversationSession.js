const mongoose = require("mongoose");

const ConversationMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const ConversationSessionSchema = new mongoose.Schema(
  {
    sessionKey: { type: String, required: true, unique: true, index: true },
    sessionId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    messages: { type: [ConversationMessageSchema], default: [] },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("ConversationSession", ConversationSessionSchema);
