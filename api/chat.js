const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Only POST is supported." });
    return;
  }

  if (!process.env.COZE_API_TOKEN) {
    res.status(500).json({ error: "Missing COZE_API_TOKEN environment variable." });
    return;
  }

  try {
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

    let status = chat.data?.status;
    for (let index = 0; index < 20 && status && !["completed", "failed", "requires_action"].includes(status); index += 1) {
      await sleep(900);
      const retrieved = await callCoze(
        `/v3/chat/retrieve?conversation_id=${encodeURIComponent(conversationId)}&chat_id=${encodeURIComponent(chatId)}`,
      );
      status = retrieved.data?.status;
    }

    if (status && status !== "completed") {
      res.status(502).json({ error: `Coze chat ended with status: ${status}` });
      return;
    }

    const messageList = await callCoze(
      `/v3/chat/message/list?conversation_id=${encodeURIComponent(conversationId)}&chat_id=${encodeURIComponent(chatId)}`,
    );

    const answer = getAnswerFromMessages(messageList);

    res.status(200).json({
      answer,
      conversationId,
      chatId,
    });
  } catch (error) {
    console.error("FutureGoose chat error:", error.payload || error);
    res.status(500).json({ error: error.message || "FutureGoose backend error." });
  }
};
