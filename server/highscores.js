import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const MODES = ["classic", "blockBreaker"];

const ROUTE = "/api/highscores";
const MAX_NAME_LENGTH = 20;
const MAX_SCORE = 1_000_000;
const MAX_BODY_BYTES = 1024;

function emptyHighscores() {
  return Object.fromEntries(MODES.map((mode) => [mode, null]));
}

function isValidRecord(record) {
  return (
    record &&
    typeof record.name === "string" &&
    Number.isInteger(record.score)
  );
}

function sanitizeName(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createHighscoreMiddleware(dataFile) {
  // Serializes writes so two simultaneous submissions can't overwrite each other.
  let writeQueue = Promise.resolve();

  async function load() {
    const highscores = emptyHighscores();
    try {
      const stored = JSON.parse(await readFile(dataFile, "utf8"));
      for (const mode of MODES) {
        if (isValidRecord(stored?.[mode])) {
          highscores[mode] = stored[mode];
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    return highscores;
  }

  async function save(highscores) {
    await mkdir(path.dirname(dataFile), { recursive: true });
    const tempFile = `${dataFile}.tmp`;
    await writeFile(tempFile, JSON.stringify(highscores, null, 2));
    await rename(tempFile, dataFile);
  }

  async function submit({ mode, name, score }) {
    const highscores = await load();
    const current = highscores[mode];
    if (current && score <= current.score) {
      return { updated: false, highscores };
    }
    highscores[mode] = { name, score, achievedAt: new Date().toISOString() };
    await save(highscores);
    return { updated: true, highscores };
  }

  return async function highscoreMiddleware(req, res, next) {
    const pathname = (req.url ?? "").split("?")[0];
    if (pathname !== ROUTE) {
      if (next) {
        next();
      } else {
        sendJson(res, 404, { error: "Not found" });
      }
      return;
    }

    try {
      if (req.method === "GET") {
        sendJson(res, 200, { highscores: await load() });
        return;
      }

      if (req.method === "POST") {
        let payload;
        try {
          payload = JSON.parse(await readBody(req));
        } catch (error) {
          sendJson(res, error.status ?? 400, { error: "Invalid JSON body" });
          return;
        }

        const mode = payload?.mode;
        const name = sanitizeName(payload?.name);
        const score = payload?.score;

        if (!MODES.includes(mode)) {
          sendJson(res, 400, { error: "Unknown game mode" });
          return;
        }
        if (!name) {
          sendJson(res, 400, { error: "Name is required" });
          return;
        }
        if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) {
          sendJson(res, 400, { error: "Invalid score" });
          return;
        }

        const task = writeQueue.then(() => submit({ mode, name, score }));
        writeQueue = task.catch(() => {});
        sendJson(res, 200, await task);
        return;
      }

      res.setHeader("Allow", "GET, POST");
      sendJson(res, 405, { error: "Method not allowed" });
    } catch (error) {
      console.error("[highscores]", error);
      sendJson(res, 500, { error: "Could not access high scores" });
    }
  };
}
