import { GAME_CONFIG, PLAYER_META } from "./config.js";
import {
  clamp,
  drawGlowCircle,
  drawImageContain,
  drawImageCover,
  drawRoundedRect,
  easeOutCubic,
  formatScore,
  formatTime,
  safeAreaRect,
} from "./utils.js";
import { GameCore } from "./game-core.js";

export class FloorScreen {
  constructor({ canvas, assets, relay, audio, sessionId, inputMode }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.assets = assets;
    this.relay = relay;
    this.audio = audio;
    this.sessionId = sessionId;
    this.inputMode = inputMode || "mouse";
    this.game = new GameCore({ sessionId, assets, audio, relay, inputMode: this.inputMode });
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.width = 0;
    this.height = 0;
    this.running = false;
    this.trackStartedForRound = false;
    this.customZoneConfig = {
      safeTop: 1,
      safeBottom: 1,
      centerGap: 1,
      padHeight: 1,
      laneSpread: 1,
    };

    this.relay?.onMessage((message) => {
      this.onRelayMessage(message).catch(() => {});
    });
    this._bindEvents();
    this.resize();
  }

  _bindEvents() {
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.canvas.addEventListener(
      "touchstart",
      (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        if (!touch) return;
        this.onPointerDown({ clientX: touch.clientX, clientY: touch.clientY });
      },
      { passive: false }
    );

    window.addEventListener("lidar-hit", (event) => {
      const detail = event.detail || {};
      if (detail.player && Number.isInteger(detail.lane)) {
        this.externalHit(detail.player, detail.lane);
      }
    });

    window.LidarTouchBridge = {
      hit: (player, lane) => this.externalHit(player, lane),
      setMode: (mode) => this.setInputMode(mode),
      setCalibrationMode: (value) => this.setCalibrationMode(value),
      configureZones: (config) => {
        this.customZoneConfig = { ...this.customZoneConfig, ...(config || {}) };
      },
      getZones: () => this.getLaneLayout(),
    };
  }

  async onRelayMessage(message) {
    if (!message || message.type !== "command") return;
    const { action, inputMode, value, name, audioData } = message.payload || {};

    if (action === "start") {
      this.audio?.ensure?.();
      this.game.start(performance.now());
      this.trackStartedForRound = false;
    } else if (action === "restart") {
      this.audio?.stopTrack?.();
      this.game.reset();
      this.trackStartedForRound = false;
    } else if (action === "setInputMode" && inputMode) {
      this.setInputMode(inputMode);
    } else if (action === "toggleCalibration") {
      this.setCalibrationMode(value);
    } else if (action === "loadTrack" && audioData) {
      this.audio?.ensure?.();
      const trackData = await this.audio.loadTrackFromArrayBuffer(audioData, name || "track.mp3");
      this.game.setTrack(trackData);
      this.game.maybeBroadcast(performance.now());
    }
  }

  setCalibrationMode(value) {
    this.game.setCalibrationMode(value);
  }

  setInputMode(mode) {
    this.inputMode = mode;
    this.game.setInputMode(mode);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  start() {
    this.running = true;
    this.relay?.send("ready", { screen: "floor" });
    requestAnimationFrame((now) => this.tick(now));
  }

  tick(now) {
    if (!this.running) return;
    const previousState = this.game.state;
    this.game.update(now);
    if (previousState !== "playing" && this.game.state === "playing" && !this.trackStartedForRound) {
      this.audio?.startTrack?.();
      this.trackStartedForRound = true;
    }
    if (this.game.state === "results" && previousState !== "results") {
      this.audio?.stopTrack?.();
    }
    this.game.maybeBroadcast(now);
    this.render(now);
    requestAnimationFrame((next) => this.tick(next));
  }

  onKeyDown(event) {
    if (event.code === "Space") {
      this.audio?.ensure?.();
      this.game.startIfIdle(performance.now());
      this.trackStartedForRound = false;
      return;
    }

    PLAYER_META.forEach((meta) => {
      const lane = meta.keyMap.indexOf(event.code);
      if (lane >= 0) {
        this.audio?.ensure?.();
        if (this.game.state === "idle" || this.game.state === "results") {
          this.game.startIfIdle(performance.now());
          this.trackStartedForRound = false;
        } else {
          this.game.hit(meta.id, lane, performance.now());
        }
      }
    });
  }

  laneFromPosition(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const layout = this.getLaneLayout();

    for (const lane of layout.lanes) {
      if (x >= lane.padX && x <= lane.padX + lane.padW && y >= lane.padY && y <= lane.padY + lane.padH) {
        return lane;
      }
    }
    for (const lane of layout.lanes) {
      if (x >= lane.x && x <= lane.x + lane.w && y >= layout.topY && y <= lane.padY + lane.padH) {
        return lane;
      }
    }
    return null;
  }

  onPointerDown(event) {
    this.audio?.ensure?.();
    const lane = this.laneFromPosition(event.clientX, event.clientY);
    if (!lane) {
      this.game.startIfIdle(performance.now());
      this.trackStartedForRound = false;
      return;
    }
    if (this.inputMode === "sensor") return;
    if (this.game.state === "idle" || this.game.state === "results") {
      this.game.startIfIdle(performance.now());
      this.trackStartedForRound = false;
    } else {
      this.game.hit(lane.player, lane.lane, performance.now());
    }
  }

  externalHit(player, lane) {
    this.audio?.ensure?.();
    if (this.game.state === "idle" || this.game.state === "results") {
      this.game.startIfIdle(performance.now());
      this.trackStartedForRound = false;
    } else {
      this.game.hit(player, lane, performance.now());
    }
  }

  getLaneLayout() {
    const safe = safeAreaRect(this.width, this.height, GAME_CONFIG.safeArea);
    const centerGap = safe.w * GAME_CONFIG.playerAreaGapRatio * this.customZoneConfig.centerGap;
    const playerAreaW = (safe.w - centerGap) / 2;
    const laneGap = playerAreaW * GAME_CONFIG.laneGapRatio;
    const laneWidth = (playerAreaW - laneGap * (GAME_CONFIG.lanesPerPlayer - 1)) / GAME_CONFIG.lanesPerPlayer;
    const topY = safe.y + safe.h * 0.12 * this.customZoneConfig.safeTop;
    const padH = safe.h * 0.18 * this.customZoneConfig.padHeight;
    const padY = safe.y + safe.h * 0.73 * this.customZoneConfig.safeBottom;
    const lanes = [];

    for (let playerIndex = 0; playerIndex < GAME_CONFIG.playerCount; playerIndex += 1) {
      const playerX = safe.x + playerIndex * (playerAreaW + centerGap);
      for (let lane = 0; lane < GAME_CONFIG.lanesPerPlayer; lane += 1) {
        const x = playerX + lane * (laneWidth + laneGap);
        lanes.push({
          player: playerIndex + 1,
          lane,
          x,
          w: laneWidth,
          topY,
          padX: x + laneWidth * 0.04,
          padW: laneWidth * 0.92,
          padY,
          padH,
          hitX: x + laneWidth / 2,
          hitY: padY + padH * 0.5,
          hitRadius: Math.min(laneWidth * 0.42, padH * 0.4),
        });
      }
    }

    return { safe, lanes, laneWidth, laneGap, centerGap, topY, padY, padH };
  }

  render(now) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (this.game.state === "idle") {
      this.drawIdle(now);
      if (this.game.calibrationMode) {
        this.drawCalibrationOverlay(now);
      }
      return;
    }

    this.drawGameplay(now);

    if (this.game.state === "countdown") {
      this.drawCountdown(now);
    } else if (this.game.state === "results") {
      this.drawResults(now);
    }

    if (this.game.calibrationMode) {
      this.drawCalibrationOverlay(now);
    }
  }

  drawIdle(now) {
    const ctx = this.ctx;
    const pulse = 0.985 + Math.sin(now * 0.004) * 0.015;
    drawImageCover(ctx, this.assets.startScreen, 0, 0, this.width, this.height, 1);
    ctx.fillStyle = "rgba(3, 3, 12, 0.30)";
    ctx.fillRect(0, 0, this.width, this.height);

    const safe = safeAreaRect(this.width, this.height, GAME_CONFIG.safeArea);
    drawImageContain(ctx, this.assets.jimadorLogo, safe.x + safe.w * 0.24, safe.y + safe.h * 0.10, safe.w * 0.52 * pulse, safe.h * 0.24 * pulse);
    drawImageContain(ctx, this.assets.laSolarLogo, safe.x + safe.w * 0.34, safe.y + safe.h * 0.56, safe.w * 0.32, safe.h * 0.13);
    drawImageContain(ctx, this.assets.pressStart, safe.x + safe.w * 0.25, safe.y + safe.h * 0.42, safe.w * 0.50, safe.h * 0.12, 0.98);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(244,247,255,0.92)";
    ctx.font = `700 ${Math.max(20, this.width * 0.022)}px Arial`;
    ctx.fillText("Piso LED · interacción con pies · 2 jugadores", this.width / 2, safe.y + safe.h * 0.76);

    ctx.fillStyle = "rgba(37,217,255,0.96)";
    ctx.font = `700 ${Math.max(15, this.width * 0.015)}px Arial`;
    const helper = this.inputMode === "sensor"
      ? "Modo sensor activo · zonas grandes de pisada listas para calibración"
      : "Modo test activo · click/touch o teclas A S D / J K L";
    ctx.fillText(helper, this.width / 2, safe.y + safe.h * 0.84);

    ctx.fillStyle = "rgba(255,198,69,0.98)";
    ctx.fillText(this.game.trackMeta.hasTrack ? `Track cargado: ${this.game.trackMeta.name}` : "Carga un MP3 desde el panel operador para notas reactivas", this.width / 2, safe.y + safe.h * 0.90);
  }

  drawGameplay(now) {
    const ctx = this.ctx;
    const layout = this.getLaneLayout();
    const notes = this.game.getVisibleNotes(now);
    const snapshot = this.game.getSnapshot(now);
    const safe = layout.safe;

    drawImageCover(ctx, this.assets.floorGameplayBg || this.assets.startScreen, 0, 0, this.width, this.height, 1);
    ctx.fillStyle = "rgba(2, 2, 10, 0.14)";
    ctx.fillRect(0, 0, this.width, this.height);

    drawRoundedRect(ctx, safe.x, safe.y, safe.w, safe.h, Math.min(safe.w, safe.h) * 0.035);
    ctx.fillStyle = "rgba(0,0,0,0)";

    drawImageContain(ctx, this.assets.jimadorLogo, safe.x + safe.w * 0.34, safe.y + safe.h * 0.00, safe.w * 0.24, safe.h * 0.10, 0.96);
    drawImageContain(ctx, this.assets.laSolarLogo, safe.x + safe.w * 0.83, safe.y + safe.h * 0.01, safe.w * 0.11, safe.h * 0.07, 0.96);

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(244,247,255,0.88)";
    ctx.font = `800 ${Math.max(16, this.width * 0.015)}px Arial`;
    ctx.fillText("FLOOR GAMEPLAY", safe.x, safe.y + safe.h * 0.03);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(37,217,255,0.96)";
    ctx.font = `800 ${Math.max(24, this.width * 0.024)}px Arial`;
    ctx.fillText(formatTime(snapshot.remainingMs), this.width / 2, safe.y + safe.h * 0.04);

    ctx.fillStyle = "rgba(255,198,69,0.96)";
    ctx.font = `700 ${Math.max(14, this.width * 0.012)}px Arial`;
    ctx.fillText(snapshot.trackName, this.width / 2, safe.y + safe.h * 0.08);

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.setLineDash([14, 12]);
    ctx.beginPath();
    ctx.moveTo(this.width / 2, safe.y + safe.h * 0.12);
    ctx.lineTo(this.width / 2, safe.y + safe.h * 0.93);
    ctx.stroke();
    ctx.restore();

    layout.lanes.forEach((laneObj, index) => {
      const playerMeta = PLAYER_META[laneObj.player - 1];
      const player = this.game.players[laneObj.player - 1];
      const laneColor = laneObj.player === 1 ? playerMeta.color : playerMeta.color;
      const flash = player.laneFlash[laneObj.lane] > now ? 1 : 0;

      const laneGradient = ctx.createLinearGradient(laneObj.x, layout.topY, laneObj.x, laneObj.padY + laneObj.padH);
      const [r, g, b] = laneObj.player === 1 ? [37, 217, 255] : [255, 198, 69];
      laneGradient.addColorStop(0, `rgba(${r},${g},${b},0.18)`);
      laneGradient.addColorStop(0.55, `rgba(${r},${g},${b},0.08)`);
      laneGradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = laneGradient;
      ctx.fillRect(laneObj.x, layout.topY, laneObj.w, laneObj.padY + laneObj.padH - layout.topY);

      ctx.strokeStyle = `rgba(${r},${g},${b},${flash ? 0.95 : 0.40})`;
      ctx.lineWidth = flash ? 4 : 2.5;
      ctx.strokeRect(laneObj.x + 4, layout.topY, laneObj.w - 8, laneObj.padY - layout.topY + laneObj.padH);

      drawGlowCircle(ctx, laneObj.hitX, laneObj.hitY, laneObj.hitRadius * 2.1, laneColor, flash ? 1 : 0.65);
      ctx.fillStyle = laneObj.player === 1 ? "rgba(10,88,220,0.95)" : "rgba(21,77,188,0.96)";
      drawRoundedRect(ctx, laneObj.padX, laneObj.padY, laneObj.padW, laneObj.padH, laneObj.padH * 0.34, true, false);
      ctx.strokeStyle = `rgba(${r},${g},${b},${flash ? 1 : 0.82})`;
      ctx.lineWidth = flash ? 5 : 3.2;
      drawRoundedRect(ctx, laneObj.padX, laneObj.padY, laneObj.padW, laneObj.padH, laneObj.padH * 0.34, false, true);

      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(244,247,255,0.94)";
      ctx.font = `900 ${Math.max(14, this.width * 0.014)}px Arial`;
      ctx.fillText(`PIE ${laneObj.lane + 1}`, laneObj.hitX, laneObj.padY + laneObj.padH * 0.60);

      if (index % GAME_CONFIG.lanesPerPlayer === 0) {
        const groupCenterX = laneObj.x + layout.laneWidth * 1.5 + layout.laneGap;
        ctx.textAlign = "center";
        ctx.fillStyle = playerMeta.color;
        ctx.font = `900 ${Math.max(22, this.width * 0.022)}px Arial`;
        ctx.fillText(playerMeta.label, groupCenterX, layout.topY - 16);

        ctx.fillStyle = "rgba(244,247,255,0.96)";
        ctx.font = `900 ${Math.max(26, this.width * 0.025)}px Arial`;
        ctx.fillText(formatScore(player.score), groupCenterX, laneObj.padY + laneObj.padH + 42);

        ctx.font = `700 ${Math.max(14, this.width * 0.012)}px Arial`;
        ctx.fillStyle = "rgba(244,247,255,0.78)";
        ctx.fillText(`Combo ${player.combo} · x${player.multiplier}`, groupCenterX, laneObj.padY + laneObj.padH + 68);
      }
    });

    notes.forEach((note) => {
      const laneObj = layout.lanes[note.player * GAME_CONFIG.lanesPerPlayer + note.lane];
      const current = this.game.state === "countdown" ? -999 : now - this.game.gameplayStartedAt;
      const progress = 1 - (note.time - current) / GAME_CONFIG.travelMs;
      const clamped = clamp(progress, 0, 1.12);
      const yStart = layout.topY - layout.padH * 0.05;
      const y = yStart + (laneObj.hitY - yStart - laneObj.hitRadius * 0.55) * easeOutCubic(clamped);
      const baseSize = laneObj.w * 0.78;
      const scale = 0.84 + clamped * 0.24 + Math.sin(now * 0.012 + note.id) * 0.025;
      const size = baseSize * scale;
      const x = laneObj.hitX - size / 2;
      const img = this.assets[note.assetKey];

      drawImageContain(ctx, this.assets.pulseRing, x - size * 0.16, y - size * 0.16, size * 1.32, size * 1.32, 0.18);
      if (img) {
        drawImageContain(ctx, img, x, y, size, size, 1);
      } else {
        ctx.fillStyle = note.player === 0 ? "#25d9ff" : "#ffc645";
        ctx.beginPath();
        ctx.arc(laneObj.hitX, y + size / 2, size * 0.34, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    snapshot.players.forEach((player, index) => {
      if (!player.feedback) return;
      const x = index === 0 ? safe.x + safe.w * 0.20 : safe.x + safe.w * 0.80;
      const y = safe.y + safe.h * 0.15;
      ctx.textAlign = "center";
      ctx.fillStyle = player.feedbackColor || "#ffffff";
      ctx.font = `900 ${Math.max(22, this.width * 0.022)}px Arial`;
      ctx.fillText(player.feedback, x, y);
    });
  }

  drawCountdown(now) {
    const ctx = this.ctx;
    const snapshot = this.game.getSnapshot(now);
    const step = snapshot.countdownStep || 1;
    const local = ((GAME_CONFIG.countdownMs - snapshot.remainingMs) % 1000) / 1000;
    const scale = 0.65 + easeOutCubic(local) * 0.55;
    ctx.save();
    ctx.translate(this.width / 2, this.height * 0.33);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,198,69,0.98)";
    ctx.shadowColor = "rgba(37,217,255,0.55)";
    ctx.shadowBlur = 32;
    ctx.font = `900 ${Math.max(96, this.width * 0.11)}px Arial`;
    ctx.fillText(String(step), 0, 0);
    ctx.restore();
  }

  drawResults(now) {
    const ctx = this.ctx;
    const snapshot = this.game.getSnapshot(now);
    ctx.fillStyle = "rgba(0,0,0,0.50)";
    ctx.fillRect(0, 0, this.width, this.height);

    const winner = snapshot.winner;
    const label = winner === 0 ? "EMPATE TOTAL" : `GANA ${winner}P`;
    ctx.textAlign = "center";
    ctx.fillStyle = winner === 1 ? "#25d9ff" : winner === 2 ? "#ffc645" : "#f4f7ff";
    ctx.font = `900 ${Math.max(40, this.width * 0.055)}px Arial`;
    ctx.fillText(label, this.width / 2, this.height * 0.28);

    ctx.fillStyle = "rgba(244,247,255,0.9)";
    ctx.font = `700 ${Math.max(22, this.width * 0.020)}px Arial`;
    ctx.fillText(`${formatScore(snapshot.players[0].score)}  VS  ${formatScore(snapshot.players[1].score)}`, this.width / 2, this.height * 0.36);

    drawImageContain(ctx, winner === 1 ? this.assets.medal1 : winner === 2 ? this.assets.medal2 : this.assets.medal3, this.width * 0.39, this.height * 0.40, this.width * 0.22, this.height * 0.2, 0.96);

    ctx.fillStyle = "rgba(255,198,69,0.96)";
    ctx.font = `700 ${Math.max(18, this.width * 0.018)}px Arial`;
    ctx.fillText("SPACE o click para otra ronda", this.width / 2, this.height * 0.84);
  }

  drawCalibrationOverlay(now) {
    const ctx = this.ctx;
    const layout = this.getLaneLayout();
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.20)";
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,198,69,0.98)";
    ctx.font = `900 ${Math.max(18, this.width * 0.016)}px Arial`;
    ctx.fillText("MODO CALIBRACIÓN · zonas activas para pies", layout.safe.x, layout.safe.y - 12);

    layout.lanes.forEach((laneObj) => {
      const meta = PLAYER_META[laneObj.player - 1];
      ctx.strokeStyle = meta.color;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(laneObj.x, layout.topY, laneObj.w, laneObj.padY + laneObj.padH - layout.topY);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      drawRoundedRect(ctx, laneObj.padX, laneObj.padY, laneObj.padW, laneObj.padH, laneObj.padH * 0.34, true, false);
      ctx.strokeStyle = meta.accent;
      ctx.lineWidth = 2.5;
      drawRoundedRect(ctx, laneObj.padX, laneObj.padY, laneObj.padW, laneObj.padH, laneObj.padH * 0.34, false, true);
      ctx.textAlign = "center";
      ctx.fillStyle = meta.accent;
      ctx.font = `800 ${Math.max(14, this.width * 0.012)}px Arial`;
      ctx.fillText(`${meta.label} / L${laneObj.lane + 1}`, laneObj.hitX, laneObj.padY - 10);
    });

    ctx.restore();
  }
}
