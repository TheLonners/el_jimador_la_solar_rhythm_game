import { GAME_CONFIG, NOTE_ASSETS } from "./config.js";
import { clamp } from "./utils.js";

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function buildReactiveChart(buffer, lanesPerPlayer = GAME_CONFIG.lanesPerPlayer, playerCount = GAME_CONFIG.playerCount) {
  const channelCount = Math.min(buffer.numberOfChannels || 1, 2);
  const channels = Array.from({ length: channelCount }, (_, i) => buffer.getChannelData(i));
  const sampleRate = buffer.sampleRate;
  const frameSize = 1024;
  const hop = 512;
  const energies = [];

  for (let offset = 0; offset + frameSize < buffer.length; offset += hop) {
    let sum = 0;
    for (let i = 0; i < frameSize; i += 1) {
      let sample = 0;
      for (let c = 0; c < channelCount; c += 1) {
        sample += Math.abs(channels[c][offset + i]);
      }
      sample /= channelCount;
      sum += sample * sample;
    }
    energies.push(Math.sqrt(sum / frameSize));
  }

  const flux = new Array(energies.length).fill(0);
  for (let i = 1; i < energies.length; i += 1) {
    flux[i] = Math.max(0, energies[i] - energies[i - 1]);
  }

  const maxFlux = Math.max(...flux, 0.001);
  const minimumFramesBetweenPeaks = Math.max(1, Math.round((GAME_CONFIG.noteMinGapMs / 1000) * sampleRate / hop));
  const peaks = [];
  let lastPeak = -9999;

  for (let i = 8; i < flux.length - 8; i += 1) {
    const local = flux.slice(i - 8, i);
    const threshold = mean(local) * 1.35 + maxFlux * 0.06;
    const isLocalMax = flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1] && flux[i] >= flux[i - 2] && flux[i] >= flux[i + 2];
    if (!isLocalMax || flux[i] < threshold || i - lastPeak < minimumFramesBetweenPeaks) continue;

    const timeMs = (i * hop / sampleRate) * 1000;
    if (timeMs < 850 || timeMs > buffer.duration * 1000 - 450) continue;
    peaks.push({ timeMs, strength: clamp(flux[i] / maxFlux, 0, 1) });
    lastPeak = i;
  }

  if (peaks.length < 24) {
    peaks.length = 0;
    const fallbackStep = 500;
    for (let timeMs = 1200; timeMs < buffer.duration * 1000 - 600; timeMs += fallbackStep) {
      peaks.push({ timeMs, strength: 0.5 });
    }
  }

  const intervals = [];
  for (let i = 1; i < peaks.length; i += 1) {
    intervals.push(peaks[i].timeMs - peaks[i - 1].timeMs);
  }
  const avgInterval = mean(intervals.filter(Boolean)) || 500;
  const bpmApprox = Math.round(clamp(60000 / avgInterval, 70, 180));

  const laneCursor = new Array(playerCount).fill(0);
  const lastByPlayer = new Array(playerCount).fill(-1e9);
  const chart = [];
  let noteId = 0;

  peaks.forEach((peak, index) => {
    let primaryPlayer = index % playerCount;
    if (peak.timeMs - lastByPlayer[primaryPlayer] < GAME_CONFIG.noteMinGapMs * 0.9) {
      primaryPlayer = (primaryPlayer + 1) % playerCount;
    }

    const primaryLane = laneCursor[primaryPlayer] % lanesPerPlayer;
    laneCursor[primaryPlayer] = (laneCursor[primaryPlayer] + 1 + (peak.strength > 0.72 ? 1 : 0)) % lanesPerPlayer;

    chart.push({
      id: ++noteId,
      player: primaryPlayer,
      lane: primaryLane,
      time: Math.round(peak.timeMs),
      assetKey: NOTE_ASSETS[(index + primaryLane) % NOTE_ASSETS.length],
      judged: false,
      hit: false,
    });
    lastByPlayer[primaryPlayer] = peak.timeMs;

    const wantsDual = peak.strength > 0.83 || index % 9 === 0;
    if (wantsDual) {
      const otherPlayer = (primaryPlayer + 1) % playerCount;
      if (peak.timeMs - lastByPlayer[otherPlayer] >= GAME_CONFIG.noteMinGapMs * 0.75) {
        const otherLane = (laneCursor[otherPlayer] + 1) % lanesPerPlayer;
        laneCursor[otherPlayer] = (otherLane + 1) % lanesPerPlayer;
        chart.push({
          id: ++noteId,
          player: otherPlayer,
          lane: otherLane,
          time: Math.round(peak.timeMs),
          assetKey: NOTE_ASSETS[(index + otherLane + 3) % NOTE_ASSETS.length],
          judged: false,
          hit: false,
        });
        lastByPlayer[otherPlayer] = peak.timeMs;
      }
    }
  });

  chart.sort((a, b) => a.time - b.time);

  return {
    chart,
    durationMs: Math.max(18000, Math.round(buffer.duration * 1000)),
    bpmApprox,
    peakCount: peaks.length,
  };
}

export class AudioEngine {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.masterGain = null;
    this.trackBuffer = null;
    this.trackSource = null;
    this.trackName = "Demo interno";
    this.trackStartedAt = 0;
    this.trackOffset = 0;
    this.trackPlaying = false;
    this.trackData = null;
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.84;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopTrack();
    }
    return this.enabled;
  }

  pulse(freq = 440, duration = 0.08, gainValue = 0.06, type = "square") {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.masterGain || ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  countdown(value) {
    this.pulse(520 + value * 55, 0.12, 0.055, "square");
  }

  hit(kind = "good") {
    const freq = kind === "perfect" ? 960 : kind === "great" ? 840 : 720;
    this.pulse(freq, 0.05, 0.05, "triangle");
  }

  miss() {
    this.pulse(180, 0.08, 0.05, "sawtooth");
  }

  start() {
    this.pulse(660, 0.08, 0.06, "triangle");
    setTimeout(() => this.pulse(880, 0.1, 0.05, "triangle"), 70);
  }

  finish() {
    this.pulse(880, 0.15, 0.06, "triangle");
    setTimeout(() => this.pulse(1180, 0.18, 0.05, "triangle"), 120);
  }

  async loadTrackFromArrayBuffer(arrayBuffer, name = "track.mp3") {
    const ctx = this.ensure();
    if (!ctx || !arrayBuffer) return null;
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    this.trackBuffer = decoded;
    this.trackName = name;
    this.trackData = {
      ...buildReactiveChart(decoded),
      name,
      hasTrack: true,
    };
    this.trackOffset = 0;
    return this.trackData;
  }

  hasTrack() {
    return Boolean(this.trackBuffer && this.trackData);
  }

  startTrack() {
    const ctx = this.ensure();
    if (!ctx || !this.enabled || !this.trackBuffer) return false;
    this.stopTrack();
    const source = ctx.createBufferSource();
    source.buffer = this.trackBuffer;
    source.connect(this.masterGain || ctx.destination);
    source.onended = () => {
      if (this.trackSource === source) {
        this.trackPlaying = false;
        this.trackOffset = 0;
        this.trackSource = null;
      }
    };
    this.trackSource = source;
    this.trackStartedAt = ctx.currentTime;
    this.trackPlaying = true;
    source.start();
    return true;
  }

  stopTrack() {
    if (this.trackSource) {
      try {
        this.trackSource.stop();
      } catch (error) {
        // noop
      }
      this.trackSource.disconnect?.();
      this.trackSource = null;
    }
    this.trackPlaying = false;
    this.trackOffset = 0;
  }

  getTrackSummary() {
    if (!this.trackData) {
      return {
        hasTrack: false,
        name: "Demo interno",
        durationMs: GAME_CONFIG.defaultDurationMs,
        bpmApprox: 120,
      };
    }
    return {
      hasTrack: true,
      name: this.trackData.name,
      durationMs: this.trackData.durationMs,
      bpmApprox: this.trackData.bpmApprox,
      peakCount: this.trackData.peakCount,
    };
  }
}
