const jwt = require("jsonwebtoken");
const ConversationSession = require("../../models/ConversationSession");

const MAX_STORED_MESSAGES = 40;

function resolveUserId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded?._id || null;
  } catch {
    return null;
  }
}

function resolveSessionKey(userId, sessionId) {
  if (userId) {
    return `user:${String(userId)}`;
  }
  return `anon:${sessionId}`;
}

async function getOrCreateSession({ sessionId, userId }) {
  const sessionKey = resolveSessionKey(userId, sessionId);
  let session = await ConversationSession.findOne({ sessionKey });

  if (!session) {
    session = await ConversationSession.create({
      sessionKey,
      sessionId,
      userId: userId || null,
      messages: [],
    });
    return session;
  }

  if (!session.userId && userId) {
    session.userId = userId;
  }
  if (session.sessionId !== sessionId) {
    session.sessionId = sessionId;
  }
  await session.save();
  return session;
}

async function getRecentMessages({ sessionId, userId, limit = 5 }) {
  const session = await getOrCreateSession({ sessionId, userId });
  const pairs = Math.max(1, limit) * 2;
  return session.messages.slice(-pairs);
}

async function appendConversation({ sessionId, userId, userMessage, assistantMessage }) {
  const session = await getOrCreateSession({ sessionId, userId });

  session.messages.push(
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantMessage },
  );

  if (session.messages.length > MAX_STORED_MESSAGES) {
    session.messages = session.messages.slice(-MAX_STORED_MESSAGES);
  }

  await session.save();
}

module.exports = {
  resolveUserId,
  getRecentMessages,
  appendConversation,
};
