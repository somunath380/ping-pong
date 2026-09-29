import { sounds } from "../audio.js";

const PADDLE_BOTTOM_GAP = 18;

/*
 * Rows start below the score /
 * level HUD at the top.
 */
const ROWS_TOP_OFFSET = 70;

const MAX_VISIBLE_START_ROWS = 6;

const POWER_UP_TYPES = {
  health: {
    color: "#ff6b81",
    symbol: "+",
  },
  clearRow: {
    color: "#a55eea",
    symbol: "\u2191",
  },
};

const BALL_COLORS = [
  "#7cf0c3",
  "#7cc4ff",
  "#f0c37c",
];

const BLOCK_COLORS = [
  "#ff6b6b",
  "#ff9f43",
  "#54a0ff",
  "#5f27cd",
  "#1dd1a1",
  "#feca57",
];

function randomDirection(speed) {
  /*
   * Give the ball a random
   * starting direction.
   */
  const angle =
    (Math.random() * Math.PI) / 2 +
    Math.PI / 4;

  const heading =
    Math.random() < 0.5
      ? -1
      : 1;

  return {
    vx:
      Math.cos(angle) *
      speed *
      heading,

    vy:
      -Math.abs(
        Math.sin(angle) *
          speed,
      ),
  };
}

export class BlockBreakerGame {
  constructor(
    canvas,
    config,
    {
      onGameOver,
      onScore,
      onLevelStart,
      onLevelPause,
      onLevelComplete,
      onProgress,
    } = {},
  ) {
    this.canvas = canvas;

    this.ctx =
      canvas.getContext("2d");

    this.config = config;

    this.onGameOver =
      onGameOver;

    this.onScore =
      onScore;

    this.onLevelStart =
      onLevelStart;

    this.onLevelPause =
      onLevelPause;

    this.onLevelComplete =
      onLevelComplete;

    this.onProgress =
      onProgress;

    this.lastReportedRowsLeft = null;

    this.pressed =
      new Set();

    this.running = false;

    this.paused = false;

    this.pausedAt = 0;

    this.frameId = null;

    this.score = 0;

    this.level = 1;

    this.levelStartedAt = 0;

    this.levelPauseStartedAt = 0;

    /*
     * When the next power-up balls
     * should start falling.
     */
    this.nextHealthBallAt = 0;

    this.nextClearRowBallAt = 0;

    /*
     * When the rows should make
     * their next discrete movement.
     */
    this.nextRowMoveAt = 0;

    this.handleKeyDown =
      this.handleKeyDown.bind(
        this,
      );

    this.handleKeyUp =
      this.handleKeyUp.bind(
        this,
      );

    this.loop =
      this.loop.bind(this);
  }

  resetBoard() {
    this.canvas.width =
      this.config.canvasWidth;

    this.canvas.height =
      this.config.canvasHeight;

    this.paddle = {
      width:
        this.config.paddleWidth,

      height:
        this.config.paddleHeight,

      x:
        (
          this.config.canvasWidth -
          this.config.paddleWidth
        ) / 2,

      y:
        this.config.canvasHeight -
        this.config.paddleHeight -
        PADDLE_BOTTOM_GAP,
    };

    this.balls = [];

    this.targetX = null;

    /*
     * Each item here is a row.
     *
     * Example:
     *
     * [
     *   {
     *     y: 100,
     *     blocks: [...]
     *   },
     *   {
     *     y: 130,
     *     blocks: [...]
     *   }
     * ]
     */
    this.blockRows = [];

    /*
     * Falling "health" and
     * "clear row" balls.
     */
    this.powerUps = [];
  }

  showIdle() {
    this.stop();

    this.resetBoard();

    this.level = 1;

    this.balls = [
      this.createIdleBall(),
    ];

    this.draw();
  }

  start() {
    this.stop();

    this.resetBoard();

    this.score = 0;

    this.level = 1;

    this.running = true;

    window.addEventListener(
      "keydown",
      this.handleKeyDown,
    );

    window.addEventListener(
      "keyup",
      this.handleKeyUp,
    );

    this.startLevel();

    this.frameId =
      requestAnimationFrame(
        this.loop,
      );
  }

  pause() {
    if (
      !this.running ||
      this.paused
    ) {
      return;
    }

    this.paused = true;

    this.pausedAt =
      performance.now();

    this.pressed.clear();

    if (
      this.frameId !== null
    ) {
      cancelAnimationFrame(
        this.frameId,
      );

      this.frameId = null;
    }
  }

  resume() {
    if (
      !this.running ||
      !this.paused
    ) {
      return;
    }

    /*
     * Shift every timer forward so
     * time spent paused doesn't move
     * rows, spawn power-ups, or eat
     * into the between-level pause.
     */
    const pausedFor =
      performance.now() -
      this.pausedAt;

    this.levelStartedAt +=
      pausedFor;

    if (
      this.levelPauseStartedAt
    ) {
      this.levelPauseStartedAt +=
        pausedFor;
    }

    this.nextRowMoveAt +=
      pausedFor;

    this.nextHealthBallAt +=
      pausedFor;

    this.nextClearRowBallAt +=
      pausedFor;

    this.paused = false;

    this.pressed.clear();

    this.frameId =
      requestAnimationFrame(
        this.loop,
      );
  }

  stop() {
    this.running = false;

    this.paused = false;

    if (
      this.frameId !== null
    ) {
      cancelAnimationFrame(
        this.frameId,
      );

      this.frameId = null;
    }

    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
    );

    window.removeEventListener(
      "keyup",
      this.handleKeyUp,
    );

    this.pressed.clear();
  }

  startLevel() {
    this.levelStartedAt =
      performance.now();

    this.levelPauseStartedAt = 0;

    /*
     * Every level starts with the
     * paddle back at its normal size.
     */
    this.resetPaddleWidth();

    /*
     * First downward movement.
     */
    this.nextRowMoveAt =
      this.levelStartedAt +
      this.getRowMoveInterval();

    /*
     * Level N = N rows of blocks.
     */
    this.blockRows =
      this.createLevelRows(
        this.level,
      );

    this.powerUps = [];

    this.nextHealthBallAt =
      this.levelStartedAt +
      this.config.healthBallIntervalMs;

    this.nextClearRowBallAt =
      this.levelStartedAt +
      this.config.clearRowBallIntervalMs;

    this.lastReportedRowsLeft = null;

    /*
     * Number of balls:
     *
     * Level 1 = 1
     * Level 2 = 2
     * Level 3+ = 3
     */
    const ballCount =
      this.getBallCountForLevel();

    const previousBallCount =
      this.balls.length;

    this.balls = [];

    for (
      let i = 0;
      i < ballCount;
      i++
    ) {
      this.balls.push(
        this.createBall(),
      );
    }

    if (
      this.level > 1 &&
      ballCount > previousBallCount
    ) {
      sounds.newBall();
    }

    this.onLevelStart?.(
      this.level,
    );

    this.reportProgress();
  }

  resetPaddleWidth() {
    const center =
      this.paddle.x +
      this.paddle.width / 2;

    this.setPaddleWidth(
      this.config.paddleWidth,
      center,
    );
  }

  setPaddleWidth(
    width,
    center,
  ) {
    this.paddle.width = width;

    this.paddle.x =
      Math.max(
        0,
        Math.min(
          this.config.canvasWidth -
            width,
          center -
            width / 2,
        ),
      );
  }

  reportProgress() {
    const rowsLeft =
      this.blockRows.length;

    if (
      rowsLeft ===
      this.lastReportedRowsLeft
    ) {
      return;
    }

    this.lastReportedRowsLeft =
      rowsLeft;

    this.onProgress?.(
      rowsLeft,
    );
  }

  getBallCountForLevel() {
    if (this.level === 1) {
      return 1;
    }

    if (this.level === 2) {
      return 2;
    }

    return 3;
  }

  createIdleBall() {
    return {
      x:
        this.config.canvasWidth / 2,

      y:
        this.config.canvasHeight / 2,

      vx: 0,

      vy: 0,
    };
  }

  createBall() {
    const {
      vx,
      vy,
    } =
      randomDirection(
        this.config.ballSpeed,
      );

    return {
      ...this.createIdleBall(),

      vx,

      vy,
    };
  }

  handleKeyDown(event) {
    if (
      event.key ===
        this.config.keyLeft ||
      event.key ===
        this.config.keyRight
    ) {
      event.preventDefault();

      if (this.paused) {
        return;
      }

      this.pressed.add(
        event.key,
      );
    }
  }

  handleKeyUp(event) {
    this.pressed.delete(
      event.key,
    );
  }

  setMoving(
    direction,
    isPressed,
  ) {
    if (
      !this.running ||
      this.paused
    ) {
      return;
    }

    const key =
      direction === "left"
        ? this.config.keyLeft
        : this.config.keyRight;

    if (isPressed) {
      this.pressed.add(key);
    } else {
      this.pressed.delete(key);
    }
  }

  /*
   * x is the desired paddle centre
   * in canvas pixels (used by mouse
   * and touch controls).
   */
  setPaddleTarget(x) {
    if (
      !this.running ||
      this.paused
    ) {
      return;
    }

    this.targetX = x;
  }

  movePaddle() {
    if (
      this.pressed.size > 0
    ) {
      this.targetX = null;
    }

    if (
      this.pressed.has(
        this.config.keyLeft,
      )
    ) {
      this.paddle.x -=
        this.config.paddleSpeed;
    }

    if (
      this.pressed.has(
        this.config.keyRight,
      )
    ) {
      this.paddle.x +=
        this.config.paddleSpeed;
    }

    if (
      this.targetX !== null
    ) {
      this.paddle.x =
        this.targetX -
        this.paddle.width / 2;
    }

    this.paddle.x =
      Math.max(
        0,
        Math.min(
          this.config.canvasWidth -
            this.paddle.width,
          this.paddle.x,
        ),
      );
  }

  loop() {
    if (
      !this.running ||
      this.paused
    ) {
      return;
    }

    this.update();

    this.draw();

    if (this.running) {
      this.frameId =
        requestAnimationFrame(
          this.loop,
        );
    }
  }

  update() {
    /*
     * If we are between levels,
     * don't update normal gameplay.
     */
    if (
      this.levelPauseStartedAt
    ) {
      this.updateLevelPause();

      return;
    }

    this.movePaddle();

    this.moveRowsStep();

    this.spawnPowerUps();

    this.updatePowerUps();

    this.updateBalls();

    this.checkBlockCollisions();

    this.checkBallMisses();

    if (!this.running) {
      return;
    }

    this.checkRowsReachedBase();

    if (!this.running) {
      return;
    }

    this.reportProgress();

    this.checkLevelCleared();
  }

  /*
   * -------------------------
   * LEVEL SYSTEM
   * -------------------------
   */

  /*
   * The level ends once every
   * row is gone (destroyed or
   * cleared by a power-up).
   */
  checkLevelCleared() {
    if (
      this.blockRows.length === 0
    ) {
      this.completeLevel();
    }
  }

  completeLevel() {
    if (
      this.levelPauseStartedAt
    ) {
      return;
    }

    this.levelPauseStartedAt =
      performance.now();

    this.onLevelComplete?.(
      this.level,
    );

    this.onLevelPause?.(
      this.level + 1,
      this.config.levelPauseMs,
    );
  }

  updateLevelPause() {
    const elapsed =
      performance.now() -
      this.levelPauseStartedAt;

    if (
      elapsed <
      this.config.levelPauseMs
    ) {
      return;
    }

    this.level += 1;

    this.levelPauseStartedAt = 0;

    this.startLevel();
  }

  /*
   * -------------------------
   * DIFFICULTY
   * -------------------------
   */

  getRowMoveInterval() {
    /*
     * Level 1:
     * 400ms
     *
     * Level 2:
     * 375ms
     *
     * Level 3:
     * 350ms
     *
     * Eventually reaches 180ms.
     */
    return Math.max(
      180,
      this.config
        .blockRowMoveIntervalMs -
        (this.level - 1) *
          25,
    );
  }

  getBlockFillChance() {
    /*
     * Higher levels can have
     * slightly more blocks.
     */
    return Math.min(
      0.95,
      this.config.blockFillChance +
        (this.level - 1) *
          0.02,
    );
  }

  /*
   * -------------------------
   * ROW CREATION
   * -------------------------
   */

  /*
   * Build all rows for a level as
   * one stack. The lowest rows start
   * just below the HUD; rows beyond
   * MAX_VISIBLE_START_ROWS begin above
   * the canvas and march into view.
   */
  createLevelRows(count) {
    const pitch =
      this.config.blockHeight +
      this.config.blockGap;

    const visibleRows =
      Math.min(
        count,
        MAX_VISIBLE_START_ROWS,
      );

    const bottomRowY =
      ROWS_TOP_OFFSET +
      (visibleRows - 1) * pitch;

    const rows = [];

    for (
      let i = 0;
      i < count;
      i++
    ) {
      rows.push(
        this.createBlockRow(
          bottomRowY - i * pitch,
        ),
      );
    }

    return rows;
  }

  createBlockRow(y) {
    const {
      blockWidth,
      blockHeight,
      blockGap,
    } = this.config;

    /*
     * Number of positions that
     * can fit horizontally.
     */
    const columnCount =
      Math.floor(
        (
          this.config.canvasWidth +
          blockGap
        ) /
        (
          blockWidth +
          blockGap
        ),
      );

    /*
     * Center the whole row.
     */
    const totalWidth =
      columnCount *
        blockWidth +
      (columnCount - 1) *
        blockGap;

    const startX =
      (
        this.config.canvasWidth -
        totalWidth
      ) / 2;

    const blocks = [];

    for (
      let column = 0;
      column < columnCount;
      column++
    ) {
      /*
       * Randomly leave some gaps.
       */
      if (
        Math.random() >
        this.getBlockFillChance()
      ) {
        continue;
      }

      blocks.push({
        x:
          startX +
          column *
            (
              blockWidth +
              blockGap
            ),

        y,

        width:
          blockWidth,

        height:
          blockHeight,

        color:
          BLOCK_COLORS[
            Math.floor(
              Math.random() *
                BLOCK_COLORS.length,
            )
          ],
      });
    }

    /*
     * Make sure every row has
     * at least one block.
     */
    if (blocks.length === 0) {
      const randomColumn =
        Math.floor(
          Math.random() *
            columnCount,
        );

      blocks.push({
        x:
          startX +
          randomColumn *
            (
              blockWidth +
              blockGap
            ),

        y,

        width:
          blockWidth,

        height:
          blockHeight,

        color:
          BLOCK_COLORS[
            Math.floor(
              Math.random() *
                BLOCK_COLORS.length,
            )
          ],
      });
    }

    return {
      y,

      blocks,
    };
  }

  /*
   * Move ALL rows down by a small
   * fixed amount.
   *
   * This is intentionally NOT
   * continuous movement.
   */
  moveRowsStep() {
    const now =
      performance.now();

    if (
      now <
      this.nextRowMoveAt
    ) {
      return;
    }

    const step =
      this.config.blockRowStep;

    for (
      const row of this.blockRows
    ) {
      row.y += step;

      for (
        const block of row.blocks
      ) {
        block.y += step;
      }
    }

    this.nextRowMoveAt =
      now +
      this.getRowMoveInterval();
  }

  /*
   * -------------------------
   * POWER-UPS
   * -------------------------
   */

  spawnPowerUps() {
    const now =
      performance.now();

    if (
      now >=
      this.nextHealthBallAt
    ) {
      this.powerUps.push(
        this.createPowerUp(
          "health",
        ),
      );

      this.nextHealthBallAt =
        now +
        this.config.healthBallIntervalMs;
    }

    if (
      now >=
      this.nextClearRowBallAt
    ) {
      this.powerUps.push(
        this.createPowerUp(
          "clearRow",
        ),
      );

      this.nextClearRowBallAt =
        now +
        this.config.clearRowBallIntervalMs;
    }
  }

  createPowerUp(type) {
    const radius =
      this.config.ballRadius + 4;

    return {
      type,
      radius,
      x:
        radius +
        Math.random() *
          (
            this.config.canvasWidth -
            radius * 2
          ),
      y: -radius,
    };
  }

  updatePowerUps() {
    const remaining = [];

    for (
      const powerUp of this.powerUps
    ) {
      powerUp.y +=
        this.config.powerUpSpeed;

      if (
        this.isCaughtByPaddle(
          powerUp,
        )
      ) {
        this.applyPowerUp(
          powerUp,
        );

        continue;
      }

      /*
       * Missing a power-up has
       * no penalty; it just leaves
       * the screen.
       */
      if (
        powerUp.y -
          powerUp.radius <=
        this.config.canvasHeight
      ) {
        remaining.push(
          powerUp,
        );
      }
    }

    this.powerUps = remaining;
  }

  isCaughtByPaddle(powerUp) {
    const closestX =
      Math.max(
        this.paddle.x,
        Math.min(
          powerUp.x,
          this.paddle.x +
            this.paddle.width,
        ),
      );

    const closestY =
      Math.max(
        this.paddle.y,
        Math.min(
          powerUp.y,
          this.paddle.y +
            this.paddle.height,
        ),
      );

    const dx =
      powerUp.x - closestX;

    const dy =
      powerUp.y - closestY;

    return (
      dx * dx + dy * dy <=
      powerUp.radius *
        powerUp.radius
    );
  }

  applyPowerUp(powerUp) {
    if (
      powerUp.type === "health"
    ) {
      const center =
        this.paddle.x +
        this.paddle.width / 2;

      this.setPaddleWidth(
        Math.min(
          this.config.paddleMaxWidth,
          this.paddle.width +
            this.config.healthWidthBonus,
        ),
        center,
      );

      return;
    }

    if (
      powerUp.type === "clearRow"
    ) {
      this.removeTopRow();
    }
  }

  /*
   * Deletes the row furthest from
   * the paddle (the top of the stack).
   */
  removeTopRow() {
    if (
      this.blockRows.length === 0
    ) {
      return;
    }

    let topRow =
      this.blockRows[0];

    for (
      const row of this.blockRows
    ) {
      if (row.y < topRow.y) {
        topRow = row;
      }
    }

    this.blockRows =
      this.blockRows.filter(
        (row) => row !== topRow,
      );

    sounds.rowCleared();
  }

  /*
   * -------------------------
   * BALL MOVEMENT
   * -------------------------
   */

  updateBalls() {
    for (
      const ball of this.balls
    ) {
      /*
       * Save the previous position.
       *
       * This is important for
       * determining which side of
       * a block was hit.
       */
      ball.previousX = ball.x;

      ball.previousY = ball.y;

      ball.x += ball.vx;

      ball.y += ball.vy;

      this.bounceOffWalls(
        ball,
      );

      this.bounceOffPaddle(
        ball,
      );
    }
  }

  bounceOffWalls(ball) {
    const r =
      this.config.ballRadius;

    if (
      ball.x - r <= 0
    ) {
      ball.x = r;

      ball.vx =
        Math.abs(ball.vx);
    } else if (
      ball.x + r >=
      this.config.canvasWidth
    ) {
      ball.x =
        this.config.canvasWidth -
        r;

      ball.vx =
        -Math.abs(ball.vx);
    }

    if (
      ball.y - r <= 0
    ) {
      ball.y = r;

      ball.vy =
        Math.abs(ball.vy);
    }
  }

  bounceOffPaddle(ball) {
    if (
      ball.vy <= 0
    ) {
      return;
    }

    const r =
      this.config.ballRadius;

    const hitX =
      ball.x + r >=
        this.paddle.x &&
      ball.x - r <=
        this.paddle.x +
          this.paddle.width;

    const hitY =
      ball.y + r >=
        this.paddle.y &&
      ball.y - r <=
        this.paddle.y +
          this.paddle.height;

    if (
      !hitX ||
      !hitY
    ) {
      return;
    }

    ball.y =
      this.paddle.y -
      r;

    ball.vy =
      -Math.abs(ball.vy);

    sounds.paddleHit();

    const paddleCenter =
      this.paddle.x +
      this.paddle.width / 2;

    const offset =
      (
        ball.x -
        paddleCenter
      ) /
      (
        this.paddle.width / 2
      );

    ball.vx +=
      offset *
      this.config.ballSpeed *
      0.45;

    const maxSpeed =
      this.config.ballSpeed *
      1.6;

    ball.vx =
      Math.max(
        -maxSpeed,
        Math.min(
          maxSpeed,
          ball.vx,
        ),
      );
  }

  /*
   * -------------------------
   * BLOCK COLLISION
   * -------------------------
   */

  checkBlockCollisions() {
    const destroyed =
      new Set();

    for (
      const ball of this.balls
    ) {
      let ballHitBlock = false;

      for (
        const row of this.blockRows
      ) {
        for (
          const block of row.blocks
        ) {
          if (
            destroyed.has(block)
          ) {
            continue;
          }

          if (
            !this.circleIntersectsRect(
              ball,
              block,
            )
          ) {
            continue;
          }

          const side =
            this.getCollisionSide(
              ball,
              block,
            );

          this.resolveBlockCollision(
            ball,
            block,
            side,
          );

          destroyed.add(
            block,
          );

          this.score += 1;

          this.onScore?.(
            this.score,
          );

          sounds.blockHit();

          /*
           * A ball can destroy
           * only one block during
           * this update.
           */
          ballHitBlock = true;

          break;
        }

        if (ballHitBlock) {
          break;
        }
      }
    }

    if (
      destroyed.size === 0
    ) {
      return;
    }

    /*
     * Remove destroyed blocks.
     */
    for (
      const row of this.blockRows
    ) {
      row.blocks =
        row.blocks.filter(
          (block) =>
            !destroyed.has(
              block,
            ),
        );
    }

    /*
     * Remove completely empty rows.
     */
    this.blockRows =
      this.blockRows.filter(
        (row) =>
          row.blocks.length > 0,
      );
  }

  circleIntersectsRect(
    ball,
    rect,
  ) {
    const r =
      this.config.ballRadius;

    const closestX =
      Math.max(
        rect.x,
        Math.min(
          ball.x,
          rect.x +
            rect.width,
        ),
      );

    const closestY =
      Math.max(
        rect.y,
        Math.min(
          ball.y,
          rect.y +
            rect.height,
        ),
      );

    const dx =
      ball.x -
      closestX;

    const dy =
      ball.y -
      closestY;

    return (
      dx * dx +
        dy * dy <=
      r * r
    );
  }

  /*
   * Determine whether the ball
   * came from:
   *
   * top
   * bottom
   * left
   * right
   */
  getCollisionSide(
    ball,
    block,
  ) {
    const r =
      this.config.ballRadius;

    const previousX =
      ball.previousX ??
      (
        ball.x -
        ball.vx
      );

    const previousY =
      ball.previousY ??
      (
        ball.y -
        ball.vy
      );

    const previousLeft =
      previousX - r;

    const previousRight =
      previousX + r;

    const previousTop =
      previousY - r;

    const previousBottom =
      previousY + r;

    const blockLeft =
      block.x;

    const blockRight =
      block.x +
      block.width;

    const blockTop =
      block.y;

    const blockBottom =
      block.y +
      block.height;

    /*
     * Ball was above block.
     */
    if (
      previousBottom <=
        blockTop &&
      ball.y + r >=
        blockTop
    ) {
      return "top";
    }

    /*
     * Ball was below block.
     */
    if (
      previousTop >=
        blockBottom &&
      ball.y - r <=
        blockBottom
    ) {
      return "bottom";
    }

    /*
     * Ball was to the left.
     */
    if (
      previousRight <=
        blockLeft &&
      ball.x + r >=
        blockLeft
    ) {
      return "left";
    }

    /*
     * Ball was to the right.
     */
    if (
      previousLeft >=
        blockRight &&
      ball.x - r <=
        blockRight
    ) {
      return "right";
    }

    /*
     * Corner case.
     *
     * If the ball is already
     * overlapping the block, use
     * the smallest penetration.
     */
    const overlapLeft =
      ball.x +
      r -
      blockLeft;

    const overlapRight =
      blockRight -
      (
        ball.x - r
      );

    const overlapTop =
      ball.y +
      r -
      blockTop;

    const overlapBottom =
      blockBottom -
      (
        ball.y - r
      );

    const overlaps = [
      {
        side: "left",
        value: overlapLeft,
      },
      {
        side: "right",
        value: overlapRight,
      },
      {
        side: "top",
        value: overlapTop,
      },
      {
        side: "bottom",
        value: overlapBottom,
      },
    ];

    overlaps.sort(
      (a, b) =>
        a.value - b.value,
    );

    return overlaps[0].side;
  }

  resolveBlockCollision(
    ball,
    block,
    side,
  ) {
    const r =
      this.config.ballRadius;

    if (
      side === "top"
    ) {
      ball.y =
        block.y - r;

      ball.vy =
        -Math.abs(ball.vy);

      return;
    }

    if (
      side === "bottom"
    ) {
      ball.y =
        block.y +
        block.height +
        r;

      ball.vy =
        Math.abs(ball.vy);

      return;
    }

    if (
      side === "left"
    ) {
      ball.x =
        block.x - r;

      ball.vx =
        -Math.abs(ball.vx);

      return;
    }

    if (
      side === "right"
    ) {
      ball.x =
        block.x +
        block.width +
        r;

      ball.vx =
        Math.abs(ball.vx);
    }
  }

  /*
   * -------------------------
   * BALL MISSES
   * -------------------------
   */

  checkBallMisses() {
    const remainingBalls = [];

    for (
      const ball of this.balls
    ) {
      if (
        ball.y -
          this.config.ballRadius >
        this.config.canvasHeight
      ) {
        const survived =
          this.handleBallMiss();

        if (!survived) {
          return;
        }

        /*
         * Replace the missed ball.
         */
        remainingBalls.push(
          this.createBall(),
        );
      } else {
        remainingBalls.push(
          ball,
        );
      }
    }

    this.balls =
      remainingBalls;
  }

  handleBallMiss() {
    const nextWidth =
      this.paddle.width -
      this.config.paddleShrink;

    if (
      nextWidth <
      this.config.paddleMinWidth
    ) {
      this.finish();

      return false;
    }

    const center =
      this.paddle.x +
      this.paddle.width / 2;

    this.paddle.width =
      nextWidth;

    this.paddle.x =
      Math.max(
        0,
        Math.min(
          this.config.canvasWidth -
            this.paddle.width,
          center -
            this.paddle.width / 2,
        ),
      );

    sounds.miss();

    return true;
  }

  /*
   * -------------------------
   * ROW REACHES BASE
   * -------------------------
   */

  /*
   * Any block reaching the paddle's
   * level (the base / ground line)
   * ends the game immediately.
   */
  checkRowsReachedBase() {
    const reachedBase =
      this.blockRows.some(
        (row) =>
          row.blocks.some(
            (block) =>
              block.y +
                block.height >=
              this.paddle.y,
          ),
      );

    if (reachedBase) {
      this.finish();
    }
  }

  /*
   * -------------------------
   * DRAW
   * -------------------------
   */

  draw() {
    const {
      ctx,
      config,
    } = this;

    ctx.clearRect(
      0,
      0,
      config.canvasWidth,
      config.canvasHeight,
    );

    /*
     * Background
     */
    ctx.fillStyle =
      "#1a2440";

    ctx.fillRect(
      0,
      0,
      config.canvasWidth,
      config.canvasHeight,
    );

    /*
     * Middle line
     */
    ctx.strokeStyle =
      "#2c3b66";

    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(
      0,
      config.canvasHeight / 2,
    );

    ctx.lineTo(
      config.canvasWidth,
      config.canvasHeight / 2,
    );

    ctx.stroke();

    /*
     * Draw block rows.
     */
    for (
      const row of this.blockRows
    ) {
      for (
        const block of row.blocks
      ) {
        this.drawBlock(
          block,
        );
      }
    }

    for (
      const powerUp of this.powerUps
    ) {
      this.drawPowerUp(
        powerUp,
      );
    }

    /*
     * Paddle
     */
    ctx.fillStyle =
      "#e8eefc";

    ctx.fillRect(
      this.paddle.x,
      this.paddle.y,
      this.paddle.width,
      this.paddle.height,
    );

    /*
     * Balls
     */
    this.balls.forEach(
      (
        ball,
        index,
      ) => {
        ctx.beginPath();

        ctx.fillStyle =
          BALL_COLORS[
            index %
              BALL_COLORS.length
          ];

        ctx.arc(
          ball.x,
          ball.y,
          config.ballRadius,
          0,
          Math.PI * 2,
        );

        ctx.fill();
      },
    );

    /*
     * Level pause screen.
     */
    if (
      this.levelPauseStartedAt
    ) {
      this.drawLevelPause();
    }
  }

  drawBlock(block) {
    const {
      ctx,
    } = this;

    /*
     * Main block.
     */
    ctx.fillStyle =
      block.color;

    ctx.fillRect(
      block.x,
      block.y,
      block.width,
      block.height,
    );

    /*
     * Small highlight.
     */
    ctx.fillStyle =
      "rgba(255, 255, 255, 0.18)";

    ctx.fillRect(
      block.x,
      block.y,
      block.width,
      2,
    );
  }

  drawPowerUp(powerUp) {
    const {
      ctx,
    } = this;

    const style =
      POWER_UP_TYPES[
        powerUp.type
      ];

    ctx.beginPath();

    ctx.fillStyle =
      style.color;

    ctx.arc(
      powerUp.x,
      powerUp.y,
      powerUp.radius,
      0,
      Math.PI * 2,
    );

    ctx.fill();

    ctx.lineWidth = 2;

    ctx.strokeStyle =
      "rgba(255, 255, 255, 0.85)";

    ctx.stroke();

    ctx.fillStyle =
      "#ffffff";

    ctx.textAlign =
      "center";

    ctx.textBaseline =
      "middle";

    ctx.font =
      `bold ${Math.round(powerUp.radius * 1.3)}px Segoe UI, sans-serif`;

    ctx.fillText(
      style.symbol,
      powerUp.x,
      powerUp.y + 1,
    );
  }

  drawLevelPause() {
    const {
      ctx,
      config,
    } = this;

    const elapsed =
      performance.now() -
      this.levelPauseStartedAt;

    const remaining =
      Math.max(
        0,
        Math.ceil(
          (
            this.config.levelPauseMs -
            elapsed
          ) / 1000,
        ),
      );

    /*
     * Dark transparent overlay.
     */
    ctx.fillStyle =
      "rgba(8, 12, 24, 0.72)";

    ctx.fillRect(
      0,
      0,
      config.canvasWidth,
      config.canvasHeight,
    );

    ctx.textAlign =
      "center";

    ctx.textBaseline =
      "middle";

    /*
     * Level complete.
     */
    ctx.fillStyle =
      "#7cf0c3";

    ctx.font =
      "bold 42px Segoe UI, sans-serif";

    ctx.fillText(
      `Level ${this.level} Complete`,
      config.canvasWidth / 2,
      config.canvasHeight / 2 -
        30,
    );

    /*
     * Next level.
     */
    ctx.fillStyle =
      "#e8eefc";

    ctx.font =
      "bold 24px Segoe UI, sans-serif";

    ctx.fillText(
      `Level ${this.level + 1} in ${remaining}`,
      config.canvasWidth / 2,
      config.canvasHeight / 2 +
        30,
    );
  }

  /*
   * -------------------------
   * GAME OVER
   * -------------------------
   */

  finish() {
    this.stop();

    this.draw();

    sounds.gameOver();

    this.onGameOver?.(
      this.score,
      this.level,
    );
  }
}