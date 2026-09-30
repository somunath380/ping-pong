import { config } from "./config.js";
import { sounds } from "./audio.js";
import { fetchHighscores } from "./highscores.js";
import { ScoreSession } from "./score-session.js";
import { ClassicGame } from "./games/classic.js";
import { BlockBreakerGame } from "./games/block-breaker.js";

const PLAYER_NAME_KEY = "pingpong.playerName";
const CONTROLS_KEY = "pingpong.controls";

const KEY_SYMBOLS = { ArrowLeft: "\u2190", ArrowRight: "\u2192", ArrowUp: "\u2191", ArrowDown: "\u2193" };
const keyLabel = (key) => KEY_SYMBOLS[key] ?? (key.length === 1 ? key.toUpperCase() : key);

// First option in each list is the default for that kind of device.
const CONTROL_OPTIONS = {
  desktop: [
    {
      id: "keyboard",
      label: "Keyboard",
      hint: `Use ${keyLabel(config.keyLeft)} ${keyLabel(config.keyRight)} to move.`,
    },
    { id: "mouse", label: "Mouse", hint: "Move the mouse left and right to move." },
  ],
  touch: [
    { id: "buttons", label: "Buttons", hint: "Hold the \u25C0 \u25B6 buttons to move." },
    { id: "drag", label: "Touch & drag", hint: "Touch the game and drag your finger to move." },
  ],
};

const MODES = {
  classic: {
    label: "Classic",
    description:
      `Hit every ball in play within each ${config.scoreWindowMs / 1000}-second window to score. ` +
      "Extra balls join over time, and every miss shrinks your paddle.",
    hasLevels: false,
  },
  blockBreaker: {
    label: "Block Breaker",
    description:
      "Level N drops N rows of blocks. Clear them all to reach the next level. " +
      "If any block reaches your paddle, the game is over. " +
      "Catch + balls to widen your paddle and \u2191 balls to wipe out the top row.",
    hasLevels: true,
  },
};

const $ = (selector) => document.querySelector(selector);

const app = $("#app");
const stage = $(".stage");
const canvas = $("#game");
const overlay = $("#overlay");
const viewSelect = $("#view-select");
const viewMode = $("#view-mode");
const overlayTitle = $("#overlay-title");
const overlayMessage = $("#overlay-message");
const overlayBest = $("#overlay-best");
const actionBtn = $("#action-btn");
const changeModeBtn = $("#change-mode-btn");
const nameForm = $("#name-form");
const nameInput = $("#player-name");
const nameStatus = $("#name-status");
const scoreEl = $("#score");
const bestEl = $("#best");
const scorePopEl = $("#score-pop");
const levelInfoEl = $("#level-info");
const levelEl = $("#level");
const timerEl = $("#timer");
const startBanner = $("#start-banner");
const pauseBtn = $("#pause-btn");
const pauseScreen = $("#pause-screen");
const pauseHint = $("#pause-hint");
const resumeBtn = $("#resume-btn");
const pauseChangeModeBtn = $("#pause-change-mode-btn");

const pauseKeyLabel = keyLabel(config.keyPause);

pauseHint.textContent = `Press ${pauseKeyLabel} or Esc to resume.`;
pauseBtn.title = `Pause (${pauseKeyLabel} / Esc)`;

let highscores = null;
let highscoresUnavailable = false;
let currentMode = null;
let activeGame = null;
let playerName = "";
let gameOverToken = 0;

const scoreSession = new ScoreSession({ onRejected: handleScoreRejected });

document.documentElement.style.setProperty(
  "--game-ratio",
  String(config.canvasWidth / config.canvasHeight),
);

/*
 * -------------------------
 * Games
 * -------------------------
 */

function handleScore(score) {
  scoreSession.setScore(score);
  scoreEl.textContent = `Score: ${score}`;
  scorePopEl.textContent = "+1";
  scorePopEl.classList.remove("hidden", "score-pop");
  void scorePopEl.offsetWidth;
  scorePopEl.classList.add("score-pop");
}

const games = {
  classic: new ClassicGame(canvas, config, {
    onScore: handleScore,
    onGameOver: (score) => handleGameOver(score),
  }),

  blockBreaker: new BlockBreakerGame(canvas, config, {
    onScore: handleScore,
    onGameOver: (score, level) => handleGameOver(score, level),
    onLevelStart(level) {
      levelEl.textContent = `Level: ${level}`;
    },
    onProgress(rowsLeft) {
      timerEl.textContent = `Rows left: ${rowsLeft}`;
    },
    onLevelComplete(level) {
      levelEl.textContent = `Level: ${level}`;
    },
    onLevelPause(nextLevel) {
      levelEl.textContent = `Level: ${nextLevel}`;
    },
  }),
};

function resetHud() {
  scoreEl.textContent = "Score: 0";
  levelEl.textContent = "Level: 1";
  timerEl.textContent = "Rows left: 1";
  scorePopEl.classList.add("hidden");
  levelInfoEl.classList.toggle(
    "hidden",
    !currentMode || !MODES[currentMode].hasLevels,
  );
}

/*
 * -------------------------
 * High scores
 * -------------------------
 */

function describeRecord(record) {
  return record
    ? `Best: ${record.score} by ${record.name}`
    : "No high score yet. Be the first!";
}

function renderHighscores() {
  for (const el of document.querySelectorAll("[data-best-for]")) {
    el.textContent = highscoresUnavailable
      ? "High scores unavailable"
      : highscores
        ? describeRecord(highscores[el.dataset.bestFor])
        : "Loading best score...";
  }

  const record = currentMode && highscores?.[currentMode];

  bestEl.textContent = record
    ? `Best: ${record.score} (${record.name})`
    : "Best: -";

  overlayBest.textContent = highscoresUnavailable
    ? "High scores unavailable right now."
    : currentMode && highscores
      ? describeRecord(highscores[currentMode])
      : "";
}

async function loadHighscores() {
  try {
    highscores = await fetchHighscores();
    highscoresUnavailable = false;
  } catch (error) {
    console.error("Could not load high scores", error);
    highscoresUnavailable = true;
  }
  renderHighscores();
}

/*
 * -------------------------
 * Overlay views
 * -------------------------
 */

function clearStatus() {
  nameStatus.classList.add("hidden");
}

function showStatus(message) {
  nameStatus.textContent = message;
  nameStatus.classList.remove("hidden");
}

function showModeSelect() {
  activeGame?.stop();
  scoreSession.cancel();
  hidePauseUi();
  currentMode = null;
  activeGame = null;
  gameOverToken += 1;
  clearStatus();
  resetHud();
  renderHighscores();
  viewMode.classList.add("hidden");
  viewSelect.classList.remove("hidden");
  overlay.classList.remove("hidden");
  loadHighscores();
}

function showModeView(title, message, buttonLabel) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  actionBtn.textContent = buttonLabel;
  viewSelect.classList.add("hidden");
  viewMode.classList.remove("hidden");
  overlay.classList.remove("hidden");
}

function selectMode(mode) {
  currentMode = mode;
  activeGame = games[mode];
  activeGame.showIdle();
  hidePauseUi();
  clearStatus();
  nameInput.value = localStorage.getItem(PLAYER_NAME_KEY) ?? "";
  resetHud();
  renderHighscores();
  showModeView(MODES[mode].label, MODES[mode].description, "Start");
}

function startGame() {
  if (!activeGame) {
    return;
  }

  // The server rejects blank names or names over 20 characters, so check here first.
  const name = nameInput.value.replace(/\s+/g, " ").trim();
  if (!name) {
    showStatus("Enter your name to start.");
    nameInput.focus();
    return;
  }
  playerName = name;
  localStorage.setItem(PLAYER_NAME_KEY, name);

  gameOverToken += 1;
  clearStatus();
  overlay.classList.add("hidden");
  pauseScreen.classList.add("hidden");
  pauseBtn.classList.remove("hidden");
  resetHud();
  showStartBanner();
  sounds.gameStart();
  activeGame.start();

  // Runs in the background; the game doesn't wait for the server.
  scoreSession.start(currentMode, name);
}

/*
 * -------------------------
 * Pause
 * -------------------------
 */

function hidePauseUi() {
  pauseBtn.classList.add("hidden");
  pauseScreen.classList.add("hidden");
}

function pauseGame() {
  if (!activeGame?.running || activeGame.paused) {
    return;
  }
  activeGame.pause();
  pauseBtn.classList.add("hidden");
  pauseScreen.classList.remove("hidden");
  resumeBtn.focus();
}

function resumeGame() {
  if (!activeGame?.running || !activeGame.paused) {
    return;
  }
  pauseScreen.classList.add("hidden");
  pauseBtn.classList.remove("hidden");
  pauseBtn.blur();
  activeGame.resume();
}

function isPauseKey(event) {
  if (event.key === "Escape") {
    return true;
  }
  return config.keyPause.length === 1
    ? event.key.toLowerCase() === config.keyPause.toLowerCase()
    : event.key === config.keyPause;
}

pauseBtn.addEventListener("click", pauseGame);
resumeBtn.addEventListener("click", resumeGame);
pauseChangeModeBtn.addEventListener("click", showModeSelect);

window.addEventListener("keydown", (event) => {
  if (event.repeat || !activeGame?.running || !isPauseKey(event)) {
    return;
  }
  event.preventDefault();
  if (activeGame.paused) {
    resumeGame();
  } else {
    pauseGame();
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseGame();
  }
});

async function handleGameOver(score, level) {
  const mode = currentMode;
  const token = ++gameOverToken;

  hidePauseUi();

  const message = MODES[mode].hasLevels
    ? `Your score: ${score}. You reached level ${level}.`
    : `Your score: ${score}.`;

  clearStatus();
  showModeView("KHATAM TATA BYE BYE!", message, "Restart");

  // The server checks the final score against the updates it saw during the
  // game and saves it only if it's this player's best.
  let result = null;
  let saveError = null;
  try {
    result = await scoreSession.end(score);
  } catch (error) {
    saveError = error;
  }

  if (token !== gameOverToken) {
    return;
  }

  if (!result) {
    await loadHighscores();
    if (token === gameOverToken && score > 0) {
      showStatus(
        saveError
          ? `Couldn't save your score: ${saveError.message}`
          : "Couldn't reach the high score server, so this score wasn't saved.",
      );
    }
    return;
  }

  highscores = result.highscores;
  highscoresUnavailable = false;
  renderHighscores();

  if (result.newChampion) {
    showStatus(`New high score! ${playerName} now holds the ${MODES[mode].label} record.`);
  } else if (result.saved) {
    showStatus(`New personal best for ${playerName}!`);
  }
}

// Called when the server refuses a score update: the game is stopped and not saved.
function handleScoreRejected(reason) {
  if (!activeGame?.running) {
    return;
  }
  activeGame.stop();
  gameOverToken += 1;
  hidePauseUi();
  showModeView(
    "Score rejected",
    `The server didn't accept this game's score (${reason}), so the game was stopped and not saved.`,
    "Restart",
  );
}

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  startGame();
});

for (const card of document.querySelectorAll(".mode-card")) {
  card.addEventListener("click", () => selectMode(card.dataset.mode));
}

changeModeBtn.addEventListener("click", showModeSelect);

/*
 * -------------------------
 * Mobile buttons
 * -------------------------
 */

function bindControlButton(button, direction) {
  const release = () => {
    button.classList.remove("active");
    activeGame?.setMoving(direction, false);
  };

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add("active");
    activeGame?.setMoving(direction, true);
  });

  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

bindControlButton($("#btn-left"), "left");
bindControlButton($("#btn-right"), "right");

/*
 * -------------------------
 * Control settings
 * -------------------------
 */

const touchDeviceQuery = window.matchMedia("(pointer: coarse)");

function deviceKind() {
  return touchDeviceQuery.matches ? "touch" : "desktop";
}

function loadControlPrefs() {
  try {
    return JSON.parse(localStorage.getItem(CONTROLS_KEY)) ?? {};
  } catch {
    return {};
  }
}

let controlPrefs = loadControlPrefs();

function currentControl() {
  const options = CONTROL_OPTIONS[deviceKind()];
  const saved = controlPrefs[deviceKind()];
  return options.some((option) => option.id === saved) ? saved : options[0].id;
}

function setControl(id) {
  controlPrefs = { ...controlPrefs, [deviceKind()]: id };
  localStorage.setItem(CONTROLS_KEY, JSON.stringify(controlPrefs));
  applyControl();
}

function renderControlSettings() {
  const options = CONTROL_OPTIONS[deviceKind()];
  const control = currentControl();

  for (const container of document.querySelectorAll(".control-setting")) {
    const label = document.createElement("span");
    label.className = "control-label";
    label.textContent = "Controls";

    const group = document.createElement("div");
    group.className = "control-options";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Paddle controls");

    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "control-option";
      button.textContent = option.label;
      button.setAttribute("aria-pressed", String(option.id === control));
      button.addEventListener("click", () => setControl(option.id));
      group.append(button);
    }

    const hint = document.createElement("span");
    hint.className = "control-hint";
    hint.textContent = options.find((option) => option.id === control).hint;

    container.replaceChildren(label, group, hint);
  }
}

function applyControl() {
  app.dataset.control = currentControl();
  dragPointerId = null;
  renderControlSettings();
}

touchDeviceQuery.addEventListener("change", applyControl);

/*
 * -------------------------
 * Mouse and touch/drag input
 * -------------------------
 */

let dragPointerId = null;

function canvasXFromPointer(event) {
  const rect = canvas.getBoundingClientRect();
  return ((event.clientX - rect.left) / rect.width) * config.canvasWidth;
}

function isPlaying() {
  return Boolean(activeGame?.running && !activeGame.paused);
}

// Tracked on window so the paddle keeps following when the cursor leaves the game area.
window.addEventListener("pointermove", (event) => {
  if (!isPlaying()) {
    return;
  }

  const control = currentControl();

  if (control === "mouse" && event.pointerType === "mouse") {
    activeGame.setPaddleTarget(canvasXFromPointer(event));
  } else if (control === "drag" && event.pointerId === dragPointerId) {
    activeGame.setPaddleTarget(canvasXFromPointer(event));
  }
});

stage.addEventListener("pointerdown", (event) => {
  if (
    currentControl() !== "drag" ||
    !isPlaying() ||
    event.target.closest("button, .overlay")
  ) {
    return;
  }

  event.preventDefault();
  dragPointerId = event.pointerId;
  stage.setPointerCapture(event.pointerId);
  activeGame.setPaddleTarget(canvasXFromPointer(event));
});

function endDrag(event) {
  if (event.pointerId === dragPointerId) {
    dragPointerId = null;
  }
}

stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);
stage.addEventListener("lostpointercapture", endDrag);

/*
 * -------------------------
 * Animations
 * -------------------------
 */

function showStartBanner() {
  startBanner.classList.add("hidden");
  void startBanner.offsetWidth;
  startBanner.classList.remove("hidden");
}

startBanner.addEventListener("animationend", (event) => {
  if (event.target === startBanner) {
    startBanner.classList.add("hidden");
  }
});

scorePopEl.addEventListener("animationend", () => {
  scorePopEl.classList.add("hidden");
});

/*
 * -------------------------
 * Boot
 * -------------------------
 */

applyControl();
games.classic.showIdle();
showModeSelect();
