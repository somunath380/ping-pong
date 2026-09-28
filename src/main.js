import { config } from "./config.js";
import { Game } from "./game.js";
import { sounds } from "./audio.js";

const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayMessage = document.querySelector("#overlay-message");
const actionBtn = document.querySelector("#action-btn");
const scoreEl = document.querySelector("#score");
const scorePopEl = document.querySelector("#score-pop");
const startBanner = document.querySelector("#start-banner");

const game = new Game(document.querySelector("#game"), config, {
  onScore(score) {
    scoreEl.textContent = `Score: ${score}`;
    scorePopEl.classList.remove("hidden");
    scorePopEl.classList.remove("score-pop");
    void scorePopEl.offsetWidth;
    scorePopEl.classList.add("score-pop");
  },
  onGameOver(score) {
    showOverlay(
      "Game Over",
      `Final score: ${score}. The paddle got too small. Press Restart to play again.`,
      "Restart",
    );
  },
});

document.documentElement.style.setProperty(
  "--game-ratio",
  String(config.canvasWidth / config.canvasHeight),
);

game.showIdle();
scoreEl.textContent = "Score: 0";

function bindControlButton(button, direction) {
  const release = () => {
    button.classList.remove("active");
    game.setMoving(direction, false);
  };

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add("active");
    game.setMoving(direction, true);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

bindControlButton(document.querySelector("#btn-left"), "left");
bindControlButton(document.querySelector("#btn-right"), "right");

function showOverlay(title, message, buttonLabel) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  actionBtn.textContent = buttonLabel;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

actionBtn.addEventListener("click", () => {
  hideOverlay();
  scoreEl.textContent = "Score: 0";
  scorePopEl.classList.add("hidden");
  showStartBanner();
  sounds.gameStart();
  game.start();
});

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
