'use strict';

// ── Constants ──────────────────────────────────────────────────────────────

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const SKIN_DEFS = {
  retro:  { label: 'Retro',  colors: [null,'#4dd0e1','#ffd54f','#ba68c8','#81c784','#e57373','#90caf9','#ffb74d','#b0bec5'] },
  neon:   { label: 'Neon',   colors: [null,'#00e5ff','#ffea00','#e040fb','#69f0ae','#ff1744','#2979ff','#ff9100','#90a4ae'] },
  pastel: { label: 'Pastel', colors: [null,'#b3e5fc','#fff9c4','#e1bee7','#c8e6c9','#ffcdd2','#bbdefb','#ffe0b2','#cfd8dc'] },
  pixel:  { label: 'Pixel',  colors: [null,'#4dd0e1','#ffd54f','#ba68c8','#81c784','#e57373','#90caf9','#ffb74d','#b0bec5'] },
};

const THEME_KEY      = 'tetris-theme';
const RECORDS_KEY    = 'tetris-records';
const SKIN_KEY       = 'tetris-skin';
const START_LEVEL_KEY = 'tetris-start-level';

// ── DOM refs ───────────────────────────────────────────────────────────────

const canvas       = document.getElementById('board');
const ctx          = canvas.getContext('2d');
const nextCanvas   = document.getElementById('next-canvas');
const nextCtx      = nextCanvas.getContext('2d');
const scoreEl      = document.getElementById('score');
const linesEl      = document.getElementById('lines');
const levelEl      = document.getElementById('level');
const themeToggle  = document.getElementById('theme-toggle');

const startScreen     = document.getElementById('start-screen');
const pauseOverlay    = document.getElementById('pause-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const controlsPanel   = document.getElementById('controls-panel');
const gameoverScoreEl = document.getElementById('gameover-score');
const nameEntry       = document.getElementById('name-entry');
const playerNameInput = document.getElementById('player-name');

// ── Game state ─────────────────────────────────────────────────────────────

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, gridColor;
let started          = false;
let combo            = 0;
let sessionBestCombo = 0;
let startLevel       = 1;
let currentSkin      = 'retro';
let pendingScore     = null;

// ── Theme ──────────────────────────────────────────────────────────────────

function setTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  themeToggle.checked = theme === 'light';
  localStorage.setItem(THEME_KEY, theme);
  gridColor = getComputedStyle(document.body).getPropertyValue('--grid-color').trim();
}

// ── Records helpers ────────────────────────────────────────────────────────

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(RECORDS_KEY)) || { scores: [], bestCombo: 0, maxLines: 0 };
  } catch {
    return { scores: [], bestCombo: 0, maxLines: 0 };
  }
}

function saveRecords(rec) {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(rec));
}

function qualifiesForTop5(s) {
  if (!s) return false;
  const rec = loadRecords();
  return rec.scores.length < 5 || s > (rec.scores[rec.scores.length - 1]?.score ?? 0);
}

function addScore(name, s, linesCount) {
  const rec = loadRecords();
  rec.scores.push({ name: (name.trim() || 'Anónimo'), score: s, lines: linesCount });
  rec.scores.sort((a, b) => b.score - a.score);
  rec.scores = rec.scores.slice(0, 5);
  saveRecords(rec);
}

function updateSessionStats() {
  const rec = loadRecords();
  let changed = false;
  if (sessionBestCombo > rec.bestCombo) { rec.bestCombo = sessionBestCombo; changed = true; }
  if (lines > rec.maxLines) { rec.maxLines = lines; changed = true; }
  if (changed) saveRecords(rec);
}

function resetRecords() {
  localStorage.removeItem(RECORDS_KEY);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderRecordsTable(containerId, highlightScore) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rec = loadRecords();

  if (rec.scores.length === 0 && rec.bestCombo === 0 && rec.maxLines === 0) {
    container.innerHTML = '<p class="no-records">Sin récords todavía</p>';
    return;
  }

  let html = '<table class="records-table"><thead><tr><th>#</th><th>NOMBRE</th><th>SCORE</th><th>LÍNEAS</th></tr></thead><tbody>';

  if (rec.scores.length === 0) {
    html += '<tr><td colspan="4" class="no-records">—</td></tr>';
  } else {
    rec.scores.forEach((entry, i) => {
      const hi = highlightScore !== undefined && entry.score === highlightScore;
      html += `<tr${hi ? ' class="highlight"' : ''}><td>${i + 1}</td><td>${escapeHtml(entry.name)}</td><td>${entry.score.toLocaleString()}</td><td>${entry.lines}</td></tr>`;
    });
  }

  html += '</tbody></table>';
  html += `<div class="records-stats"><span>Mejor combo: <strong>${rec.bestCombo}</strong></span><span>Máx. líneas: <strong>${rec.maxLines}</strong></span></div>`;
  container.innerHTML = html;
}

// ── Skin helpers ───────────────────────────────────────────────────────────

function setSkin(name) {
  currentSkin = name;
  localStorage.setItem(SKIN_KEY, name);
  document.querySelectorAll('.skin-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.skin === name);
  });
  if (started && !gameOver) draw();
}

// ── Pickers ────────────────────────────────────────────────────────────────

function setStartLevel(lvl) {
  startLevel = lvl;
  localStorage.setItem(START_LEVEL_KEY, lvl);
  document.querySelectorAll('.level-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.level) === lvl);
  });
}

function buildLevelPicker(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.className = 'level-btn' + (i === startLevel ? ' active' : '');
    btn.textContent = i;
    btn.dataset.level = i;
    btn.addEventListener('click', () => setStartLevel(i));
    container.appendChild(btn);
  }
}

function buildSkinPicker(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  Object.entries(SKIN_DEFS).forEach(([key, def]) => {
    const btn = document.createElement('button');
    btn.className = 'skin-btn' + (key === currentSkin ? ' active' : '');
    btn.textContent = def.label;
    btn.dataset.skin = key;
    btn.addEventListener('click', () => setSkin(key));
    container.appendChild(btn);
  });
}

// ── Overlay management ─────────────────────────────────────────────────────

function hideAllOverlays() {
  startScreen.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
}

function showStartScreen() {
  hideAllOverlays();
  renderRecordsTable('records-start');
  buildLevelPicker('level-picker-start');
  buildSkinPicker('skin-picker-start');
  startScreen.classList.remove('hidden');
}

function showPauseOverlay() {
  hideAllOverlays();
  controlsPanel.classList.add('hidden');
  buildLevelPicker('level-picker-pause');
  pauseOverlay.classList.remove('hidden');
}

function showGameoverOverlay() {
  hideAllOverlays();
  gameoverScoreEl.textContent = `Puntuación: ${score.toLocaleString()} · Líneas: ${lines} · Combo máx: ${sessionBestCombo}`;

  if (qualifiesForTop5(score)) {
    pendingScore = score;
    nameEntry.classList.remove('hidden');
    playerNameInput.value = '';
    setTimeout(() => playerNameInput.focus(), 50);
  } else {
    pendingScore = null;
    nameEntry.classList.add('hidden');
    renderRecordsTable('records-gameover');
  }

  gameoverOverlay.classList.remove('hidden');
}

// ── Board helpers ──────────────────────────────────────────────────────────

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const cleared = clearLines();
  if (cleared > 0) {
    combo++;
    if (combo > sessionBestCombo) sessionBestCombo = combo;
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

// ── HUD ────────────────────────────────────────────────────────────────────

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ── Drawing ────────────────────────────────────────────────────────────────

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = SKIN_DEFS[currentSkin].colors[colorIndex];
  context.globalAlpha = alpha ?? 1;

  if (currentSkin === 'neon') {
    const a = alpha ?? 1;
    context.shadowBlur = 14 * a;
    context.shadowColor = color;
    context.fillStyle = color;
    context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
    context.shadowBlur = 0;
    context.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
    context.lineWidth = 1;
    context.strokeRect(x * size + 2.5, y * size + 2.5, size - 5, size - 5);

  } else if (currentSkin === 'pastel') {
    context.fillStyle = color;
    if (context.roundRect) {
      context.beginPath();
      context.roundRect(x * size + 2, y * size + 2, size - 4, size - 4, 6);
      context.fill();
    } else {
      context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
    }
    context.fillStyle = 'rgba(255,255,255,0.4)';
    context.fillRect(x * size + 4, y * size + 4, size - 8, 4);

  } else if (currentSkin === 'pixel') {
    context.fillStyle = color;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    const px = 5;
    for (let pr = 0; pr < size - 2; pr += px) {
      for (let pc = 0; pc < size - 2; pc += px) {
        if ((Math.floor(pr / px) + Math.floor(pc / px)) % 2 === 0) {
          context.fillStyle = 'rgba(0,0,0,0.18)';
          context.fillRect(
            x * size + 1 + pc, y * size + 1 + pr,
            Math.min(px, size - 2 - pc), Math.min(px, size - 2 - pr)
          );
        }
      }
    }
    context.fillStyle = 'rgba(0,0,0,0.45)';
    context.fillRect(x * size + 1, y * size + 1, size - 2, 1);
    context.fillRect(x * size + 1, y * size + 1, 1, size - 2);
    context.fillStyle = 'rgba(255,255,255,0.2)';
    context.fillRect(x * size + 1, y * size + size - 2, size - 2, 1);
    context.fillRect(x * size + size - 2, y * size + 1, 1, size - 2);

  } else {
    // retro
    context.fillStyle = color;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  }

  context.globalAlpha = 1;
  context.shadowBlur = 0;
}

function drawGrid() {
  ctx.strokeStyle = currentSkin === 'neon' ? '#002233' : gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  if (currentSkin === 'neon') {
    ctx.fillStyle = '#000814';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  drawGrid();

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  if (currentSkin === 'neon') {
    nextCtx.fillStyle = '#000814';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  } else {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  }
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// ── Game lifecycle ─────────────────────────────────────────────────────────

function startGame() {
  board            = createBoard();
  score            = 0;
  lines            = 0;
  level            = startLevel;
  paused           = false;
  gameOver         = false;
  started          = true;
  combo            = 0;
  sessionBestCombo = 0;
  dropInterval     = Math.max(100, 1000 - (startLevel - 1) * 90);
  dropAccum        = 0;
  lastTime         = performance.now();
  next             = randomPiece();
  spawn();
  updateHUD();
  hideAllOverlays();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  updateSessionStats();
  showGameoverOverlay();
}

function togglePause() {
  if (gameOver || !started) return;
  paused = !paused;
  if (!paused) {
    hideAllOverlays();
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  } else {
    cancelAnimationFrame(animId);
    showPauseOverlay();
  }
}

// ── Game loop ──────────────────────────────────────────────────────────────

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (!gameOver) draw();
  if (!gameOver && !paused) animId = requestAnimationFrame(loop);
}

// ── Event listeners ────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (document.activeElement === playerNameInput) return;
    e.preventDefault();
    togglePause();
    return;
  }
  if (!started || paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

// Start screen
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('reset-records-btn').addEventListener('click', () => {
  resetRecords();
  renderRecordsTable('records-start');
});

// Pause overlay
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('controls-btn').addEventListener('click', () => {
  controlsPanel.classList.toggle('hidden');
});

// Game over overlay
document.getElementById('gameover-restart-btn').addEventListener('click', startGame);
document.getElementById('goto-start-btn').addEventListener('click', showStartScreen);
document.getElementById('save-score-btn').addEventListener('click', () => {
  addScore(playerNameInput.value, pendingScore ?? score, lines);
  pendingScore = null;
  nameEntry.classList.add('hidden');
  renderRecordsTable('records-gameover', score);
});
playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') document.getElementById('save-score-btn').click();
});

// Theme toggle
themeToggle.addEventListener('change', () => {
  setTheme(themeToggle.checked ? 'light' : 'dark');
});

// ── Boot ───────────────────────────────────────────────────────────────────

currentSkin = localStorage.getItem(SKIN_KEY) || 'retro';
startLevel  = parseInt(localStorage.getItem(START_LEVEL_KEY)) || 1;
setTheme(localStorage.getItem(THEME_KEY) || 'dark');
showStartScreen();
