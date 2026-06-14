const chatRoot = document.getElementById("futuregoose-chat");

const quickPrompts = [
  "我是大一学生，还不知道未来适合什么方向，可以帮我分析吗？",
  "我收藏了很多求职/学习经验帖，但一直没有开始做，你能帮我整理成计划吗？",
  "我想了解互联网公司有哪些岗位，以及低年级可以怎么准备。",
  "我已经有一个模糊方向了，你能帮我判断下一步该做项目、找实习还是补能力吗？",
];

const state = {
  messages: [
    {
      role: "assistant",
      content:
        "你好呀，我是未来鹅 FutureGoose。我会先了解你的年级、专业、兴趣、已有经历和最近的迷茫，再帮你判断职业探索阶段，推荐 1-3 个方向，并生成轻量的 4 周行动计划。",
    },
  ],
  isSending: false,
};

const ensureUserId = () => {
  try {
    const key = "futuregoose_user_id";
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = `fg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      window.localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `fg_${Date.now()}`;
  }
};

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const renderMarkdownLite = (content) => {
  const safe = escapeHtml(content);
  return safe
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.*)$/gm, "<strong>$1</strong>")
    .replace(/\n/g, "<br />");
};

const renderChat = () => {
  chatRoot.innerHTML = `
    <div class="demo-chat">
      <div class="demo-chat-scroll" id="chat-scroll">
        ${state.messages
          .map(
            (message) => `
              <div class="message ${message.role === "user" ? "message-user" : "message-assistant"}">
                <div class="message-avatar">${message.role === "user" ? "你" : "FG"}</div>
                <div class="message-bubble">${renderMarkdownLite(message.content)}</div>
              </div>
            `,
          )
          .join("")}
        ${
          state.isSending
            ? `
              <div class="message message-assistant">
                <div class="message-avatar">FG</div>
                <div class="message-bubble typing">未来鹅正在整理你的成长路径...</div>
              </div>
            `
            : ""
        }
      </div>
      <div class="quick-prompts">
        ${quickPrompts.map((prompt) => `<button type="button" class="quick-prompt">${escapeHtml(prompt)}</button>`).join("")}
      </div>
      <form class="chat-form">
        <textarea name="message" rows="2" placeholder="告诉未来鹅你的年级、专业、兴趣或收藏夹内容..."></textarea>
        <button type="submit" ${state.isSending ? "disabled" : ""}>发送</button>
      </form>
    </div>
  `;

  chatRoot.querySelectorAll(".quick-prompt").forEach((button) => {
    button.addEventListener("click", () => sendMessage(button.textContent.trim()));
  });

  chatRoot.querySelector(".chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const textarea = event.currentTarget.elements.message;
    const message = textarea.value.trim();
    if (!message) return;
    textarea.value = "";
    sendMessage(message);
  });

  const scroll = document.getElementById("chat-scroll");
  if (scroll) scroll.scrollTop = scroll.scrollHeight;
};

const sendMessage = async (content) => {
  if (state.isSending) return;

  state.messages.push({ role: "user", content });
  state.isSending = true;
  renderChat();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: ensureUserId(),
        messages: state.messages.slice(-8),
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "后端暂时没有返回有效回复。");
    }

    state.messages.push({
      role: "assistant",
      content: data.answer || "我刚刚没有整理出明确回复，可以换个说法再试一次。",
    });
  } catch (error) {
    state.messages.push({
      role: "assistant",
      content:
        "我现在还没有连上后端服务。部署到 Vercel 并配置 COZE_API_TOKEN 后，就可以在这里直接对话。当前页面仍可用于展示产品流程和交互入口。",
    });
    console.error(error);
  } finally {
    state.isSending = false;
    renderChat();
  }
};

renderChat();
