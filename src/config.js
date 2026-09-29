function num(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function str(value, fallback) {
  return value &&
    String(value).trim()
    ? String(value)
    : fallback;
}

export const config = {
  /*
   * Controls
   */
  keyLeft: str(
    import.meta.env.VITE_KEY_LEFT,
    "ArrowLeft",
  ),

  keyRight: str(
    import.meta.env.VITE_KEY_RIGHT,
    "ArrowRight",
  ),

  /*
   * Escape always pauses too.
   */
  keyPause: str(
    import.meta.env.VITE_KEY_PAUSE,
    "p",
  ),

  /*
   * Canvas
   */
  canvasWidth: num(
    import.meta.env.VITE_CANVAS_WIDTH,
    800,
  ),

  canvasHeight: num(
    import.meta.env.VITE_CANVAS_HEIGHT,
    600,
  ),

  /*
   * Paddle
   */
  paddleWidth: num(
    import.meta.env.VITE_PADDLE_WIDTH,
    160,
  ),

  paddleHeight: num(
    import.meta.env.VITE_PADDLE_HEIGHT,
    16,
  ),

  paddleSpeed: num(
    import.meta.env.VITE_PADDLE_SPEED,
    8,
  ),

  paddleShrink: num(
    import.meta.env.VITE_PADDLE_SHRINK,
    20,
  ),

  paddleMinWidth: num(
    import.meta.env.VITE_PADDLE_MIN_WIDTH,
    40,
  ),

  /*
   * Ball
   */
  ballRadius: num(
    import.meta.env.VITE_BALL_RADIUS,
    8,
  ),

  ballSpeed: num(
    import.meta.env.VITE_BALL_SPEED,
    5,
  ),

  /*
   * Classic mode
   */
  ball2DelayMs: num(
    import.meta.env.VITE_BALL_2_DELAY_MS,
    15000,
  ),

  ball3DelayMs: num(
    import.meta.env.VITE_BALL_3_DELAY_MS,
    30000,
  ),

  scoreWindowMs: num(
    import.meta.env.VITE_SCORE_WINDOW_MS,
    8000,
  ),

  /*
   * Block Breaker: level N has N rows.
   * The next level starts once every
   * row is gone.
   *
   * Pause between levels.
   */
  levelPauseMs: num(
    import.meta.env.VITE_LEVEL_PAUSE_MS,
    3000,
  ),

  /*
   * Falling block dimensions.
   *
   * These are intentionally small.
   */
  blockWidth: num(
    import.meta.env.VITE_BLOCK_WIDTH,
    28,
  ),

  blockHeight: num(
    import.meta.env.VITE_BLOCK_HEIGHT,
    12,
  ),

  /*
   * Gap between blocks in a row.
   */
  blockGap: num(
    import.meta.env.VITE_BLOCK_GAP,
    6,
  ),

  /*
   * How far one row moves
   * downward at each step.
   */
  blockRowStep: num(
    import.meta.env.VITE_BLOCK_ROW_STEP,
    8,
  ),

  /*
   * How often all rows move
   * down by blockRowStep.
   *
   * 400ms means:
   *
   * move
   * pause
   * move
   * pause
   * move
   */
  blockRowMoveIntervalMs: num(
    import.meta.env.VITE_BLOCK_ROW_MOVE_INTERVAL_MS,
    400,
  ),

  /*
   * First level block pattern.
   *
   * 0.8 means roughly 80%
   * of positions contain blocks.
   */
  blockFillChance: num(
    import.meta.env.VITE_BLOCK_FILL_CHANCE,
    0.8,
  ),

  /*
   * Block Breaker power-up balls.
   *
   * Health ball: catching it
   * widens the paddle.
   */
  healthBallIntervalMs: num(
    import.meta.env.VITE_HEALTH_BALL_INTERVAL_MS,
    10000,
  ),

  healthWidthBonus: num(
    import.meta.env.VITE_HEALTH_WIDTH_BONUS,
    20,
  ),

  paddleMaxWidth: num(
    import.meta.env.VITE_PADDLE_MAX_WIDTH,
    400,
  ),

  /*
   * Clear-row ball: catching it
   * removes the top row of blocks.
   */
  clearRowBallIntervalMs: num(
    import.meta.env.VITE_CLEAR_ROW_BALL_INTERVAL_MS,
    15000,
  ),

  /*
   * Fall speed of power-up balls
   * in pixels per frame.
   */
  powerUpSpeed: num(
    import.meta.env.VITE_POWERUP_SPEED,
    2.5,
  ),
};