const parseBody = (req) => {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
};

const parseQuery = (req) => {
  if (req.query && typeof req.query === "object") return req.query;

  try {
    return Object.fromEntries(new URL(req.url || "/", "http://localhost").searchParams.entries());
  } catch {
    return {};
  }
};

const callCoze = async (path, options = {}) => {
  const apiBase = process.env.COZE_API_BASE || "https://api.coze.cn";
  const apiToken = process.env.COZE_API_TOKEN;

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok || (data.code && data.code !== 0)) {
    const message = data.msg || data.message || `Coze API request failed: ${response.status}`;
    const error = new Error(message);
    error.payload = data;
    throw error;
  }

  return data;
};

const normalizeMessages = (messages) =>
  messages
    .filter((message) => message && message.content && ["user", "assistant"].includes(message.role))
    .map((message) => ({
      role: message.role,
      content: message.content,
      content_type: "text",
    }));

const getAnswerFromMessages = (payload) => {
  const messages = payload.data || [];

  const isEventPayload = (content = "") => {
    const trimmed = String(content).trim();
    return trimmed.startsWith('{"msg_type"') || trimmed.includes('"generate_answer_finish"');
  };

  const isUsableText = (message) =>
    message &&
    message.role === "assistant" &&
    typeof message.content === "string" &&
    message.content.trim() &&
    !isEventPayload(message.content);

  const answers = messages.filter((message) => message.type === "answer" && isUsableText(message));
  if (answers.length) return answers[answers.length - 1].content;

  const assistantMessages = messages.filter(isUsableText);
  if (assistantMessages.length) return assistantMessages[assistantMessages.length - 1].content;

  return "";
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!["GET", "POST"].includes(req.method)) {
    res.status(405).json({ error: "Only GET and POST are supported." });
    return;
  }

  if (!process.env.COZE_API_TOKEN) {
    res.status(500).json({ error: "Missing COZE_API_TOKEN environment variable." });
    return;
  }

  try {
    if (req.method === "GET") {
      const query = parseQuery(req);
      const conversationId = String(query.conversationId || "").slice(0, 64);
      const chatId = String(query.chatId || "").slice(0, 64);

      if (!/^\d+$/.test(conversationId) || !/^\d+$/.test(chatId)) {
        res.status(400).json({ error: "Valid conversation and chat identifiers are required." });
        return;
      }

      const retrieved = await callCoze(
        `/v3/chat/retrieve?conversation_id=${encodeURIComponent(conversationId)}&chat_id=${encodeURIComponent(chatId)}`,
      );
      const status = retrieved.data?.status;

      if (["failed", "requires_action"].includes(status)) {
        const lastError = retrieved.data?.last_error || {};
        const detail = lastError.msg || lastError.message || lastError.code;
        console.error("Coze chat failed:", { status, lastError });
        res.status(502).json({
          error: detail ? `Coze chat failed: ${detail}` : `Coze chat ended with status: ${status}`,
          code: lastError.code || "",
        });
        return;
      }

      if (status !== "completed") {
        res.status(202).json({ status: status || "in_progress", conversationId, chatId });
        return;
      }

      const messageList = await callCoze(
        `/v3/chat/message/list?conversation_id=${encodeURIComponent(conversationId)}&chat_id=${encodeURIComponent(chatId)}`,
      );
      const answer = getAnswerFromMessages(messageList);

      if (!answer) {
        res.status(202).json({ status: "finalizing", conversationId, chatId });
        return;
      }

      res.status(200).json({ answer, status, conversationId, chatId });
      return;
    }

    const body = parseBody(req);
    const userId = String(body.userId || "futuregoose-demo-user").slice(0, 64);
    const messages = normalizeMessages(body.messages || []);

    if (!messages.length || messages[messages.length - 1].role !== "user") {
      res.status(400).json({ error: "A latest user message is required." });
      return;
    }

    const chat = await callCoze("/v3/chat", {
      method: "POST",
      body: JSON.stringify({
        bot_id: process.env.COZE_BOT_ID || "7650919950467186740",
        user_id: userId,
        stream: false,
        auto_save_history: true,
        additional_messages: messages,
      }),
    });

    const chatId = chat.data?.id;
    const conversationId = chat.data?.conversation_id;

    if (!chatId || !conversationId) {
      res.status(502).json({ error: "Coze did not return chat identifiers." });
      return;
    }

    res.status(202).json({
      status: chat.data?.status || "in_progress",
      conversationId,
      chatId,
    });
  } catch (error) {
    console.error("FutureGoose chat error:", error.payload || error);
    res.status(500).json({ error: error.message || "FutureGoose backend error." });
  }
};
