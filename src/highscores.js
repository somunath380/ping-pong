/*
 * Every failure throws an Error with a `status`:
 * 0 means the request never got an answer (network down, server asleep),
 * anything else is the HTTP status the server sent back.
 */
async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw Object.assign(new Error("Network error"), { status: 0 });
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(
      new Error(body.error ?? `Request failed (${response.status})`),
      { status: response.status },
    );
  }
  return body;
}

function postJson(url, body) {
  return request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Champion of each mode: { classic: { name, score } | null, blockBreaker: ... }
export async function fetchHighscores() {
  const { highscores } = await request("/api/highscores");
  return highscores;
}

// Returns { sessionId }.
export function startGameSession(mode, name) {
  return postJson("/game/start", { mode, name });
}

// Returns { sessionId } with the ID to use for the next call.
export function updateGameSession(sessionId, score) {
  return postJson("/game/update", { sessionId, score });
}

// Returns { score, saved, newChampion, highscores }.
export function endGameSession(sessionId, score) {
  return postJson("/game/end", { sessionId, score });
}
