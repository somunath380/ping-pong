const ENDPOINT = "/api/highscores";

async function parseResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return body;
}

export async function fetchHighscores() {
  const { highscores } = await parseResponse(await fetch(ENDPOINT));
  return highscores;
}

export async function submitHighscore(mode, name, score) {
  return parseResponse(
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, name, score }),
    }),
  );
}
