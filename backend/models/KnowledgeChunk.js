const mongoose = require("mongoose");

const KnowledgeChunkSchema = new mongoose.Schema(
  {
    chunkId: { type: String, required: true, unique: true, index: true },
    sourceType: { type: String, required: true, index: true },
    sourceId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("KnowledgeChunk", KnowledgeChunkSchema);
