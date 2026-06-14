import http from "node:http";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const chatHandler = require("./api/chat.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const loadEnv = async () => {
  try {
    const content = await fs.readFile(path.join(__dirname, ".env.local"), "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separator = trimmed.indexOf("=");
      if (separator === -1) return;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
  } catch {
    // Local env file is optional.
  }
};

const collectBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

await loadEnv();

const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith("/api/chat")) {
    req.body = await collectBody(req);
    const apiRes = {
      setHeader: (...args) => res.setHeader(...args),
      status(code) {
        res.statusCode = code;
        return this;
      },
      json(payload) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(payload));
      },
      end(payload = "") {
        res.end(payload);
      },
    };
    await chatHandler(req, apiRes);
    return;
  }

  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";

    const fullPath = path.resolve(__dirname, `.${pathname}`);
    if (!fullPath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const data = await fs.readFile(fullPath);
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(fullPath)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FutureGoose local server: http://127.0.0.1:${port}/`);
});
