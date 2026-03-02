(() => {
  "use strict";

  // ===== DOM 元素快取 =====
  const $ = (id) => document.getElementById(id);
  const canvas = $("game");
  const ctx = canvas.getContext("2d", { alpha: false }); // 關閉 alpha 提升效能

  // 觸控按鈕
  const touchLeft = $("touchLeft");
  const touchRight = $("touchRight");
  const touchStart = $("touchStart");

  const startBtn = $("startBtn");
  const resetBtn = $("resetBtn");
  const rankBtn = $("rankBtn");
  const rankModal = $("rankModal");
  const rankBody = $("rankBody");
  const clearRankBtn = $("clearRankBtn");
  const closeRankBtn = $("closeRankBtn");
  const levelSelect = $("levelSelect");
  const levelText = $("levelText");
  const maxText = $("maxText");
  const scoreText = $("scoreText");
  const livesText = $("livesText");

  // ===== 常數配置（集中管理）=====
  const CONFIG = Object.freeze({
    // 遊戲規則
    MAX_LIVES: 5,
    HIT_SCORE: 50,

    // 馬賽克設定
    MOSAIC_N: 10,           // 馬賽克清晰度（越大越清楚）
    BRIGHT_CUTOFF: 255,     // 亮度過濾
    SAT_BOOST: 1.1,         // 顏色飽和度加成
    BRICK_SCALE: 1.5,       // 磚塊大小倍率
    BRICK_GAP: 6,           // 磚塊間距
    BRICK_AREA_SCALE: 0.7,  // 磚塊區域縮放（0.7=留白30%, 1.0=不留白）

    // 天使掉落
    ANGEL_DROP_CHANCE: 0.01,
    ANGEL_FALL_SPEED: 2.8,
    ANGEL_CATCH_SCORE: 100,
    ANGEL_HEAL_CHANCE: 0.35,
    // 惡魔掉落
    BOMB_DROP_CHANCE: 0.05,
    BOMB_FALL_SPEED: 3.0,
    BOMB_PENALTY: 100,
    // 物理參數
    PADDLE_WIDTH: 180,
    PADDLE_HEIGHT: 22,
    PADDLE_SPEED: 9,
    BALL_RADIUS: 16,
    BALL_MAX_VX: 9.5,

    // 畫布邊界
    CANVAS_PADDING: 20,
    BRICK_START_Y: 68,
  });

  // ===== 關卡圖片 =====
  const levels = Object.freeze([
    { name: "第1關：小新郎", src: "images/001.png" },
    { name: "第2關：足球少年", src: "images/002.png" },
    { name: "第3關：文青少年",   src: "images/003.png" },
    { name: "第4關：睡覺小童", src: "images/004.png" },
    { name: "Extra：洗澡小哥", src: "images/005.png" },
  ]);
  maxText.textContent = levels.length;

  // ===== 球與板子圖片 =====
  const ballImg = new Image();
  ballImg.src = "images/ball.png";
  let ballImgLoaded = false;
  ballImg.onload = () => { ballImgLoaded = true; };

  const paddleImg = new Image();
  paddleImg.src = "images/board1.png";
  let paddleImgLoaded = false;
  paddleImg.onload = () => { paddleImgLoaded = true; };

  // ===== 天使圖片 =====
  const angelImg = new Image();
  angelImg.src = "images/angel.png";
  let angelImgLoaded = false;
  angelImg.onload = () => { angelImgLoaded = true; };

  // ===== 惡魔圖片 =====
  const bombImg = new Image();
  bombImg.src = "images/bomb.png";
  let bombImgLoaded = false;
  bombImg.onload = () => { bombImgLoaded = true; };

  // ===== 遊戲狀態 =====
  const state = {
    running: false,
    gameOver: false,
    paused: false,
    score: 0,
    lives: CONFIG.MAX_LIVES,
    levelIndex: 0,
    bricksRemaining: 0,
  };

  // ===== 遊戲物件 =====
  let bricks = [];
  let drops = [];
  let brickCache = null; // 離屏 canvas 快取

  const paddle = {
    w: CONFIG.PADDLE_WIDTH,
    h: CONFIG.PADDLE_HEIGHT,
    x: canvas.width / 2 - CONFIG.PADDLE_WIDTH / 2,
    y: canvas.height - 40,
    speed: CONFIG.PADDLE_SPEED,
    vx: 0
  };

  const ball = {
    r: CONFIG.BALL_RADIUS,
    x: canvas.width / 2,
    y: canvas.height - 70,
    vx: 5.0,
    vy: -5.0,
    stuck: true
  };

  // ===== 輸入狀態 =====
  const input = { left: false, right: false };

  // ===== 效能：預計算常用值 =====
  const CANVAS_W = canvas.width;
  const CANVAS_H = canvas.height;
  const TWO_PI = Math.PI * 2;

  // ===== 工具函數 =====
  const clamp = (v, min, max) => v < min ? min : v > max ? max : v;

  const random = Math.random; // 快取 Math.random 引用

  // ===== HUD 更新（使用 DocumentFragment 減少重繪）=====
  function updateHUD() {
    levelText.textContent = state.levelIndex + 1;
    scoreText.textContent = state.score;
    livesText.textContent = state.lives;
  }

  // ===== 球與板子重置 =====
  function resetBallAndPaddle() {
    paddle.x = CANVAS_W / 2 - paddle.w / 2;
    paddle.vx = 0;
    ball.stuck = true;
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 2;

    const base = 4.8 + state.levelIndex * 0.35;
    const dir = random() < 0.5 ? -1 : 1;
    ball.vx = dir * (base + random() * 0.6);
    ball.vy = -(base + random() * 0.6);
  }

  // ===== 顏色飽和度增強（內聯優化）=====
  function satBoost(r, g, b, k) {
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    return [
      clamp(gray + (r - gray) * k, 0, 255) | 0,
      clamp(gray + (g - gray) * k, 0, 255) | 0,
      clamp(gray + (b - gray) * k, 0, 255) | 0
    ];
  }

  // ===== 建立離屏磚塊快取 =====
  function createBrickCache() {
    brickCache = document.createElement("canvas");
    brickCache.width = CANVAS_W;
    brickCache.height = CANVAS_H;
    const bctx = brickCache.getContext("2d");

    for (const b of bricks) {
      if (b.alive) {
        bctx.fillStyle = b.color;
        bctx.fillRect(b.x, b.y, b.w, b.h);
      }
    }
  }

  // ===== 從圖片建立磚塊 =====
  async function buildBricksFromImage(src) {
    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error(`圖片載入失敗：${src}（請確認檔名/副檔名/路徑）`));
      img.src = src;
    });

    // ===== 裁成正方形（置中）=====
    const s = Math.min(img.width, img.height);
    const sx = (img.width - s) / 2;
    const sy = (img.height - s) / 2;

    // downscale -> 馬賽克
    const off = document.createElement("canvas");
    const N = CONFIG.MOSAIC_N;
    off.width = N;
    off.height = N;
    const octx = off.getContext("2d");
    octx.imageSmoothingEnabled = true;
    octx.drawImage(img, sx, sy, s, s, 0, 0, N, N);

    const data = octx.getImageData(0, 0, N, N).data;
    const gap = CONFIG.BRICK_GAP;

    // 計算磚塊尺寸與位置（套用 BRICK_AREA_SCALE 縮放磚塊區域）
    const areaScale = CONFIG.BRICK_AREA_SCALE;
    const usableW = CANVAS_W * 0.86 * areaScale;
    const usableH = CANVAS_H * 0.62 * areaScale;
    const baseBW = (usableW - gap * (N - 1)) / N;
    const baseBH = (usableH - gap * (N - 1)) / N;

    // 使用較小的尺寸，確保磚塊是正方形
    const baseSize = Math.min(baseBW, baseBH);
    const brickSize = (baseSize * CONFIG.BRICK_SCALE) | 0;
    const bw = brickSize;
    const bh = brickSize;

    const totalW = N * bw + (N - 1) * gap;
    const totalH = N * bh + (N - 1) * gap;
    const startX = ((CANVAS_W - totalW) / 2) | 0;  // 取整避免浮點數殘留
    const startY = (CONFIG.BRICK_START_Y + (CANVAS_H * 0.62 - totalH) / 2) | 0; // 垂直置中，取整
    const bwGap = bw + gap;
    const bhGap = bh + gap;

    // 預分配陣列大小（效能優化）
    const tempBricks = [];
    let remaining = 0;

    for (let y = 0; y < N; y++) {
      const rowOffset = y * N * 4;
      const yPos = startY + y * bhGap;

      for (let x = 0; x < N; x++) {
        const i = rowOffset + x * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = (r + g + b) / 3;

        if (lum >= CONFIG.BRIGHT_CUTOFF) continue;

        const [nr, ng, nb] = satBoost(r, g, b, CONFIG.SAT_BOOST);

        tempBricks.push({
          x: startX + x * bwGap,
          y: yPos,
          w: bw,
          h: bh,
          alive: true,
          color: `rgb(${nr},${ng},${nb})`
        });
        remaining++;
      }
    }

    bricks = tempBricks;
    state.bricksRemaining = remaining;

    // 建立磚塊快取
    createBrickCache();
  }

  // ===== 載入關卡 =====
  async function loadLevel(idx) {
    state.running = false;
    state.gameOver = false;
    state.paused = false;
    state.levelIndex = idx;
    drops.length = 0; // 比 drops = [] 更快

    // 更新背景圖片為當前關卡圖片（透過偽元素設定）
    document.body.style.setProperty('--bg-image', `url("${levels[idx].src}")`);

    updateHUD();
    resetBallAndPaddle();

    try {
      await buildBricksFromImage(levels[idx].src);
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  }

  // ===== 遊戲控制 =====
  function start() {
    if (state.gameOver || state.bricksRemaining === 0) return;
    state.running = true;
    state.paused = false;
    if (ball.stuck) ball.stuck = false;
  }

  function togglePause() {
    if (state.gameOver || !state.running) return;
    state.paused = !state.paused;
  }

  function resetAll() {
    state.score = 0;
    state.lives = CONFIG.MAX_LIVES;
    loadLevel(0);
    updateHUD();
  }

  // ===== 輸入處理（使用事件委派）=====
  function handleKeyDown(e) {
    switch (e.key) {
      case "ArrowLeft":
        input.left = true;
        break;
      case "ArrowRight":
        input.right = true;
        break;
      case " ":
        e.preventDefault();
        if (!state.running) start();
        break;
      case "p":
      case "P":
        togglePause();
        break;
    }
  }

  function handleKeyUp(e) {
    if (e.key === "ArrowLeft") input.left = false;
    else if (e.key === "ArrowRight") input.right = false;
  }

  // 節流的滑鼠移動處理
  let lastMouseUpdate = 0;
  const MOUSE_THROTTLE = 8; // ms

  function setPaddleByClientX(clientX) {
    const now = performance.now();
    if (now - lastMouseUpdate < MOUSE_THROTTLE) return;
    lastMouseUpdate = now;

    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (CANVAS_W / rect.width);
    const maxX = CANVAS_W - paddle.w - CONFIG.CANVAS_PADDING;
    paddle.x = clamp(x - paddle.w / 2, CONFIG.CANVAS_PADDING, maxX);

    if (ball.stuck) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 2;
    }
  }

  // ===== 碰撞檢測（內聯優化）=====
  function circleRectCollide(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = cx < rx ? rx : cx > rx + rw ? rx + rw : cx;
    const closestY = cy < ry ? ry : cy > ry + rh ? ry + rh : cy;
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy <= cr * cr;
  }

  function reflectBallFromRect(rect) {
    const bx = ball.x, by = ball.y;
    const left = Math.abs(rect.x - bx);
    const right = Math.abs(rect.x + rect.w - bx);
    const top = Math.abs(rect.y - by);
    const bottom = Math.abs(rect.y + rect.h - by);
    const m = Math.min(left, right, top, bottom);

    if (m === left || m === right) ball.vx = -ball.vx;
    else ball.vy = -ball.vy;
  }

  // ===== 更新磚塊快取（移除單個磚塊）=====
  function invalidateBrickInCache(brick) {
    if (!brickCache) return;
    const bctx = brickCache.getContext("2d");
    // 稍微擴大清除區域，確保邊緣完全清除
    bctx.clearRect(brick.x - 1, brick.y - 1, brick.w + 2, brick.h + 2);
  }

  // ===== 遊戲更新 =====
  function update() {
    // 板子移動
    paddle.vx = input.left ? -paddle.speed : input.right ? paddle.speed : 0;
    const maxX = CANVAS_W - paddle.w - CONFIG.CANVAS_PADDING;
    paddle.x = clamp(paddle.x + paddle.vx, CONFIG.CANVAS_PADDING, maxX);

    if (ball.stuck) {
      ball.x = paddle.x + paddle.w / 2;
      ball.y = paddle.y - ball.r - 2;
      return;
    }

    // 球移動
    ball.x += ball.vx;
    ball.y += ball.vy;

    // 牆壁碰撞
    const br = ball.r;
    if (ball.x - br <= 0) {
      ball.x = br;
      ball.vx = -ball.vx;
    } else if (ball.x + br >= CANVAS_W) {
      ball.x = CANVAS_W - br;
      ball.vx = -ball.vx;
    }
    if (ball.y - br <= 0) {
      ball.y = br;
      ball.vy = -ball.vy;
    }

    // 板子碰撞
    if (ball.vy > 0 && circleRectCollide(ball.x, ball.y, br, paddle.x, paddle.y, paddle.w, paddle.h)) {
      const hitPos = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      ball.vy = -Math.abs(ball.vy);
      ball.vx = clamp(ball.vx + hitPos * 1.35, -CONFIG.BALL_MAX_VX, CONFIG.BALL_MAX_VX);
    }

    // 磚塊碰撞（只檢測活著的磚塊）
    for (let i = 0, len = bricks.length; i < len; i++) {
      const b = bricks[i];
      if (!b.alive) continue;

      if (circleRectCollide(ball.x, ball.y, br, b.x, b.y, b.w, b.h)) {
        b.alive = false;
        state.bricksRemaining--;
        state.score += CONFIG.HIT_SCORE;
        updateHUD();
        invalidateBrickInCache(b);

        // 掉骨頭或炸彈
        const dropRoll = random();
        if (dropRoll < CONFIG.BOMB_DROP_CHANCE) {
          drops.push({
            x: b.x + b.w / 2,
            y: b.y + b.h / 2,
            vy: CONFIG.BOMB_FALL_SPEED,
            type: 'bomb'
          });
        } else if (dropRoll < CONFIG.ANGEL_DROP_CHANCE + CONFIG.BOMB_DROP_CHANCE) {
          drops.push({
            x: b.x + b.w / 2,
            y: b.y + b.h / 2,
            vy: CONFIG.ANGEL_FALL_SPEED,
            type: 'angel'
          });
        }

        reflectBallFromRect(b);
        break;
      }
    }

    // 更新掉落物（反向遍歷以安全刪除）
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.y += d.vy;

      // 接到掉落物
      if (d.y >= paddle.y && d.x >= paddle.x && d.x <= paddle.x + paddle.w) {
        if (d.type === 'bomb') {
          state.score = Math.max(0, state.score - CONFIG.BOMB_PENALTY);
        } else {
          state.score += CONFIG.ANGEL_CATCH_SCORE;
          if (random() < CONFIG.ANGEL_HEAL_CHANCE && state.lives < CONFIG.MAX_LIVES) {
            state.lives++;
          }
        }
        updateHUD();
        drops.splice(i, 1);
      } else if (d.y > CANVAS_H + 40) {
        drops.splice(i, 1);
      }
    }

    // 過關檢查
    if (state.bricksRemaining === 0) {
      state.running = false;
      if (state.levelIndex < levels.length - 1) {
        loadLevel(state.levelIndex + 1);
        levelSelect.value = state.levelIndex;
      } else {
        setTimeout(() => {
          alert("全部通關 🎉");
          promptAddScore();
        }, 100);
      }
      return;
    }

    // 掉落檢查
    if (ball.y - br > CANVAS_H) {
      state.lives--;
      updateHUD();
      if (state.lives <= 0) {
        state.gameOver = true;
        state.running = false;
        setTimeout(() => {
          alert("Game Over");
          if (state.score > 0) promptAddScore();
        }, 100);
      } else {
        resetBallAndPaddle();
        state.running = false;
      }
    }
  }

  // ===== 繪製（優化版）=====
  function draw() {
    // 清空畫布
    ctx.fillStyle = "#e8f1ff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 標題
    ctx.fillStyle = "rgba(20,40,80,0.85)";
    ctx.font = "800 18px system-ui, -apple-system, 'Noto Sans TC', sans-serif";
    ctx.fillText(
      `${levels[state.levelIndex].name}（每塊 +${CONFIG.HIT_SCORE}）｜天使 +${CONFIG.ANGEL_CATCH_SCORE}｜炸彈 -${CONFIG.BOMB_PENALTY}`,
      18, 34
    );

    // 繪製磚塊（使用快取或直接繪製）
    if (brickCache) {
      ctx.drawImage(brickCache, 0, 0);
    } else {
      for (let i = 0, len = bricks.length; i < len; i++) {
        const b = bricks[i];
        if (b.alive) {
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x, b.y, b.w, b.h);
        }
      }
    }

    // 掉落物
    if (drops.length > 0) {
      const dropSize = 35;
      for (let i = 0, len = drops.length; i < len; i++) {
        const d = drops[i];
        if (d.type === 'bomb') {
          if (bombImgLoaded) {
            ctx.drawImage(bombImg, d.x - dropSize / 2, d.y - dropSize / 2, dropSize, dropSize);
          } else {
            ctx.font = "22px serif";
            ctx.textAlign = "center";
            ctx.fillText("💣", d.x, d.y);
            ctx.textAlign = "left";
          }
        } else {
          if (angelImgLoaded) {
            ctx.drawImage(angelImg, d.x - dropSize / 2, d.y - dropSize / 2, dropSize, dropSize);
          } else {
            ctx.font = "22px serif";
            ctx.textAlign = "center";
            ctx.fillText("🦴", d.x, d.y);
            ctx.textAlign = "left";
          }
        }
      }
    }

    // 板子
    if (paddleImgLoaded) {
      ctx.drawImage(paddleImg, paddle.x, paddle.y, paddle.w, paddle.h);
    } else {
      ctx.fillStyle = "rgba(35,70,140,0.90)";
      ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
    }

    // 球
    if (ballImgLoaded) {
      const ballSize = ball.r * 2;
      ctx.drawImage(ballImg, ball.x - ball.r, ball.y - ball.r, ballSize, ballSize);
    } else {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, TWO_PI);
      ctx.fillStyle = "rgba(30,60,120,0.95)";
      ctx.fill();
    }

    // 暫停/開始畫面
    if (!state.running || state.paused) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.fillStyle = "rgba(20,40,80,0.95)";
      ctx.textAlign = "center";
      ctx.font = "900 36px system-ui, -apple-system, 'Noto Sans TC', sans-serif";

      const message = state.paused ? "遊戲暫停" : "按 Start 開始";
      ctx.fillText(message, CANVAS_W / 2, CANVAS_H / 2);

      ctx.font = "750 14px system-ui, -apple-system, 'Noto Sans TC', sans-serif";
      const hint = state.paused ? "按 P 繼續" : "或按空白鍵 Space｜可用下拉選關卡｜P 暫停";
      ctx.fillText(hint, CANVAS_W / 2, CANVAS_H / 2 + 26);
      ctx.textAlign = "left";
    }
  }

  // ===== 遊戲循環（使用 delta time）=====
  let lastTime = 0;
  const TARGET_FPS = 60;
  const FRAME_TIME = 1000 / TARGET_FPS;

  function loop(timestamp) {
    const delta = timestamp - lastTime;

    if (delta >= FRAME_TIME) {
      lastTime = timestamp - (delta % FRAME_TIME);

      if (state.running && !state.gameOver && !state.paused) {
        update();
      }
      draw();
    }

    requestAnimationFrame(loop);
  }

  // ===== 事件綁定 =====
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  canvas.addEventListener("mousemove", (e) => setPaddleByClientX(e.clientX));

  // 觸控滑動控制（手機版）
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault(); // 防止滾動
    if (e.touches?.[0]) setPaddleByClientX(e.touches[0].clientX);
  }, { passive: false });

  canvas.addEventListener("touchstart", (e) => {
    if (!state.running) start();
  }, { passive: true });

  // 觸控按鈕事件（長按持續移動）
  let touchInterval = null;

  function startTouchMove(direction) {
    if (direction === 'left') input.left = true;
    else if (direction === 'right') input.right = true;
  }

  function stopTouchMove() {
    input.left = false;
    input.right = false;
    if (touchInterval) {
      clearInterval(touchInterval);
      touchInterval = null;
    }
  }

  // 左按鈕
  touchLeft.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startTouchMove('left');
  }, { passive: false });
  touchLeft.addEventListener('touchend', stopTouchMove);
  touchLeft.addEventListener('touchcancel', stopTouchMove);

  // 右按鈕
  touchRight.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startTouchMove('right');
  }, { passive: false });
  touchRight.addEventListener('touchend', stopTouchMove);
  touchRight.addEventListener('touchcancel', stopTouchMove);

  // 開始按鈕
  touchStart.addEventListener('touchstart', (e) => {
    e.preventDefault();
    start();
  }, { passive: false });

  // 防止雙擊縮放
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  startBtn.addEventListener("click", start);
  resetBtn.addEventListener("click", resetAll);

  // ===== 龍虎排行榜功能（API 版本）=====
  // API 伺服器網址（自動判斷環境）
  const API_BASE = (() => {
    const hostname = window.location.hostname;

    // 本地開發環境
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      console.log('本地開發環境，使用本地伺服器');
      return 'http://localhost:3000/api';
    }

    // 正式環境（填入你的 Railway 網址）
    // TODO: 部署後請將下方網址改成你的 Railway 網址
    console.log('正式環境，使用 Railway伺服器');
    return 'https://breakout-production-7c7b.up.railway.app/api';
  })();

  // 備用：本地儲存（當 API 無法連線時使用）
  const RANK_KEY = "brickBreaker_leaderboard";
  const MAX_RANKS = 10;

  // 從 API 取得排行榜
  async function fetchLeaderboard() {
    try {
      const response = await fetch(`${API_BASE}/leaderboard?limit=${MAX_RANKS}`);
      const result = await response.json();
      if (result.success) {
        return result.data;
      }
    } catch (error) {
      console.warn('API 連線失敗，使用本地資料:', error);
    }
    // API 失敗時，回退到本地儲存
    return getLocalLeaderboard();
  }

  // 本地儲存備援
  function getLocalLeaderboard() {
    try {
      return JSON.parse(localStorage.getItem(RANK_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveLocalLeaderboard(data) {
    localStorage.setItem(RANK_KEY, JSON.stringify(data));
  }

  // 新增分數到 API
  async function addScore(name, score, level) {
    try {
      const response = await fetch(`${API_BASE}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score, level })
      });
      const result = await response.json();
      if (result.success) {
        alert(`🎉 你的排名是第 ${result.data.rank} 名！`);
        return;
      }
    } catch (error) {
      console.warn('API 連線失敗，儲存到本地:', error);
    }
    // API 失敗時，儲存到本地
    const board = getLocalLeaderboard();
    board.push({ name, score, level, created_at: new Date().toISOString() });
    board.sort((a, b) => b.score - a.score);
    saveLocalLeaderboard(board.slice(0, MAX_RANKS));
  }

  async function renderLeaderboard() {
    rankBody.innerHTML = '<tr><td colspan="4" class="no-record">載入中...</td></tr>';

    const board = await fetchLeaderboard();
    if (board.length === 0) {
      rankBody.innerHTML = '<tr><td colspan="4" class="no-record">尚無記錄，快來挑戰！</td></tr>';
      return;
    }
    rankBody.innerHTML = board.map((entry, i) => {
      const rankClass = i === 0 ? 'rank-1 dragon' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3 tiger' : '';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
      return `<tr>
        <td class="${rankClass}">${medal}</td>
        <td>${entry.name}</td>
        <td><strong>${entry.score}</strong></td>
        <td>第${entry.level}關</td>
      </tr>`;
    }).join('');
  }

  function showRankModal() {
    renderLeaderboard();
    rankModal.classList.add('show');
  }

  function hideRankModal() {
    rankModal.classList.remove('show');
  }

  function promptAddScore() {
    const name = prompt(`🎉 恭喜！你的分數：${state.score}\n請輸入你的名字：`, '玩家');
    if (name && name.trim()) {
      addScore(name.trim(), state.score, state.levelIndex + 1);
    }
  }

  rankBtn.addEventListener('click', showRankModal);
  closeRankBtn.addEventListener('click', hideRankModal);
  rankModal.addEventListener('click', (e) => {
    if (e.target === rankModal) hideRankModal();
  });

  // 關卡選單
  const fragment = document.createDocumentFragment();
  levels.forEach((lv, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = lv.name;
    fragment.appendChild(opt);
  });
  levelSelect.appendChild(fragment);

  levelSelect.addEventListener("change", async (e) => {
    await loadLevel(Number(e.target.value));
    updateHUD();
  });

  // ===== 初始化 =====
  updateHUD();
  levelSelect.value = "0";
  loadLevel(0).then(() => requestAnimationFrame(loop));
})();
