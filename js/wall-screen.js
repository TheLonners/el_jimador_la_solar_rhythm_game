import { GAME_CONFIG, PLAYER_META } from "./config.js";
import {
  clamp,
  drawGlowCircle,
  drawImageContain,
  drawImageCover,
  drawRoundedRect,
  formatScore,
  formatTime,
  safeAreaRect,
} from "./utils.js";

export class WallScreen {
  constructor({ canvas, assets, relay, sessionId }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.assets = assets;
    this.relay = relay;
    this.sessionId = sessionId;
    this.snapshot = {
      state: "idle",
      remainingMs: 0,
      durationMs: GAME_CONFIG.defaultDurationMs,
      players: [
        { id: 1, label: "1P", score: 0, combo: 0, multiplier: 1, feedback: "" },
        { id: 2, label: "2P", score: 0, combo: 0, multiplier: 1, feedback: "" },
      ],
      countdownStep: 0,
      highScore: 0,
      leader: 0,
      winner: null,
      inputMode: "mouse",
      trackName: "Demo interno",
      hasTrack: false,
      bpmApprox: 120,
      calibrationMode: false,
    };
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.width = 0;
    this.height = 0;
    this.running = false;

    this.relay?.onMessage((message) => this.onRelayMessage(message));
    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  start() {
    this.running = true;
    this.relay?.send("ready", { screen: "wall" });
    requestAnimationFrame((now) => this.tick(now));
  }

  tick(now) {
    if (!this.running) return;
    this.render(now);
    requestAnimationFrame((next) => this.tick(next));
  }

  onRelayMessage(message) {
    if (!message) return;
    if (message.type === "state") {
      this.snapshot = { ...this.snapshot, ...message.payload };
    } else if (message.type === "command" && message.payload?.action === "restart") {
      this.snapshot = {
        ...this.snapshot,
        state: "idle",
        players: this.snapshot.players.map((player) => ({ ...player, score: 0, combo: 0, multiplier: 1, feedback: "" })),
      };
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  render(now) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (this.snapshot.state === "idle") {
      this.drawIdle(now);
      return;
    }

    if (this.snapshot.state === "results") {
      this.drawResults(now);
      return;
    }

    this.drawGameplay(now);
  }

  drawIdle(now) {
    const ctx = this.ctx;
    drawImageCover(ctx, this.assets.startScreen, 0, 0, this.width, this.height, 1);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, this.width, this.height);

    const safe = safeAreaRect(this.width, this.height, GAME_CONFIG.safeArea);
    const pulse = 0.97 + Math.sin(now * 0.004) * 0.015;
    drawImageContain(ctx, this.assets.jimadorLogo, safe.x + safe.w * 0.28, safe.y + safe.h * 0.16, safe.w * 0.42 * pulse, safe.h * 0.24 * pulse, 1);
    drawImageContain(ctx, this.assets.laSolarLogo, safe.x + safe.w * 0.40, safe.y + safe.h * 0.60, safe.w * 0.22, safe.h * 0.12, 1);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(244,247,255,0.96)";
    ctx.font = `900 ${Math.max(34, this.width * 0.042)}px Arial`;
    ctx.fillText("PANTALLA DE PARED", this.width / 2, safe.y + safe.h * 0.12);
    ctx.font = `700 ${Math.max(18, this.width * 0.018)}px Arial`;
    ctx.fillStyle = "rgba(255,198,69,0.98)";
    ctx.fillText("Esperando señal del operador…", this.width / 2, safe.y + safe.h * 0.88);
  }

  drawGameplay(now) {
    const ctx = this.ctx;
    const snap = this.snapshot;
    const safe = safeAreaRect(this.width, this.height, GAME_CONFIG.safeArea);

    drawImageCover(ctx, this.assets.wallGameplayBg || this.assets.startScreen, 0, 0, this.width, this.height, 1);
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(0, 0, this.width, this.height);

    drawImageContain(ctx, this.assets.jimadorLogo, safe.x + safe.w * 0.33, safe.y - safe.h * 0.01, safe.w * 0.18, safe.h * 0.12, 0.96);
    drawImageContain(ctx, this.assets.laSolarLogo, safe.x + safe.w * 0.82, safe.y, safe.w * 0.11, safe.h * 0.07, 0.96);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(37,217,255,0.95)";
    ctx.font = `900 ${Math.max(18, this.width * 0.017)}px Arial`;
    ctx.fillText("HIGH SCORE", this.width / 2, safe.y + safe.h * 0.03);

    ctx.fillStyle = "rgba(244,247,255,0.96)";
    ctx.font = `900 ${Math.max(24, this.width * 0.023)}px Arial`;
    ctx.fillText(formatScore(snap.highScore), this.width / 2, safe.y + safe.h * 0.08);

    const timerText = snap.state === "countdown" ? String(snap.countdownStep || 1) : formatTime(snap.remainingMs);
    const timerScale = snap.state === "countdown" ? 0.95 + Math.sin(now * 0.012) * 0.08 : 1;
    ctx.save();
    ctx.translate(this.width / 2, safe.y + safe.h * 0.23);
    ctx.scale(timerScale, timerScale);
    ctx.fillStyle = "rgba(255,198,69,0.99)";
    ctx.font = `900 ${Math.max(52, this.width * 0.06)}px Arial`;
    ctx.fillText(timerText, 0, 0);
    ctx.restore();

    ctx.fillStyle = "rgba(244,247,255,0.86)";
    ctx.font = `700 ${Math.max(16, this.width * 0.013)}px Arial`;
    ctx.fillText(snap.trackName || "Demo interno", this.width / 2, safe.y + safe.h * 0.29);

    const cardY = safe.y + safe.h * 0.36;
    const cardW = safe.w * 0.28;
    const cardH = safe.h * 0.34;
    const x1 = safe.x + safe.w * 0.06;
    const x2 = safe.x + safe.w * 0.66;

    this.drawPlayerCard(x1, cardY, cardW, cardH, snap.players[0], PLAYER_META[0], snap.leader === 1, now);
    this.drawPlayerCard(x2, cardY, cardW, cardH, snap.players[1], PLAYER_META[1], snap.leader === 2, now);

    ctx.fillStyle = "rgba(244,247,255,0.88)";
    ctx.font = `900 ${Math.max(26, this.width * 0.032)}px Arial`;
    ctx.fillText("VS", this.width / 2, safe.y + safe.h * 0.56);

    const leadLabel = snap.leader === 0 ? "Van empatados" : `Va ganando ${snap.leader}P`;
    ctx.fillStyle = snap.leader === 1 ? "#25d9ff" : snap.leader === 2 ? "#ffc645" : "rgba(244,247,255,0.96)";
    ctx.font = `800 ${Math.max(16, this.width * 0.016)}px Arial`;
    ctx.fillText(leadLabel, this.width / 2, safe.y + safe.h * 0.66);

    const meterW = safe.w * 0.32;
    const leadRatio = snap.players[0].score + snap.players[1].score <= 0
      ? 0.5
      : clamp(snap.players[0].score / (snap.players[0].score + snap.players[1].score), 0, 1);
    const meterX = this.width / 2 - meterW / 2;
    const meterY = safe.y + safe.h * 0.70;
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    drawRoundedRect(ctx, meterX, meterY, meterW, 18, 999, true, false);
    ctx.fillStyle = "#25d9ff";
    drawRoundedRect(ctx, meterX, meterY, meterW * leadRatio, 18, 999, true, false);
    ctx.fillStyle = "#ffc645";
    drawRoundedRect(ctx, meterX + meterW * leadRatio, meterY, meterW * (1 - leadRatio), 18, 999, true, false);

    ctx.fillStyle = "rgba(244,247,255,0.76)";
    ctx.font = `700 ${Math.max(14, this.width * 0.012)}px Arial`;
    const modeLabel = snap.inputMode === "sensor" ? "Sensor / pies" : "Mouse / touch test";
    const trackBadge = snap.hasTrack ? `MP3 reactivo · ${snap.bpmApprox} BPM aprox.` : "Demo sin MP3";
    ctx.fillText(`${modeLabel} · ${trackBadge}`, this.width / 2, safe.y + safe.h * 0.80);

    if (snap.calibrationMode) {
      ctx.fillStyle = "rgba(255,198,69,0.96)";
      ctx.font = `800 ${Math.max(14, this.width * 0.012)}px Arial`;
      ctx.fillText("Calibración visual activa en piso", this.width / 2, safe.y + safe.h * 0.85);
    }
  }

  drawPlayerCard(x, y, w, h, player, meta, isLeader, now) {
    const ctx = this.ctx;
    const pulse = isLeader ? 0.975 + Math.sin(now * 0.01) * 0.025 : 1;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(pulse, pulse);
    ctx.translate(-(x + w / 2), -(y + h / 2));

    ctx.fillStyle = "rgba(10, 10, 22, 0.82)";
    ctx.strokeStyle = isLeader ? meta.color : "rgba(255,255,255,0.10)";
    ctx.lineWidth = isLeader ? 3 : 1.5;
    drawRoundedRect(ctx, x, y, w, h, 26, true, true);
    if (isLeader) {
      drawGlowCircle(ctx, x + w * 0.5, y + h * 0.5, w * 0.42, meta.color, 0.8);
    }

    ctx.fillStyle = meta.color;
    ctx.font = `900 ${Math.max(22, this.width * 0.020)}px Arial`;
    ctx.textAlign = "left";
    ctx.fillText(player.label, x + 24, y + 38);

    ctx.fillStyle = "rgba(244,247,255,0.96)";
    ctx.font = `900 ${Math.max(34, this.width * 0.034)}px Arial`;
    ctx.fillText(formatScore(player.score), x + 24, y + 92);

    ctx.fillStyle = "rgba(244,247,255,0.74)";
    ctx.font = `700 ${Math.max(16, this.width * 0.013)}px Arial`;
    ctx.fillText(`Combo ${player.combo}`, x + 24, y + 132);
    ctx.fillText(`Multiplicador x${player.multiplier}`, x + 24, y + 160);

    if (player.feedback) {
      ctx.fillStyle = player.feedbackColor || meta.color;
      ctx.font = `900 ${Math.max(22, this.width * 0.018)}px Arial`;
      ctx.fillText(player.feedback, x + 24, y + h - 30);
    }

    const art = meta.id === 1 ? this.assets.medal1 : this.assets.medal2;
    drawImageContain(ctx, art, x + w * 0.60, y + h * 0.12, w * 0.28, h * 0.30, 0.92);
    ctx.restore();
  }

  drawResults(now) {
    const ctx = this.ctx;
    const snap = this.snapshot;
    drawImageCover(ctx, this.assets.resultsScreen, 0, 0, this.width, this.height, 1);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, this.width, this.height);

    const winner = snap.winner;
    const winnerLabel = winner === 0 ? "EMPATE TOTAL" : `JUGADOR ${winner}`;
    const winnerColor = winner === 1 ? "#25d9ff" : winner === 2 ? "#ffc645" : "#f4f7ff";

    ctx.textAlign = "center";
    ctx.fillStyle = winnerColor;
    ctx.font = `900 ${Math.max(38, this.width * 0.05)}px Arial`;
    ctx.fillText(winnerLabel, this.width / 2, this.height * 0.11);

    drawImageContain(ctx, winner === 1 ? this.assets.medal1 : winner === 2 ? this.assets.medal2 : this.assets.medal3, this.width * 0.39, this.height * 0.15, this.width * 0.22, this.height * 0.18, 0.96);

    ctx.fillStyle = "rgba(244,247,255,0.96)";
    ctx.font = `900 ${Math.max(24, this.width * 0.026)}px Arial`;
    ctx.fillText(`${formatScore(snap.players[0].score)}  ·  ${formatScore(snap.players[1].score)}`, this.width / 2, this.height * 0.30);

    drawImageContain(ctx, this.assets.jimadorLogo, this.width * 0.31, this.height * 0.77, this.width * 0.18, this.height * 0.10, 0.92);
    drawImageContain(ctx, this.assets.laSolarLogo, this.width * 0.52, this.height * 0.78, this.width * 0.14, this.height * 0.08, 0.96);

    ctx.fillStyle = "rgba(255,198,69,0.96)";
    ctx.font = `700 ${Math.max(16, this.width * 0.015)}px Arial`;
    ctx.fillText("Listo para otra ronda 🎮", this.width / 2, this.height * 0.90);
  }
}
