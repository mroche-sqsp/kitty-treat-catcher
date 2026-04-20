// @ts-check
/**
 * Kitty Treat Catcher - a tiny vanilla-canvas game intended to be embedded
 * via iframe. Posts the following messages to `window.parent` so the host
 * page can react to gameplay events:
 *
 *   { type: 'STARTED' }              - first player input
 *   { type: 'GOAL_REACHED', score }  - hit the treat goal
 *   { type: 'ENDED', score }         - (unused here - the game is always winnable)
 *
 * Accepts an optional `?rewardCode=XYZ` query parameter which is displayed
 * on the in-game win screen (useful for standalone embeds where the host
 * page does not render its own reward overlay). For backward compatibility
 * with older host pages, `?discountCode=XYZ` is also accepted.
 */

const LOGICAL_WIDTH = 960;
const LOGICAL_HEIGHT = 540;
const TREAT_GOAL = 10;
const CAT_SPEED = 520;
const FISH_SPAWN_MS_START = 900;
const FISH_SPAWN_MS_MIN = 520;
const FALL_SPEED_MIN = 200;
const FALL_SPEED_MAX = 320;
const YARN_RATIO = 0.25;

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const hudScore = /** @type {HTMLElement} */ (document.getElementById('score'));
const hudTimer = /** @type {HTMLElement} */ (document.getElementById('timer'));
const startScreen = /** @type {HTMLElement} */ (document.getElementById('startScreen'));
const winScreen = /** @type {HTMLElement} */ (document.getElementById('winScreen'));
const winMessage = /** @type {HTMLElement} */ (document.getElementById('winMessage'));
const winReward = /** @type {HTMLElement} */ (document.getElementById('winReward'));
const startButton = /** @type {HTMLButtonElement} */ (document.getElementById('startButton'));
const restartButton = /** @type {HTMLButtonElement} */ (document.getElementById('restartButton'));

const params = new URLSearchParams(window.location.search);
// Prefer the new `?rewardCode=` query param; fall back to legacy `?discountCode=`.
const rewardCode = params.get('rewardCode') || params.get('discountCode') || '';

/** @type {'idle' | 'playing' | 'won'} */
let state = 'idle';
let hasAnnouncedStart = false;

const cat = {
  x: LOGICAL_WIDTH / 2,
  y: LOGICAL_HEIGHT - 90,
  w: 96,
  h: 96,
};

/** @typedef {{ x: number, y: number, vy: number, kind: 'fish' | 'yarn', size: number, wobble: number }} Faller */
/** @type {Faller[]} */
let fallers = [];

let score = 0;
let elapsed = 0;
let spawnTimer = 0;
let lastFrame = 0;

const keys = {
  left: false,
  right: false,
};

let pointerX = /** @type {number | null} */ (null);

function sendMessage(type, extra = {}) {
  if (window.parent === window) {
    return;
  }
  try {
    window.parent.postMessage({ type, ...extra }, '*');
  } catch {
    // Best-effort: embedding contexts may reject structured-clone of extras.
  }
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(
    canvas.width / LOGICAL_WIDTH,
    0,
    0,
    canvas.height / LOGICAL_HEIGHT,
    0,
    0
  );
}

function reset() {
  fallers = [];
  score = 0;
  elapsed = 0;
  spawnTimer = 0;
  cat.x = LOGICAL_WIDTH / 2;
  hasAnnouncedStart = false;
  updateHud();
}

function updateHud() {
  hudScore.textContent = `${score} / ${TREAT_GOAL}`;
  hudTimer.textContent = `${elapsed.toFixed(1)}s`;
}

function currentSpawnInterval() {
  const progress = Math.min(1, score / TREAT_GOAL);
  return FISH_SPAWN_MS_START + (FISH_SPAWN_MS_MIN - FISH_SPAWN_MS_START) * progress;
}

function spawnFaller() {
  const kind = Math.random() < YARN_RATIO ? 'yarn' : 'fish';
  const size = kind === 'fish' ? 54 : 46;
  fallers.push({
    x: 40 + Math.random() * (LOGICAL_WIDTH - 80),
    y: -size,
    vy: FALL_SPEED_MIN + Math.random() * (FALL_SPEED_MAX - FALL_SPEED_MIN),
    kind,
    size,
    wobble: Math.random() * Math.PI * 2,
  });
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function announceStart() {
  if (hasAnnouncedStart) {
    return;
  }
  hasAnnouncedStart = true;
  sendMessage('STARTED');
}

function handleCatch(faller) {
  if (faller.kind === 'fish') {
    score += 1;
    updateHud();
    if (score >= TREAT_GOAL) {
      win();
    }
  }
}

function win() {
  state = 'won';
  winMessage.textContent = `You caught ${TREAT_GOAL} fish in ${elapsed.toFixed(1)} seconds.`;
  if (rewardCode) {
    winReward.textContent = rewardCode;
    winReward.hidden = false;
  } else {
    winReward.hidden = true;
  }
  winScreen.hidden = false;
  sendMessage('GOAL_REACHED', { score });
}

function startGame() {
  reset();
  startScreen.hidden = true;
  winScreen.hidden = true;
  state = 'playing';
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

function update(dt) {
  elapsed += dt;

  let dir = 0;
  if (keys.left) dir -= 1;
  if (keys.right) dir += 1;

  if (dir !== 0) {
    announceStart();
    cat.x += dir * CAT_SPEED * dt;
  }

  if (pointerX !== null) {
    announceStart();
    // Direct 1:1 tracking: the cat lives under the finger. This feels far
    // better on touch than smoothing toward the pointer (which feels laggy).
    cat.x = pointerX;
  }

  cat.x = Math.max(cat.w / 2, Math.min(LOGICAL_WIDTH - cat.w / 2, cat.x));

  spawnTimer += dt * 1000;
  if (spawnTimer >= currentSpawnInterval()) {
    spawnTimer = 0;
    spawnFaller();
  }

  const catBox = {
    x: cat.x - cat.w * 0.35,
    y: cat.y - cat.h * 0.2,
    w: cat.w * 0.7,
    h: cat.h * 0.5,
  };

  fallers = fallers.filter((f) => {
    f.y += f.vy * dt;
    f.wobble += dt * 3;

    const fx = f.x - f.size / 2;
    const fy = f.y - f.size / 2;
    if (rectsOverlap(catBox.x, catBox.y, catBox.w, catBox.h, fx, fy, f.size, f.size)) {
      handleCatch(f);
      return false;
    }

    return f.y < LOGICAL_HEIGHT + f.size;
  });

  updateHud();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
  gradient.addColorStop(0, '#1e293b');
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  for (let i = 0; i < 40; i += 1) {
    const x = (i * 97 + (elapsed * 10) % LOGICAL_WIDTH) % LOGICAL_WIDTH;
    const y = ((i * 53) % LOGICAL_HEIGHT + elapsed * 20) % LOGICAL_HEIGHT;
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
  ctx.fillRect(0, LOGICAL_HEIGHT - 40, LOGICAL_WIDTH, 40);
}

function drawEmoji(emoji, x, y, size) {
  ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, y);
}

function drawCat() {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  drawEmoji('🐱', cat.x, cat.y, cat.w);
  ctx.restore();
}

function drawFallers() {
  for (const f of fallers) {
    const emoji = f.kind === 'fish' ? '🐟' : '🧶';
    const wobbleX = f.x + Math.sin(f.wobble) * 6;
    drawEmoji(emoji, wobbleX, f.y, f.size);
  }
}

function render() {
  drawBackground();
  drawFallers();
  drawCat();
}

function loop(now) {
  if (state !== 'playing') {
    return;
  }
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function attachInput() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if (e.key === ' ' && state === 'idle') startGame();
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  const pointerToLogicalX = (clientX) => {
    const rect = canvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(1, ratio)) * LOGICAL_WIDTH;
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    pointerX = pointerToLogicalX(e.clientX);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pointerX === null) return;
    pointerX = pointerToLogicalX(e.clientX);
  });

  const endPointer = (e) => {
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    pointerX = null;
  };

  // Note: no `pointerleave` listener — pointer capture keeps events flowing
  // to the canvas even when the finger drags outside its bounds, and ending
  // the drag on leave makes touch input feel broken.
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
}

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
attachInput();

if (rewardCode) {
  winMessage.textContent = `Win to reveal your reward code.`;
}
