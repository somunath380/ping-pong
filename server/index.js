import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHighscoreMiddleware } from "./highscores.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const distDir = path.join(rootDir, "dist");
const highscores = createHighscoreMiddleware(
  path.join(rootDir, "data", "highscores.json"),
);
const port = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function serveStatic(req, res) {
  const pathname = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let filePath = path.join(distDir, pathname);

  if (!filePath.startsWith(distDir)) {
    res.writeHead(403).end();
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    await stat(filePath);
  } catch {
    filePath = path.join(distDir, "index.html");
  }

  res.writeHead(200, {
    "Content-Type":
      MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
}

http
  .createServer((req, res) => {
    highscores(req, res, () => {
      serveStatic(req, res).catch(() => {
        res.writeHead(500).end();
      });
    });
  })
  .listen(port, () => {
    console.log(`Ping Pong running at http://localhost:${port}/`);
  });
