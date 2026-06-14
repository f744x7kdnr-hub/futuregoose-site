# 未来鹅 FutureGoose 网页 Demo

这是「未来鹅 FutureGoose｜大学生职业成长 AI 陪伴体」的产品展示页。公网版本建议使用后端代理调用 Coze API，避免在前端暴露 token。

## 本地预览

本地后端预览：

1. 复制 `.env.example` 为 `.env.local`
2. 在 `.env.local` 中填入 Coze 个人访问令牌
3. 双击 `start-local-server.bat`
4. 打开 `http://127.0.0.1:8787/`

双击后会出现一个黑色命令行窗口。预览网页期间不要关闭它，关闭后本地服务会停止。

## Coze 配置

- Bot ID: `7650919950467186740`
- API Base: `https://api.coze.cn`
- 后端环境变量：
  - `COZE_API_TOKEN`
  - `COZE_BOT_ID`
  - `COZE_API_BASE`

## 安全提醒

不要把 token 写进前端源码。公网部署时，在 Vercel/Netlify 等平台的 Environment Variables 中配置 `COZE_API_TOKEN`。如果 token 已经在聊天、截图或公共页面中暴露，请在 Coze 的授权页面撤销旧 token 并重新生成。
