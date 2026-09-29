import paddleHitUrl from "../sounds/ffaah.mp3?url";
import missUrl from "../sounds/aaaagggg.mp3?url";
import newBallUrl from "../sounds/kyu-re-madarchod-cid.mp3?url";
import gameOverUrl from "../sounds/khatam.mp3?url";
import gameStartUrl from "../sounds/abhi-maza-ayagga.mp3?url";
import scoreUrl from "../sounds/ab-tu-gaya-beta-ab-dekh-tu-puneet.mp3?url";
import blockHitUrl from "../sounds/anime-ahh.mp3?url";
import rowClearedUrl from "../sounds/acha-ji-aisa-hai-kya.mp3?url";

const CLIP_MAX_MS = 4000;

function play(url) {
  const audio = new Audio(url);
  void audio.play().catch(() => {});
}

function createClippedPlayer(url, maxMs) {
  let current = null;
  let timer = null;

  return () => {
    if (current) {
      current.pause();
      clearTimeout(timer);
    }
    const audio = new Audio(url);
    current = audio;
    void audio.play().catch(() => {});
    timer = setTimeout(() => {
      audio.pause();
      if (current === audio) {
        current = null;
      }
    }, maxMs);
  };
}

const playGameStart = createClippedPlayer(gameStartUrl, CLIP_MAX_MS);
const playScore = createClippedPlayer(scoreUrl, CLIP_MAX_MS);

export const sounds = {
  gameStart() {
    playGameStart();
  },
  paddleHit() {
    play(paddleHitUrl);
  },
  miss() {
    play(missUrl);
  },
  newBall() {
    play(newBallUrl);
  },
  gameOver() {
    play(gameOverUrl);
  },
  score() {
    playScore();
  },
  blockHit() {
    play(blockHitUrl);
  },
  rowCleared() {
    play(rowClearedUrl);
  },
};
