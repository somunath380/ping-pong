function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value, fallback) {
  return value && String(value).trim() ? String(value) : fallback;
}

export const config = {
  keyLeft: str(import.meta.env.VITE_KEY_LEFT, "ArrowLeft"),
  keyRight: str(import.meta.env.VITE_KEY_RIGHT, "ArrowRight"),
  paddleWidth: num(import.meta.env.VITE_PADDLE_WIDTH, 160),
  paddleHeight: num(import.meta.env.VITE_PADDLE_HEIGHT, 16),
  paddleSpeed: num(import.meta.env.VITE_PADDLE_SPEED, 8),
  paddleShrink: num(import.meta.env.VITE_PADDLE_SHRINK, 20),
  paddleMinWidth: num(import.meta.env.VITE_PADDLE_MIN_WIDTH, 40),
  ballRadius: num(import.meta.env.VITE_BALL_RADIUS, 8),
  ballSpeed: num(import.meta.env.VITE_BALL_SPEED, 5),
  ball2DelayMs: num(import.meta.env.VITE_BALL_2_DELAY_MS, 15000),
  ball3DelayMs: num(import.meta.env.VITE_BALL_3_DELAY_MS, 30000),
  canvasWidth: num(import.meta.env.VITE_CANVAS_WIDTH, 800),
  canvasHeight: num(import.meta.env.VITE_CANVAS_HEIGHT, 600),
  scoreWindowMs: num(import.meta.env.VITE_SCORE_WINDOW_MS, 8000),
};
