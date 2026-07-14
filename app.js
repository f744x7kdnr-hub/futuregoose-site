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
  const lines = safe.split("\n");
  const output = [];
  const renderInline = (value) => value.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  const parseTableRow = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
    return trimmed
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
  };
  const isSeparatorRow = (cells) =>
    cells && cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, "")));

  for (let index = 0; index < lines.length; index += 1) {
    const headerCells = parseTableRow(lines[index]);
    const separatorCells = index + 1 < lines.length ? parseTableRow(lines[index + 1]) : null;

    if (headerCells && separatorCells && isSeparatorRow(separatorCells)) {
      const rows = [];
      index += 2;
      while (index < lines.length) {
        const cells = parseTableRow(lines[index]);
        if (!cells) break;
        rows.push(cells);
        index += 1;
      }
      index -= 1;

      output.push(`
        <div class="message-table-wrap">
          <table class="message-table">
            <thead><tr>${headerCells.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>
            <tbody>${rows
              .map((cells) => `<tr>${cells.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
              .join("")}</tbody>
          </table>
        </div>
      `);
      continue;
    }

    const heading = lines[index].match(/^#{1,6}\s+(.*)$/);
    output.push(
      heading ? `<strong class="message-heading">${renderInline(heading[1])}</strong>` : renderInline(lines[index]),
    );
    if (index < lines.length - 1) output.push("<br />");
  }

  return output.join("");
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

const requestAnswer = async () => {
  const createResponse = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      userId: ensureUserId(),
      messages: state.messages.slice(-8),
    }),
  });

  const chat = await createResponse.json().catch(() => ({}));

  if (!createResponse.ok) {
    const error = new Error(chat.error || "服务暂时没有返回有效回复。");
    error.status = createResponse.status;
    throw error;
  }

  if (!chat.conversationId || !chat.chatId) {
    throw new Error("服务没有返回有效的对话编号。");
  }

  const query = new URLSearchParams({
    conversationId: chat.conversationId,
    chatId: chat.chatId,
  });
  const pollingDeadline = Date.now() + 90000;
  let consecutiveNetworkErrors = 0;

  while (Date.now() < pollingDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 1200));

    try {
      const statusResponse = await fetch(`/api/chat?${query}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = await statusResponse.json().catch(() => ({}));

      if (statusResponse.status === 202) {
        consecutiveNetworkErrors = 0;
        continue;
      }

      if (!statusResponse.ok) {
        const error = new Error(data.error || "服务暂时没有返回有效回复。");
        error.status = statusResponse.status;
        throw error;
      }

      return data;
    } catch (error) {
      if (error.status) throw error;
      consecutiveNetworkErrors += 1;
      if (consecutiveNetworkErrors >= 3) throw error;
    }
  }

  const error = new Error("回答生成时间过长，请稍后重试。");
  error.status = 504;
  throw error;
};

const sendMessage = async (content) => {
  if (state.isSending) return;

  state.messages.push({ role: "user", content });
  state.isSending = true;
  renderChat();

  try {
    const data = await requestAnswer();

    state.messages.push({
      role: "assistant",
      content: data.answer || "我刚刚没有整理出明确回复，可以换个说法再试一次。",
    });
  } catch (error) {
    state.messages.push({
      role: "assistant",
      content:
        "服务刚刚开了个小差，这次没有成功生成回答。请稍后重新发送，或点击下方示例问题再试一次。",
    });
    console.error(error);
  } finally {
    state.isSending = false;
    renderChat();
  }
};

renderChat();
