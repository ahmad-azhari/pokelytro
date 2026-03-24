const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const itemSchema = Schema({
  name: {
    type: String,
    required: true,
  },
  gen: {
    type: String,
    required: true,
  },
  release: {
    type: String,
    required: true,
  },
  cost: {
    type: Number,
    required: true,
  },
});

module.exports = mongoose.model("items", itemSchema);
