const T = 20;
const COLS = 19, ROWS =21;
const W = COLS * T, H = ROWS * T;
const TUNNEL_ROW = 9;

// # wall   . pellet   o power pellet   - ghost door   P Pac-Man start
const MAP = [
  "###################",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.### # ###.####",
  "   #.#       #.#   ",
  "####.# ##-## #.####",
  "    .  #   #  .    ",
  "####.# ##### #.####",
  "   #.#       #.#   ",
  "####.# ##### #.####",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#o.#.....P.....#.o#",
  "##.#.#.#####.#.#.##",
  "#....#...#...#....#",
  "#.######.#.######.#",
  "#.................#",
  "###################"
];
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ORDER = [[0, -1], [-1, 0], [0, 1], [1, 0]]; // up, left, right, down
 let grid, wallLayer, pelletsLeft;
 let pac,ghosts;
 let score = 0, lives = 3, level = 1, high = 0;
 let mode = "ready", modeTimer = 90;    
//  ready | play | dying | over | win
let frame = 0, phaseTimer = 0, frightTimer = 0, eatCombo = 0;

try{ high = parseInt(localStorage.getItem("pacHigh")) || 0; } catch (e) {}

// map
function tile(tx, ty) {
  if (tx < 0 || tx >= COLS) return ty === TUNNEL_ROW ? " " : "#"
  return grid[ty][tx];
}
function blocked(tx, ty, canUseDoor) {
  const c = tile(tx, ty);
  return c ==="#" || (c === "-" && !canUseDoor);
}
function inBounds (x, y) { return x >= 0 && x < COLS && y >= 0 && y <ROWS; }
function atCenter(e) {
  return((e.x % T) + T) % T === T / 2 && ((e.y % T) + T) % T === T /2;
}
function wrap(e) {
  if (e.dx < 0 && e.x <= -T / 2) e.x += (COLS + 1) * T;
  else if (e.dx > 0 && e.x >= COLS * T + T / 2) e.x -= (COLS +1) * T;
}

function buildMap() {
  grid = MAP.map(r => r.split(""));
  pelletsLeft = 0;
  for (let y =0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
  if (grid[y][x] === "p") grid[y][x] = " ";
  if (grid[y][x] === "." || grid[y][x] ==="o")
    pelletsLeft++;
}
renderwalls();
}

// walls never change, so draw them once to an offscreen canvas
function renderwalls() {
  wallLayer = document.createElement("canvas");
  wallLayer.width = W; wallLayer.height = H;
  const c = wallLayer.getContext("2d");
  c.lineCap = "round"; c.lineWidth = 2; c.strokeStyle = "#2a3cff";
  const open = (x, y) => {
    if (y < 0 || y >= ROWS) return false;
    if (x < 0 || x >= COLS) return true;
    return MAP[y][x] !== "#";
  };
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      if (MAP[y][x] !=="#") continue;
      const x0 = x * T, y0 = y * T;
      c.fillStyle = "#06061f"; c.fillRect(x0, y0, T, T);
      c.beginPath();
      if (open(x, y - 1)) { c.moveTo(x0, y0);      c.lineTo(x0 + T, y0); }
      if (open(x, y + 1)) { c.moveTo(x0, y0 + T);      c.lineTo(x0 + T, y0 + T); }
      if (open(x - 1, y)) { c.moveTo(x0, y0);      c.lineTo(x0, y0 + T); }
      if (open(x + 1, y)) { c.moveTo(x0 + T, y0);      c.lineTo(x0 + T, y0 + T); }
      c.stroke();
  }
  c.fillStyle = "#ffb8ff"; c.fillRect(9 * T, 8 * T + 8, T, 4);  // ghost door
}

// *-------------actors------------*
function resetActors() {
  pac = { x: 9 * T + T / 2, y: 15 * T + T /2, dx:
    0, dy: 0, nx: 0, ny: 0, ldx: -1, ldy: 0 };
    const defs =[
      { name: "blinky", color: "#ff0000", sx: 9, sy:7, home: [17, 0], release: 0},
      { name: "pinky", color: "#ffb8ff", sx: 9, sy:9, home: [1, 0], release: 60},
      { name: "inky", color: "#00ffff", sx: 8, sy:9, home: [17, 20], release: 240},
      { name: "clyde", color: "#ffb851", sx: 10, sy:9, home: [1, 20], release: 420},
    ];
    ghosts = defs.map((d, i) => ({
      name: d.name, color: d.color, home: d.home,
      x: d.sx * T + T / 2, y: d.sy * T + T / 2, dx: i === 0 ? -1 : 0, dy: 0,
      state: i === 0 ? "normal" : "house",
      // house | leaving | normal | eaten
      timer: d.release, scared: false
    }));
    frightTimer = 0; phaseTimer = 0; eatCombo = 0;
}

function newGame() {
  score = 0; lives = 3, level = 1;
  buildMap(); resetActors();
  mode = "ready"; modeTimer = 90;
}

/*----------pac-man--------*/ 
function updatePac() {
  // reversing is allowed at any time
  if ((pac.dx || pac.dy) && pac.nx === -pac.dx && pac.ny === -pac.dy) {
    pac.dx = pac.nx; pac.dy = pac.ny;
  }
  if (atCenter(pac)) {
    const  tx = Math.floor(pac.x / T), ty = Math.floor(pac.y / T);
    const c = tile(tx, ty);
    if (c === ".") { grid[ty][tx] = " "; score += 10; pelletsLeft--; }
    else if (c === "o") {
      grid[ty][tx] = " "; score += 50;
      pelletsLeft--;
      frightTimer = 420; eatCombo = 0;
      ghosts.forEach(g => {
        if (g.state === "normal") {g.scared = true; g.dx = -g.dx; g.dy = -g.dy}
      });
    }
    if ((pac.nx || pac.ny) && !blocked(tx + pac.nx, ty + pac.ny, false)) {pac.dx = pac.nx; pac.dy = pac.ny; 
    }
    if (blocked(tx + pac.dx, ty + pac.dy, false)) {
      pac.dx = 0; pac.dy = 0 }
  }
  pac.x += pac.dx * 2; pac.y += pac.dy * 2;
  if (pac.dx || pac.dy) { pac.ldx = pac.dx; pac.ldy = pac.dy; }
  wrap(pac);
}

/* -------------ghosts------------*/ 
function bfsDir(sx,sy, gx, gy,door) {
  if (sx === gx && sy === gy) return [0, 0];
  const seen = new Set([sx + "," + sy]);
  const q = [];
  for (const d of ORDER) {
    const nx = sx + d[0], ny =sy + d[1];
    if (inBounds(nx, ny) && !blocked(nx, ny, door))
    { seen.add(nx + "," + ny); q.push ([nx, ny, d]); }
  }
  for (let i = 0; i < q.length; i++) {
    const [x, y, d0] = q[i];
    if (x === gx && y === gy) return d0;
    for (const d of ORDER) {
      const nx = x + d[0], ny = y + d[1], k = nx + "," + ny;
       if (inBounds (nx, ny) && !seen.has(k) && !blocked(nx, ny, door)){ seen.add(k); q.push ([nx, ny, d0]); }
    }
  }
  return [0, 0];
}

function chaseTarget(g) {
  const scatter = phaseTimer < 420 || (phaseTimer >= 1620 && phaseTimer < 1920);
  if (scatter) return g.home;
  const px = Math.floor(pac.x / T), py = Math.floor(pac.y / T);
  switch (g.name) {
    case "blinky": return [px, py];
    case "pinky": return [px + 4 * pac.ldx, py + 4 * pac.ldy];
    case "inky": {
      const b = ghosts[0];
      const ax = px + 2 * pac.ldx, ay = py + 2 * pac.ldy;
      return [2 * ax - Math.floor(b.x / T), 2 * ay - Math.floor(b.y / T)]; 
    }
    default: { //clyde
      const gx = Math.floor(g.x / T), gy = Math.floor(g.y / T);
    return Math.hypot(gx - px, gy - py) > 8 ? [px, py] : g.home;
   }
 }
}
 function chooseDir(g) { 
  const tx = Math.floor(g.x / T), ty = Math.floor(g.y / T);
  if (g.state === "leaving" && tx === 9 && ty === 7) g.state = "normal";
  if (g.state === "eaten" && tx === 9 && ty === 9) {g.state = "leaving"; g.scared = false; }
  
  if (g.state === "eaten") { [g.dx, g.dy] = bfsDir(tx, ty, 9, 9, true);
    return; }
  if (g.state === "leaving") { [g.dx, g.dy] = bfsDir(tx, ty, 9, 7, true);
    return; }
    
    let opts = [];
    for (const [dx,dy] of ORDER) {
      if ((g.dx || g.dy) && dx === -g.dx && dy === -g.dy) continue; //no U-turns
      if (!blocked(tx + dx, ty + dy, false)) opts.push([dx, dy]);
    }
    if (!opts.length) opts = [[-g.dx, -g.dy]];
    if (g.scared) {
      [g.dx, g.dy] = opts[Math.floor(Math.random() * opts.length)];
      return;
    }
    const tgt = chaseTarget(g);
     let best = opts[0], bestD = Infinity;
     for (const o of opts) {
      const d = (tx + o[0] - tgt[0]) ** 2 + (ty + o[1] - tgt [1]) ** 2;
      if (d < bestD) {bestD = d; best = o; } 
     }
     [g.dx, g.dy] = best;
 }

 function updateGhost(g) {
  if (g.state === "house") {
    if (--g.timer <= 0) g.state = "leaving";
    return;
  }
  let steps = 1; 
  if (g.state === "eaten") steps = 2;
  else if (g.scared) steps = frame % 2 ? 0 : 1;
  else if (frame % 10 === 0) steps = 0;     //slightly slower than Pac-man
  for (let s = 0; s < steps; s++) {
    if (atCenter(g)) chooseDir(g);
    g.x += g.dx * 2; g.y += g.dy * 2;
    wrap(g);
  }
 }

 /* ------------ game loop ------------*/
 function checkCollisions() {
  for (const g of ghosts) {
    if (g.state === "eaten" || g.state === "house") continue;
    if (Math.hypot(pac.x - g.x, pac.y - g.y) < 12) {
      if (g.scared) {
        score += 200 * Math.pow(2, eatCombo++);
        g.state = "eaten"; g.scared = false;
      } else {
        mode = "dying"; modeTimer = 90;
        return;
      }
    }
  }
 }

function update() {
  frame++;
  if (mode === "ready") {
    if (--modeTimer <= 0) mode = "play";
  } else if (mode === "play") {
    phaseTimer++;
    updatePac();
    ghosts.forEach(updateGhost);
    if (frightTimer > 0 && --frightTimer === 0) ghosts.forEach(g => g.scared = false);
    checkCollisions();
    if (mode === "play" && pelletsLeft <= 0) {mode = "win"; modeTimer = 150; }
  } else if (mode === "dying") {
    if (--modeTimer <= 0) {
      lives--;
      if (lives <= 0) {
        mode = "over";
        if (score > high) {
          high = score;
          try { localStorage.setItem("pacHigh", high); } catch (e) {}
        }
      } else { resetActors(); mode = "ready"; modeTimer = 90; }
    }
  } else if (mode === "win") {
    if (--modeTimer <= 0) { level++; buildMap(); resetActors(); mode = "ready"; modeTimer = 90; } 
  }
}

/* ---------------drawing------------*/
function drawPellets() {
  ctx.fillStyle = "#ffd9a8";
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const c = grid[y][x];
       if (c === ".") {
        ctx.beginPath(); ctx.arc(x * T + T / 2, y * T + T /2, 2, 0, Math.PI * 2); ctx.fill();
       } else if (c === "o" && frame % 30 < 20) {
         ctx.beginPath(); ctx.arc(x * T + T / 2, y * T + T / 2, 6, 0, Math.PI * 2); ctx.fill();
       }
      }
}

function drawPac() {
  let mouth;
  if (mode === "dying") mouth = Math.PI * (1 - modeTimer / 90);
  else if (pac.dx || pac.dy) mouth = 0.05 + Math.abs(Math.sin(frame * 0.25)) * 0.28 * Math.PI;
  else mouth = 0.25 * Math.PI;
  const dir = mode === "dying" ? -Math.PI / 2 : Math.atan2(pac.ldy, pac.ldx);
  ctx.fillStyle = "#ffeb3b";
  ctx.beginPath();
  ctx.moveTo(pac.x, pac.y);
  ctx.arc(pac.x, pac.y, 9, dir + mouth, dir + 2 * Math.PI - mouth);
  ctx.closePath();
  ctx.fill();
}

function drawGhost(g) {
  const x = g.x, y = g.y, r = 9;
  const flash = g.scared && frightTimer < 120 && Math.floor(frame / 10)
  % 2;
  if (g.state !== "eaten") {
    ctx.fillStyle = g.scared ? (flash ? "#ffffff" : "#2121ff") : g.color;
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI, 0);           //dome
    ctx.lineTo(x + r, y + r);
    const n = 3, w = (2 * r) / n, wave = (frame >> 3 ) & 1 ? 3 : 0;
    for (let i = 0; i < n; i ++) {         //wavy bottom
      ctx.lineTo(x + r - w * i -w / 2, y + r - 4 + wave);
      ctx.lineTo(x + r - w * (i + 1), y + r);
    }
    ctx.closePath();
    ctx.fill();
  }

  if (g.scared && g.state !== "eaten") {          //scared face
    ctx.fillStyle = flash ? "#ff0000" : "#ffd0a0";
    ctx.fillRect(x - 4, y - 3, 2, 2);  
    ctx.fillRect(x + 2, y - 3, 2, 2);
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1;
    ctx.beginPath();  
    ctx.moveTo(x - 5, y + 4);
    for (let i = 1; i <= 5; i++) ctx.lineTo(x - 5 + i * 2, y + (i % 2 ? 2 : 4));
    ctx.stroke();
  } else {                      //normal/ eaten eyes
    for (const ex of [-3.5, 3.5]) {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(x + ex, y - 2, 3, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#1a1aff";
      ctx.beginPath(); ctx.arc(x + ex + g.dx * 1.5, y - 2 + g.dy * 2, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }
}
function drawText(text, y, color, size) {
  ctx.fillStyle = color;
  ctx.font = "bold " + (size || 16) + "px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, W / 2, y);
}

const elScore = document.getElementById("score")
const elHigh = document.getElementById("high")
const elLives = document.getElementById("lives")

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(wallLayer, 0, 0);
  drawPellets();
  if (mode !== "dying") ghosts.forEach(drawGhost);
  if (mode !== "over") drawPac();

  if (mode === "ready") drawText("READY!", 11 * T + 15, "#ffeb3b");
  if (mode === "win")   drawText("LEVEL CLEARED!", 11 * T + 15, "#ffeb3b");
  if (mode === "over") {
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 8 * T, W, 5 * T);
    drawText("GAME OVER", 10 * T + 8, "#ff3b3b", 22);
    drawText("Tap or press Space", 12 * T, "#fff", 14);
  }

  elScore.textContent = "SCORE" + score;
  elHigh.textContent = "HIGH" + Math.max(high, score);
  elLives.textContent = "●".repeat(Math.max(lives, 0));
}
let last = 0, acc = 0;
function loop(ts) {
  if (!last) last = ts;
  acc += Math.min(ts - last, 100);
  last = ts;
  while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
  draw();
  requestAnimationFrame(loop);
} 
 
/* ------------input-----------*/
function setDir(dx, dy) {
  if (mode === "over") { newGame(); return; }
  pac.nx = dx; pac.ny = dy;
}
window.addEventListener("keydown", e => {
  const k = e.key.toLocaleLowerCase();
  const map = {
    arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
    arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1]
  };
  if (map[k]) { e.preventDefault(); setDir(...map[k]); }
  else if ((k === " " || k === "enter") && mode === "over") newGame();
});

// on-screen buttons
for (const [id, d] of [["up", [0, -1]], ["down", [0, 1]], ["left", [-1, 0]], ["right", [1, 0]]]) {
  document.getElementById(id).addEventListener("pointerdown", e => { e.preventDefault(); setDir(...d); });
}

// swipe on the canvas
let sx = 0, sy = 0, swiping = false;
canvas.addEventListener("pointerdown", e => { sx = e.clientX; sy = e.clientY; swiping = true; });
canvas.addEventListener("pointermove", e => {
  if (!swiping) return;
  const dx = e.clientX - sx, dy = e.clientY - sy;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) {
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0);
    else setDir(0, dy > 0 ? 1 : -1);
    sx = e.clientX; sy = e.clientY;
  }
});
canvas.addEventListener("pointerup", e => {
  const moved = Math.hypot(e.clientX - sx, e.clientY - sy);
  if (swiping && moved < 10 && mode === "over") newGame();
  swiping = false;
});

/* ---------- start ---------- */
newGame();
requestAnimationFrame(loop);
  
