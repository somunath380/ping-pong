import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * -------------------------
 * Anti-cheat config (tune these)
 * -------------------------
 *
 * The client reports its score every UPDATE_INTERVAL_SEC. The server only
 * accepts a report if enough time has passed since the last one and the
 * score didn't grow faster than the mode allows.
 */

// Must match UPDATE_INTERVAL_MS in src/score-session.js.
export const UPDATE_INTERVAL_SEC = 10;

// Slack for network delay and timer drift, in seconds.
export const TIMING_TOLERANCE_SEC = 2;

/*
 * Highest believable scoring rate for each mode (placeholders to tune):
 * - Classic gives at most 1 point per scoring window (VITE_SCORE_WINDOW_MS,
 *   8s by default = 0.125/s), so 0.5 is generous.
 * - Block Breaker gives 1 point per block; three balls near low rows can
 *   break several blocks a second.
 */
export const MAX_POINTS_PER_SECOND = {
  classic: 0.5,
  blockBreaker: 1,
};

// Sessions with no update for this long are thrown away.
export const SESSION_TTL_MS = 30 * 60 * 1000;

const CLEANUP_INTERVAL_MS = 60 * 1000;

export const MODES = Object.keys(MAX_POINTS_PER_SECOND);

const MAX_NAME_LENGTH = 20;
const MAX_BODY_BYTES = 1024;

/*
 * -------------------------
 * Helpers
 * -------------------------
 */

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

async function readJsonBody(req) {
  try {
    return JSON.parse(await readBody(req));
  } catch (error) {
    throw Object.assign(new Error("Invalid JSON body"), { status: error.status ?? 400 });
  }
}

// Returns the cleaned name, or null if it's empty or longer than 20 characters.
function validateName(value) {
  if (typeof value !== "string") {
    return null;
  }
  const name = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return name && name.length <= MAX_NAME_LENGTH ? name : null;
}

// Player records are keyed case-insensitively so "Soham" and "soham" share one best score.
function playerKey(name) {
  return name.toLowerCase();
}

function badRequest(res, error) {
  sendJson(res, 400, { error });
}

/*
 * -------------------------
 * Score storage (JSON file)
 * -------------------------
 *
 * File shape:
 * {
 *   "champions": { "classic": { name, score, achievedAt } | null, ... },
 *   "players": { "soham": { "name": "soham", "classic": 50, "blockBreaker": 170 } }
 * }
 */

function createScoreStore(dataFile) {
  // Every write waits for the previous one, so two games ending at once can't
  // read the same old file and overwrite each other's scores.
  let writeQueue = Promise.resolve();

  async function load() {
    const data = {
      champions: Object.fromEntries(MODES.map((mode) => [mode, null])),
      players: {},
    };

    let stored;
    try {
      stored = JSON.parse(await readFile(dataFile, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return data;
      }
      throw error;
    }

    // Older files stored only the champions at the top level.
    const champions = stored?.champions ?? stored;

    for (const mode of MODES) {
      const record = champions?.[mode];
      if (record && typeof record.name === "string" && Number.isInteger(record.score)) {
        data.champions[mode] = record;
      }
    }

    if (stored?.players && typeof stored.players === "object") {
      data.players = stored.players;
    } else {
      for (const mode of MODES) {
        const record = data.champions[mode];
        if (record) {
          const key = playerKey(record.name);
          data.players[key] = { name: record.name, ...data.players[key], [mode]: record.score };
        }
      }
    }

    return data;
  }

  async function write(data) {
    await mkdir(path.dirname(dataFile), { recursive: true });
    const tempFile = `${dataFile}.tmp`;
    await writeFile(tempFile, JSON.stringify(data, null, 2));
    await rename(tempFile, dataFile);
  }

  // Saves only if the score beats this player's own best for the mode.
  function saveScore(mode, name, score) {
    const task = writeQueue.then(async () => {
      const data = await load();
      const key = playerKey(name);
      const player = data.players[key] ?? { name };
      const previousBest = player[mode] ?? 0;

      if (score <= previousBest) {
        return { saved: false, newChampion: false, highscores: data.champions };
      }

      data.players[key] = { ...player, name, [mode]: score };

      const champion = data.champions[mode];
      const newChampion = !champion || score > champion.score;
      if (newChampion) {
        data.champions[mode] = { name, score, achievedAt: new Date().toISOString() };
      }

      await write(data);
      return { saved: true, newChampion, highscores: data.champions };
    });

    writeQueue = task.catch(() => {});
    return task;
  }

  async function getPlayer(name) {
    const { players } = await load();
    const player = players[playerKey(name)];
    return {
      name: player?.name ?? name,
      highScore: Object.fromEntries(MODES.map((mode) => [mode, player?.[mode] ?? 0])),
    };
  }

  async function getChampions() {
    return (await load()).champions;
  }

  return { saveScore, getPlayer, getChampions };
}

/*
 * -------------------------
 * Game sessions (in memory)
 * -------------------------
 *
 * A session is one game in progress. Its ID changes after every accepted
 * update, so each ID can only be used once. Someone copying an old ID, or
 * making one up, gets a 400.
 */

function createSessionStore() {
  // current session ID -> session
  const sessions = new Map();

  // previous session ID -> current session ID, used to replay a lost response
  const previousIds = new Map();

  function remove(sessionId) {
    const session = sessions.get(sessionId);
    if (session?.prevId) {
      previousIds.delete(session.prevId);
    }
    sessions.delete(sessionId);
  }

  function create(name, mode) {
    const sessionId = randomUUID();
    sessions.set(sessionId, {
      name,
      mode,
      score: 0,
      lastUpdate: Date.now(),
      prevId: null,
      lastResponse: null,
    });
    return sessionId;
  }

  // If this ID was just replaced, returns the session that replaced it.
  function findByPreviousId(sessionId) {
    const currentId = previousIds.get(sessionId);
    return currentId ? { currentId, session: sessions.get(currentId) } : null;
  }

  // Moves the session to a fresh ID and remembers the old one for retries.
  function rotate(oldId, session) {
    const newId = randomUUID();
    remove(oldId);
    session.prevId = oldId;
    session.lastResponse = { sessionId: newId };
    sessions.set(newId, session);
    previousIds.set(oldId, newId);
    return newId;
  }

  function removeExpired() {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [sessionId, session] of sessions) {
      if (session.lastUpdate < cutoff) {
        remove(sessionId);
      }
    }
  }

  return { sessions, create, findByPreviousId, rotate, remove, removeExpired };
}

/*
 * Checks a reported score against the session.
 * Returns null if it's believable, otherwise { error, cheat }.
 * cheat = true means the session should be deleted.
 */
function checkScore(session, score, { checkTooEarly }) {
  if (!Number.isInteger(score)) {
    return { error: "Score must be an integer", cheat: false };
  }
  if (score < session.score) {
    return { error: "Score can't go down", cheat: false };
  }

  const elapsedSec = (Date.now() - session.lastUpdate) / 1000;
  const delta = score - session.score;

  if (checkTooEarly && elapsedSec < UPDATE_INTERVAL_SEC - TIMING_TOLERANCE_SEC) {
    return { error: "Update sent too early", cheat: true };
  }

  const maxDelta = (elapsedSec + TIMING_TOLERANCE_SEC) * MAX_POINTS_PER_SECOND[session.mode];
  if (delta > maxDelta) {
    return { error: "Score increased too fast", cheat: true };
  }

  return null;
}

/*
 * -------------------------
 * HTTP routes
 * -------------------------
 *
 * GET  /api/highscores   champion of each mode (shown in the UI)
 * POST /api/highscores   disabled: scores can only arrive through /game/end
 * GET  /score/:name      one player's best score per mode
 * POST /game/start       starts a session, returns { sessionId }
 * POST /game/update      periodic score report, returns a new { sessionId }
 * POST /game/end         final score, saved if it's a personal best
 */

export function createHighscoreMiddleware(dataFile) {
  const store = createScoreStore(dataFile);
  const sessions = createSessionStore();

  // unref() so this timer never keeps a process (like `vite build`) alive on its own.
  setInterval(sessions.removeExpired, CLEANUP_INTERVAL_MS).unref();

  async function handleStart(req, res) {
    const body = await readJsonBody(req);
    const name = validateName(body?.name);

    if (!name) {
      return badRequest(res, `Name must be 1-${MAX_NAME_LENGTH} characters`);
    }
    if (!MODES.includes(body?.mode)) {
      return badRequest(res, "Unknown game mode");
    }

    sendJson(res, 200, { sessionId: sessions.create(name, body.mode) });
  }

  async function handleUpdate(req, res) {
    const { sessionId, score } = (await readJsonBody(req)) ?? {};

    // The client didn't get our last answer and is retrying with the old ID:
    // send the same answer again instead of rejecting it.
    const retry = sessions.findByPreviousId(sessionId);
    if (retry?.session?.lastResponse) {
      return sendJson(res, 200, retry.session.lastResponse);
    }

    const session = sessions.sessions.get(sessionId);
    if (!session) {
      return badRequest(res, "Unknown or expired session");
    }

    const problem = checkScore(session, score, { checkTooEarly: true });
    if (problem) {
      if (problem.cheat) {
        sessions.remove(sessionId);
      }
      return badRequest(res, problem.error);
    }

    session.score = score;
    session.lastUpdate = Date.now();

    sendJson(res, 200, { sessionId: sessions.rotate(sessionId, session) });
  }

  async function handleEnd(req, res) {
    const { sessionId, score } = (await readJsonBody(req)) ?? {};

    let currentId = sessionId;
    let session = sessions.sessions.get(sessionId);

    // The game can end while an update is in flight, or after its response was
    // lost. The client then still holds the previous ID, so follow it to the
    // current session instead of throwing the game away.
    if (!session) {
      const retry = sessions.findByPreviousId(sessionId);
      if (retry?.session) {
        currentId = retry.currentId;
        session = retry.session;
      }
    }

    if (!session) {
      return badRequest(res, "Unknown or expired session");
    }

    // The game can end at any moment, so no "too early" check here.
    const problem = checkScore(session, score, { checkTooEarly: false });
    if (problem) {
      if (problem.cheat) {
        sessions.remove(currentId);
      }
      return badRequest(res, problem.error);
    }

    // Delete first so the same ID can't end the game twice.
    sessions.remove(currentId);

    const result = await store.saveScore(session.mode, session.name, score);
    sendJson(res, 200, { score, ...result });
  }

  async function handleGetPlayer(req, res, rawName) {
    let name;
    try {
      name = validateName(decodeURIComponent(rawName));
    } catch {
      name = null;
    }
    if (!name) {
      return badRequest(res, "Invalid name");
    }
    sendJson(res, 200, await store.getPlayer(name));
  }

  return async function highscoreMiddleware(req, res, next) {
    const pathname = (req.url ?? "").split("?")[0];
    const { method } = req;

    try {
      if (pathname === "/api/highscores") {
        if (method === "GET") {
          return sendJson(res, 200, { highscores: await store.getChampions() });
        }
        res.setHeader("Allow", "GET");
        return sendJson(res, 405, { error: "Scores can only be submitted by finishing a game" });
      }

      if (pathname.startsWith("/score/") && method === "GET") {
        return await handleGetPlayer(req, res, pathname.slice("/score/".length));
      }

      if (pathname === "/game/start" && method === "POST") {
        return await handleStart(req, res);
      }
      if (pathname === "/game/update" && method === "POST") {
        return await handleUpdate(req, res);
      }
      if (pathname === "/game/end" && method === "POST") {
        return await handleEnd(req, res);
      }
    } catch (error) {
      if (error.status) {
        return sendJson(res, error.status, { error: error.message });
      }
      console.error("[highscores]", error);
      return sendJson(res, 500, { error: "Could not access high scores" });
    }

    if (next) {
      next();
    } else {
      sendJson(res, 404, { error: "Not found" });
    }
  };
}
