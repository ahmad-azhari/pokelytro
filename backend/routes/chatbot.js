const express = require("express");
const router = express.Router();
const Groq = require("groq-sdk");
const { LYTROBOT_SYSTEM_PROMPT } = require("../config/lytrobot-system-prompt");
const {
  buildKnowledgeBase,
  retrieveKnowledge,
} = require("../services/lytrobot/vector-store.service");
const {
  resolveUserId,
  getRecentMessages,
  appendConversation,
} = require("../services/lytrobot/memory.service");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function formatRetrievedContext(chunks) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return "No retrieved context.";
  }

  return chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] ${chunk.title}\nSource: ${chunk.sourceType}:${chunk.sourceId}\nContent: ${chunk.text}`,
    )
    .join("\n\n");
}

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
    const [retrievedChunks, recentMessages] = await Promise.all([
      retrieveKnowledge(message, 6),
      getRecentMessages({ sessionId, userId, limit: 5 }),
    ]);

    const llmMessages = [
      { role: "system", content: LYTROBOT_SYSTEM_PROMPT },
      {
        role: "system",
        content:
          "Retrieved Pokelytro Knowledge:\n" + formatRetrievedContext(retrievedChunks),
      },
      ...recentMessages.map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
      { role: "user", content: message },
    ];

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: llmMessages,
      temperature: 0.4,
      max_tokens: 1024,
    });

    const reply =
      completion.choices?.[0]?.message?.content ||
      "I could not process that request.";

    await appendConversation({
      sessionId,
      userId,
      userMessage: message,
      assistantMessage: reply,
    });

    res.status(200).json({
      reply,
      references: retrievedChunks.map((chunk) => ({
        title: chunk.title,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        score: chunk.score,
      })),
    });
  } catch (error) {
    if (error.status === 429) {
      return res.status(429).json({
        message:
          "LytroBot is receiving many requests right now. Please try again in a moment.",
      });
    }

    res.status(500).json({ message: "Error processing your LytroBot request." });
  }
});

router.initVectorStore = buildKnowledgeBase;
module.exports = router;
