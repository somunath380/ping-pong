import { sounds } from "../audio.js";

const PADDLE_BOTTOM_GAP = 18;
const BALL_COLORS = ["#7cf0c3", "#7cc4ff", "#f0c37c"];

function randomDirection(speed) {
  const angle = (Math.random() * Math.PI) / 2 + Math.PI / 4;
  const heading = Math.random() < 0.5 ? -1 : 1;
  return {
    vx: Math.cos(angle) * speed * heading,
    vy: -Math.abs(Math.sin(angle) * speed),
  };
}

export class ClassicGame {
  constructor(canvas, config, { onGameOver, onScore } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = config;
    this.onGameOver = onGameOver;
    this.onScore = onScore;
    this.pressed = new Set();
    this.running = false;
    this.paused = false;
    this.pausedAt = 0;
    this.frameId = null;
    this.score = 0;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.loop = this.loop.bind(this);
  }

  resetBoard(movingBall) {
    this.canvas.width = this.config.canvasWidth;
    this.canvas.height = this.config.canvasHeight;
    this.paddle = {
      width: this.config.paddleWidth,
      height: this.config.paddleHeight,
      x: (this.config.canvasWidth - this.config.paddleWidth) / 2,
      y: this.config.canvasHeight - this.config.paddleHeight - PADDLE_BOTTOM_GAP,
    };
    this.balls = [movingBall ? this.createBall() : this.createIdleBall()];
    this.targetX = null;
  }

  showIdle() {
    this.stop();
    this.resetBoard(false);
    this.draw();
  }

  start() {
    this.stop();
    this.resetBoard(true);
    this.spawnedSecond = false;
    this.spawnedThird = false;
    this.startedAt = performance.now();
    this.score = 0;
    this.resetScoreWindow(this.startedAt);
    this.running = true;
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    this.frameId = requestAnimationFrame(this.loop);
  }

  pause() {
    if (!this.running || this.paused) {
      return;
    }
    this.paused = true;
    this.pausedAt = performance.now();
    this.pressed.clear();
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  resume() {
    if (!this.running || !this.paused) {
      return;
    }
    // Shift timers so time spent paused doesn't count toward ball spawns or the score window.
    const pausedFor = performance.now() - this.pausedAt;
    this.startedAt += pausedFor;
    this.scoreWindowStart += pausedFor;
    this.paused = false;
    this.pressed.clear();
    this.frameId = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    this.paused = false;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.pressed.clear();
  }

  createIdleBall() {
    return {
      x: this.config.canvasWidth / 2,
      y: this.config.canvasHeight / 2,
      vx: 0,
      vy: 0,
    };
  }

  createBall() {
    const { vx, vy } = randomDirection(this.config.ballSpeed);
    return {
      ...this.createIdleBall(),
      vx,
      vy,
    };
  }

  handleKeyDown(event) {
    if (event.key === this.config.keyLeft || event.key === this.config.keyRight) {
      event.preventDefault();
      if (this.paused) {
        return;
      }
      this.pressed.add(event.key);
    }
  }

  handleKeyUp(event) {
    this.pressed.delete(event.key);
  }

  setMoving(direction, isPressed) {
    if (!this.running || this.paused) {
      return;
    }
    const key = direction === "left" ? this.config.keyLeft : this.config.keyRight;
    if (isPressed) {
      this.pressed.add(key);
    } else {
      this.pressed.delete(key);
    }
  }

  // x is the desired paddle centre in canvas pixels (used by mouse and touch controls).
  setPaddleTarget(x) {
    if (!this.running || this.paused) {
      return;
    }
    this.targetX = x;
  }

  loop() {
    if (!this.running || this.paused) {
      return;
    }

    this.update();
    this.draw();
    if (this.running) {
      this.frameId = requestAnimationFrame(this.loop);
    }
  }

  update() {
    this.movePaddle();
    this.spawnExtraBalls();

    for (const ball of this.balls) {
      ball.x += ball.vx;
      ball.y += ball.vy;
      this.bounceOffWalls(ball);
      this.bounceOffPaddle(ball);
    }

    const remaining = [];
    let missed = false;
    for (const ball of this.balls) {
      if (ball.y - this.config.ballRadius > this.config.canvasHeight) {
        if (!this.handleMiss()) {
          return;
        }
        missed = true;
        remaining.push(this.createBall());
      } else {
        remaining.push(ball);
      }
    }
    this.balls = remaining;
    if (missed) {
      this.resetScoreWindow();
    } else {
      this.checkScoreWindow();
    }
  }

  resetScoreWindow(now = performance.now()) {
    this.scoreWindowStart = now;
    this.scoreWindowBalls = new Set(this.balls);
    this.hitThisWindow = new Set();
  }

  checkScoreWindow() {
    const now = performance.now();
    if (now - this.scoreWindowStart < this.config.scoreWindowMs) {
      return;
    }

    const required = [...this.scoreWindowBalls].filter((ball) => this.balls.includes(ball));
    const allTackled =
      required.length > 0 && required.every((ball) => this.hitThisWindow.has(ball));

    if (allTackled) {
      this.score += 1;
      sounds.score();
      this.onScore?.(this.score);
    }

    this.resetScoreWindow(now);
  }

  movePaddle() {
    if (this.pressed.size > 0) {
      this.targetX = null;
    }
    if (this.pressed.has(this.config.keyLeft)) {
      this.paddle.x -= this.config.paddleSpeed;
    }
    if (this.pressed.has(this.config.keyRight)) {
      this.paddle.x += this.config.paddleSpeed;
    }
    if (this.targetX !== null) {
      this.paddle.x = this.targetX - this.paddle.width / 2;
    }
    this.paddle.x = Math.max(
      0,
      Math.min(this.config.canvasWidth - this.paddle.width, this.paddle.x),
    );
  }

  spawnExtraBalls() {
    const elapsed = performance.now() - this.startedAt;
    if (!this.spawnedSecond && elapsed >= this.config.ball2DelayMs) {
      this.balls.push(this.createBall());
      this.spawnedSecond = true;
      sounds.newBall();
    }
    if (!this.spawnedThird && elapsed >= this.config.ball3DelayMs) {
      this.balls.push(this.createBall());
      this.spawnedThird = true;
      sounds.newBall();
    }
  }

  bounceOffWalls(ball) {
    const r = this.config.ballRadius;
    if (ball.x - r <= 0) {
      ball.x = r;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x + r >= this.config.canvasWidth) {
      ball.x = this.config.canvasWidth - r;
      ball.vx = -Math.abs(ball.vx);
    }

    if (ball.y - r <= 0) {
      ball.y = r;
      ball.vy = Math.abs(ball.vy);
    }
  }

  bounceOffPaddle(ball) {
    if (ball.vy <= 0) {
      return;
    }

    const r = this.config.ballRadius;
    const hitX = ball.x + r >= this.paddle.x && ball.x - r <= this.paddle.x + this.paddle.width;
    const hitY = ball.y + r >= this.paddle.y && ball.y - r <= this.paddle.y + this.paddle.height;
    if (!hitX || !hitY) {
      return;
    }

    ball.y = this.paddle.y - r;
    ball.vy = -Math.abs(ball.vy);
    this.hitThisWindow.add(ball);
    sounds.paddleHit();

    const paddleCenter = this.paddle.x + this.paddle.width / 2;
    const offset = (ball.x - paddleCenter) / (this.paddle.width / 2);
    ball.vx += offset * this.config.ballSpeed * 0.45;

    const maxSpeed = this.config.ballSpeed * 1.6;
    ball.vx = Math.max(-maxSpeed, Math.min(maxSpeed, ball.vx));
  }

  handleMiss() {
    const nextWidth = this.paddle.width - this.config.paddleShrink;
    if (nextWidth < this.config.paddleMinWidth) {
      this.finish();
      return false;
    }

    const center = this.paddle.x + this.paddle.width / 2;
    this.paddle.width = nextWidth;
    this.paddle.x = Math.max(
      0,
      Math.min(this.config.canvasWidth - this.paddle.width, center - this.paddle.width / 2),
    );
    sounds.miss();
    return true;
  }

  finish() {
    this.stop();
    this.draw();
    sounds.gameOver();
    this.onGameOver?.(this.score);
  }

  draw() {
    const { ctx, config } = this;
    ctx.clearRect(0, 0, config.canvasWidth, config.canvasHeight);

    ctx.fillStyle = "#1a2440";
    ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);

    ctx.strokeStyle = "#2c3b66";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, config.canvasHeight / 2);
    ctx.lineTo(config.canvasWidth, config.canvasHeight / 2);
    ctx.stroke();

    ctx.fillStyle = "#e8eefc";
    ctx.fillRect(this.paddle.x, this.paddle.y, this.paddle.width, this.paddle.height);

    this.balls.forEach((ball, index) => {
      ctx.beginPath();
      ctx.fillStyle = BALL_COLORS[index % BALL_COLORS.length];
      ctx.arc(ball.x, ball.y, config.ballRadius, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
