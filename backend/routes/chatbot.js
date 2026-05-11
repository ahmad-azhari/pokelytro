const express = require("express");
const router = express.Router();
const RAGOrchestrator = require("../services/lytrobot/RAGOrchestrator");
const {
  resolveUserId,
  getRecentMessages,
  appendConversation,
  clearConversation,
} = require("../services/lytrobot/memory.service");

function toFrontendRole(role) {
  return role === "assistant" ? "model" : "user";
}

router.get("/history", async (req, res) => {
  try {
    const sessionId = String(req.query.sessionId || "").trim();
    if (!sessionId) {
      return res.status(400).json({ message: "A sessionId is required." });
    }

    const userId = resolveUserId(req);
    const history = await getRecentMessages({ sessionId, userId, limit: 5 });

    const messages = history.map((message) => ({
      role: toFrontendRole(message.role),
      content: message.content,
    }));

    res.status(200).json({ messages });
  } catch (error) {
    res.status(500).json({ message: "Unable to load LytroBot history." });
  }
});

router.post("/message", async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "A message is required." });
    }

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ message: "A sessionId is required." });
    }

    const userId = resolveUserId(req);
    const recentMessages = await getRecentMessages({ sessionId, userId, limit: 5 });

    const ragResult = await RAGOrchestrator.executeFullRAGPipeline(
      message,
      recentMessages
    );

    await appendConversation({
      sessionId,
      userId,
      userMessage: message,
      assistantMessage: ragResult.reply,
    });

    res.status(200).json({
      reply: ragResult.reply,
      references: ragResult.references,
      debug: ragResult.debug,
    });
  } catch (error) {
    if (error.status === 429) {
      return res.status(429).json({
        message:
          "LytroBot is receiving many requests right now. Please try again in a moment.",
      });
    }

    console.error("Error in /message route:", error);
    res.status(500).json({ message: "Error processing your LytroBot request." });
  }
});

router.post("/clear", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ message: "A sessionId is required." });
    }

    const userId = resolveUserId(req);
    await clearConversation({ sessionId, userId });

    res.status(200).json({ message: "Conversation cleared successfully." });
  } catch (error) {
    res.status(500).json({ message: "Error clearing conversation." });
  }
});

router.initVectorStore = async () => {};
module.exports = router;
