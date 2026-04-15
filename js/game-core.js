import { GAME_CONFIG, PLAYER_META, NOTE_ASSETS } from "./config.js";
import { clamp, hashSeed, mulberry32 } from "./utils.js";

function createPlayer(meta) {
  return {
    id: meta.id,
    label: meta.label,
    score: 0,
    combo: 0,
    maxCombo: 0,
    streak: 0,
    multiplier: 1,
    hits: 0,
    misses: 0,
    lastHitLane: -1,
    feedback: "",
    feedbackColor: "#f4f7ff",
    feedbackUntil: 0,
    pulseUntil: 0,
    laneFlash: new Array(GAME_CONFIG.lanesPerPlayer).fill(0),
    lastInputAt: new Array(GAME_CONFIG.lanesPerPlayer).fill(-1e9),
  };
}

function withJudgementState(note) {
  return {
    ...note,
    judged: false,
    hit: false,
  };
}

export class GameCore {
  constructor({ sessionId, assets, audio, relay, inputMode = GAME_CONFIG.inputMode }) {
    this.sessionId = sessionId;
    this.assets = assets;
    this.audio = audio;
    this.relay = relay;
    this.inputMode = inputMode;
    this.state = "idle";
    this.startedAt = 0;
    this.gameplayStartedAt = 0;
    this.endedAt = 0;
    this.players = PLAYER_META.map((meta) => createPlayer(meta));
    this.highScore = Number(localStorage.getItem("jimador-high-score") || 0);
    this.snapshotCache = null;
    this.lastBroadcastAt = 0;
    this.winner = null;
    this.countdownStep = 3;
    this.seed = hashSeed(sessionId || "default-session");
    this.rand = mulberry32(this.seed);
    this.calibrationMode = false;
    this.durationMs = GAME_CONFIG.defaultDurationMs;
    this.trackMeta = {
      hasTrack: false,
      name: "Demo interno",
      bpmApprox: 120,
      peakCount: 0,
    };
    this.chart = this._buildFallbackChart();
  }

  _buildFallbackChart() {
    const chart = [];
    const rand = mulberry32(this.seed + 42);
    let noteId = 0;
    const baseStep = 420;

    for (let time = 1500; time <= this.durationMs - 900; time += baseStep) {
      for (let playerIndex = 0; playerIndex < GAME_CONFIG.playerCount; playerIndex += 1) {
        const lane = Math.floor(rand() * GAME_CONFIG.lanesPerPlayer);
        chart.push(withJudgementState({
          id: ++noteId,
          player: playerIndex,
          lane,
          time,
          assetKey: NOTE_ASSETS[(noteId + lane) % NOTE_ASSETS.length],
        }));
      }
    }

    return chart;
  }

  setTrack(trackData) {
    if (!trackData || !Array.isArray(trackData.chart) || !trackData.chart.length) {
      this.durationMs = GAME_CONFIG.defaultDurationMs;
      this.trackMeta = {
        hasTrack: false,
        name: "Demo interno",
        bpmApprox: 120,
        peakCount: 0,
      };
      this.chart = this._buildFallbackChart();
      this.reset();
      return;
    }

    this.durationMs = Math.max(18000, trackData.durationMs || GAME_CONFIG.defaultDurationMs);
    this.trackMeta = {
      hasTrack: true,
      name: trackData.name || "Track cargado",
      bpmApprox: trackData.bpmApprox || 120,
      peakCount: trackData.peakCount || trackData.chart.length,
    };
    this.chart = trackData.chart.map((note) => withJudgementState(note));
    this.reset();
  }

  setInputMode(mode) {
    this.inputMode = mode;
  }

  setCalibrationMode(value) {
    this.calibrationMode = Boolean(value);
  }

  reset() {
    this.state = "idle";
    this.startedAt = 0;
    this.gameplayStartedAt = 0;
    this.endedAt = 0;
    this.winner = null;
    this.countdownStep = 3;
    this.players = PLAYER_META.map((meta) => createPlayer(meta));
    this.chart.forEach((note) => {
      note.judged = false;
      note.hit = false;
    });
  }

  start(now) {
    this.reset();
    this.state = "countdown";
    this.startedAt = now;
    this.audio?.start();
  }

  startIfIdle(now) {
    if (this.state === "idle" || this.state === "results") {
      this.start(now);
    }
  }

  hit(playerNumber, lane, now) {
    if (this.state !== "playing") return;
    const playerIndex = playerNumber - 1;
    const player = this.players[playerIndex];
    if (!player || lane < 0 || lane >= GAME_CONFIG.lanesPerPlayer) return;

    if (now - player.lastInputAt[lane] < GAME_CONFIG.footDebounceMs) {
      return;
    }
    player.lastInputAt[lane] = now;

    const current = now - this.gameplayStartedAt;

    let bestNote = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const note of this.chart) {
      if (note.player !== playerIndex || note.lane !== lane || note.judged) continue;
      const delta = Math.abs(note.time - current);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestNote = note;
      }
      if (note.time > current + GAME_CONFIG.hitWindows.miss) break;
    }

    if (!bestNote || bestDelta > GAME_CONFIG.hitWindows.miss) {
      this._registerMiss(player, lane, now, false);
      return;
    }

    bestNote.judged = true;
    bestNote.hit = true;
    player.hits += 1;
    player.combo += 1;
    player.streak += 1;
    player.maxCombo = Math.max(player.maxCombo, player.combo);
    player.multiplier = clamp(1 + Math.floor(player.combo / 7), 1, 4);
    player.lastHitLane = lane;
    player.pulseUntil = now + 210;
    player.laneFlash[lane] = now + 220;

    let judgement = "good";
    let baseScore = 65;
    let feedbackColor = "#ffc645";

    if (bestDelta <= GAME_CONFIG.hitWindows.perfect) {
      judgement = "perfect";
      baseScore = 130;
      feedbackColor = "#25d9ff";
    } else if (bestDelta <= GAME_CONFIG.hitWindows.great) {
      judgement = "great";
      baseScore = 95;
      feedbackColor = "#7ce8ff";
    }

    player.score += baseScore * player.multiplier;
    player.feedback = `${judgement.toUpperCase()}  x${player.multiplier}`;
    player.feedbackColor = feedbackColor;
    player.feedbackUntil = now + 550;
    this.audio?.hit(judgement);
  }

  _registerMiss(player, lane, now, autoMiss = true) {
    player.misses += 1;
    player.combo = 0;
    player.multiplier = 1;
    player.feedback = autoMiss ? "LATE" : "MISS";
    player.feedbackColor = "#ff5377";
    player.feedbackUntil = now + 380;
    player.lastHitLane = lane;
    player.laneFlash[lane] = now + 120;
    if (!autoMiss) {
      this.audio?.miss();
    }
  }

  _processMisses(now) {
    const current = now - this.gameplayStartedAt;
    for (const note of this.chart) {
      if (note.judged) continue;
      if (current - note.time > GAME_CONFIG.hitWindows.miss) {
        note.judged = true;
        note.hit = false;
        this._registerMiss(this.players[note.player], note.lane, now, true);
      }
    }
  }

  update(now) {
    if (this.state === "countdown") {
      const elapsed = now - this.startedAt;
      const remaining = GAME_CONFIG.countdownMs - elapsed;
      const step = clamp(Math.ceil(remaining / 1000), 0, 3);
      if (step !== this.countdownStep && step > 0) {
        this.countdownStep = step;
        this.audio?.countdown(step);
      }
      if (elapsed >= GAME_CONFIG.countdownMs) {
        this.state = "playing";
        this.gameplayStartedAt = now;
      }
    } else if (this.state === "playing") {
      this._processMisses(now);
      if (now - this.gameplayStartedAt >= this.durationMs) {
        this.finish(now);
      }
    }
  }

  finish(now) {
    this.state = "results";
    this.endedAt = now;
    this.audio?.finish();
    const [p1, p2] = this.players;
    this.winner = p1.score === p2.score ? 0 : p1.score > p2.score ? 1 : 2;
    const best = Math.max(p1.score, p2.score);
    if (best > this.highScore) {
      this.highScore = best;
      localStorage.setItem("jimador-high-score", String(best));
    }
  }

  getVisibleNotes(now) {
    if (this.state === "idle" || this.state === "results") return [];
    const current = this.state === "countdown" ? -999 : now - this.gameplayStartedAt;
    return this.chart.filter((note) => !note.judged && note.time - current <= GAME_CONFIG.travelMs + 200);
  }

  getSnapshot(now) {
    const stateNow = this.state;
    const remainingMs =
      stateNow === "playing"
        ? Math.max(0, this.durationMs - (now - this.gameplayStartedAt))
        : stateNow === "countdown"
        ? Math.max(0, GAME_CONFIG.countdownMs - (now - this.startedAt))
        : 0;

    const players = this.players.map((player) => ({
      id: player.id,
      label: player.label,
      score: player.score,
      combo: player.combo,
      maxCombo: player.maxCombo,
      multiplier: player.multiplier,
      hits: player.hits,
      misses: player.misses,
      feedback: now <= player.feedbackUntil ? player.feedback : "",
      feedbackColor: player.feedbackColor,
      pulse: now <= player.pulseUntil,
    }));

    const leader = players[0].score === players[1].score ? 0 : players[0].score > players[1].score ? 1 : 2;
    return {
      state: stateNow,
      remainingMs,
      durationMs: this.durationMs,
      players,
      countdownStep: this.state === "countdown" ? this.countdownStep : 0,
      highScore: this.highScore,
      leader,
      winner: this.winner,
      inputMode: this.inputMode,
      trackName: this.trackMeta.name,
      hasTrack: this.trackMeta.hasTrack,
      bpmApprox: this.trackMeta.bpmApprox,
      peakCount: this.trackMeta.peakCount,
      calibrationMode: this.calibrationMode,
    };
  }

  maybeBroadcast(now) {
    if (!this.relay) return;
    const minGap = 1000 / GAME_CONFIG.fpsBroadcast;
    if (now - this.lastBroadcastAt < minGap) return;
    this.lastBroadcastAt = now;
    this.relay.send("state", this.getSnapshot(now));
  }
}
