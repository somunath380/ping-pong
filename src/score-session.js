import {
  endGameSession,
  startGameSession,
  updateGameSession,
} from "./highscores.js";

// Must match UPDATE_INTERVAL_SEC in server/highscores.js.
const UPDATE_INTERVAL_MS = 10_000;

// Wait before retrying a request that failed because of the network.
const RETRY_DELAY_MS = 2_000;

const END_ATTEMPTS = 3;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * Reports the score of one game to the server so the final score can be
 * trusted.
 *
 * 1. start(): asks the server for a session ID.
 * 2. Every 10s: sends the latest score with the current ID. The server
 *    answers with a new ID, which replaces the old one only on success.
 * 3. end(): sends the final score, which the server saves if it's the
 *    player's best.
 *
 * If the server rejects an update (400), onRejected is called so the game
 * can be stopped.
 */
export class ScoreSession {
  constructor({ onRejected }) {
    this.onRejected = onRejected;
    this.sessionId = null;
    this.latestScore = 0;
    this.timer = null;
    // Bumped on every start/end/cancel so answers for an older game are ignored.
    this.generation = 0;
    // Set when the session couldn't be created, so the game can't be saved.
    this.unavailable = false;
  }

  async start(mode, name) {
    this.cancel();
    const generation = this.generation;
    this.unavailable = false;
    this.latestScore = 0;

    try {
      const { sessionId } = await startGameSession(mode, name);
      if (generation !== this.generation) {
        return;
      }
      this.sessionId = sessionId;
      this.scheduleUpdate(UPDATE_INTERVAL_MS);
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }
      // The game still runs; its score just won't be saved.
      console.error("Could not start a score session", error);
      this.unavailable = true;
    }
  }

  setScore(score) {
    this.latestScore = score;
  }

  scheduleUpdate(delay) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sendUpdate(), delay);
  }

  async sendUpdate() {
    const generation = this.generation;

    try {
      const { sessionId } = await updateGameSession(this.sessionId, this.latestScore);
      if (generation !== this.generation) {
        return;
      }
      this.sessionId = sessionId;
      // Counted from the answer, not from the send, so the next update can
      // never reach the server "too early" because of a slow response.
      this.scheduleUpdate(UPDATE_INTERVAL_MS);
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }
      if (error.status === 0 || error.status >= 500) {
        // Keep the same ID. If the server did get the first request, it
        // replays its answer for the old ID.
        this.scheduleUpdate(RETRY_DELAY_MS);
      } else if (error.status === 400) {
        this.cancel();
        this.onRejected?.(error.message);
      } else {
        // Any other answer (for example 404 when the API isn't deployed):
        // give up quietly and don't save this game.
        this.cancel();
        this.unavailable = true;
      }
    }
  }

  /*
   * Sends the final score. Resolves with the server's answer, or with null
   * if there was no session to end. Throws if the server couldn't be
   * reached or rejected the score.
   */
  async end(score) {
    const sessionId = this.sessionId;
    this.cancel();

    if (!sessionId) {
      return null;
    }

    for (let attempt = 1; ; attempt++) {
      try {
        return await endGameSession(sessionId, score);
      } catch (error) {
        const retryable = error.status === 0 || error.status >= 500;
        if (!retryable || attempt >= END_ATTEMPTS) {
          throw error;
        }
        await wait(RETRY_DELAY_MS);
      }
    }
  }

  // Stops the update timer and forgets the session (used when a game is abandoned).
  cancel() {
    clearTimeout(this.timer);
    this.timer = null;
    this.sessionId = null;
    this.generation += 1;
  }
}
