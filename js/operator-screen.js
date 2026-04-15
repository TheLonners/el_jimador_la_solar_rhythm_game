import { makeSessionId } from "./config.js";
import { RelayChannel } from "./relay.js";
import { formatScore } from "./utils.js";

export class OperatorScreen {
  constructor({ root, audio }) {
    this.root = root;
    this.audio = audio;
    this.sessionId = makeSessionId();
    this.relay = new RelayChannel(this.sessionId, "operator");
    this.floorWin = null;
    this.wallWin = null;
    this.state = null;
    this.floorConnected = false;
    this.wallConnected = false;
    this.calibrationMode = false;
    this.trackBuffer = null;
    this.trackNameValue = "Sin cargar";
    this.trackSent = false;

    this.el = {
      openSetup: root.querySelector("#open-setup"),
      openFloor: root.querySelector("#open-floor"),
      openWall: root.querySelector("#open-wall"),
      startGame: root.querySelector("#start-game"),
      restartGame: root.querySelector("#restart-game"),
      toggleAudio: root.querySelector("#toggle-audio"),
      toggleCalibration: root.querySelector("#toggle-calibration"),
      inputMode: root.querySelector("#input-mode"),
      trackFile: root.querySelector("#track-file"),
      trackName: root.querySelector("#track-name"),
      trackStatus: root.querySelector("#track-status"),
      trackSync: root.querySelector("#track-sync"),
      floorStatus: root.querySelector("#floor-status"),
      wallStatus: root.querySelector("#wall-status"),
      sessionLabel: root.querySelector("#session-label"),
      phaseLabel: root.querySelector("#phase-label"),
      previewP1: root.querySelector("#preview-p1"),
      previewP2: root.querySelector("#preview-p2"),
      leaderNote: root.querySelector("#leader-note"),
    };

    this.bind();
    this.refreshStatus();
    this.refreshTrackUi();
  }

  bind() {
    this.el.sessionLabel.textContent = this.sessionId;

    this.relay.onMessage((message) => {
      if (!message) return;

      if (message.type === "ready") {
        if (message.payload?.screen === "floor") {
          this.floorConnected = true;
          this.maybeSendTrackToFloor();
        }
        if (message.payload?.screen === "wall") this.wallConnected = true;
        this.refreshStatus();
        this.forwardToPeer(message);
      }

      if (message.type === "state") {
        this.state = message.payload;
        this.refreshFromState();
        this.forwardToPeer(message);
      }
    });

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.sessionId !== this.sessionId) return;
      if (data.role === "floor") {
        this.floorConnected = true;
        if (this.wallWin && !this.wallWin.closed) {
          this.wallWin.postMessage(data, "*");
        }
      }
      if (data.role === "wall") {
        this.wallConnected = true;
        if (this.floorWin && !this.floorWin.closed) {
          this.floorWin.postMessage(data, "*");
        }
      }
      this.refreshStatus();
    });

    this.el.openSetup.addEventListener("click", () => {
      this.openFloorWindow();
      this.openWallWindow();
    });

    this.el.openFloor.addEventListener("click", () => this.openFloorWindow());
    this.el.openWall.addEventListener("click", () => this.openWallWindow());

    this.el.startGame.addEventListener("click", () => {
      this.audio?.ensure?.();
      this.sendCommand("start");
    });

    this.el.restartGame.addEventListener("click", () => this.sendCommand("restart"));
    this.el.inputMode.addEventListener("change", () => this.sendCommand("setInputMode", { inputMode: this.el.inputMode.value }));

    this.el.toggleCalibration.addEventListener("click", () => {
      this.calibrationMode = !this.calibrationMode;
      this.el.toggleCalibration.textContent = `Calibración: ${this.calibrationMode ? "ON" : "OFF"}`;
      this.sendCommand("toggleCalibration", { value: this.calibrationMode });
    });

    this.el.toggleAudio.addEventListener("click", () => {
      const enabled = this.audio.toggle();
      this.el.toggleAudio.textContent = `Audio FX: ${enabled ? "ON" : "OFF"}`;
    });

    this.el.trackFile.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      this.trackNameValue = file.name;
      this.trackBuffer = await file.arrayBuffer();
      this.trackSent = false;
      this.refreshTrackUi("MP3 listo", this.floorConnected ? "Listo para enviar" : "Abre la ventana de piso");
      this.maybeSendTrackToFloor();
    });
  }

  baseUrl(screen) {
    return `${window.location.pathname}?screen=${screen}&session=${encodeURIComponent(this.sessionId)}&input=${encodeURIComponent(this.el.inputMode.value)}`;
  }

  openFloorWindow() {
    this.floorWin = window.open(this.baseUrl("floor"), "jimador_floor", "width=1580,height=900");
    setTimeout(() => this.maybeSendTrackToFloor(), 700);
  }

  openWallWindow() {
    this.wallWin = window.open(this.baseUrl("wall"), "jimador_wall", "width=1580,height=900");
  }

  sendCommand(action, payload = {}) {
    const message = {
      type: "command",
      payload: { action, ...payload, inputMode: this.el.inputMode.value },
      role: "operator",
      sessionId: this.sessionId,
      timestamp: Date.now(),
    };
    if (this.floorWin && !this.floorWin.closed) this.floorWin.postMessage(message, "*");
    if (this.wallWin && !this.wallWin.closed) this.wallWin.postMessage(message, "*");
    if (action === "restart") this.state = null;
    this.refreshStatus();
  }

  maybeSendTrackToFloor() {
    if (!this.trackBuffer || !this.floorWin || this.floorWin.closed) {
      this.refreshTrackUi();
      return;
    }

    const message = {
      type: "command",
      payload: {
        action: "loadTrack",
        name: this.trackNameValue,
        audioData: this.trackBuffer.slice(0),
        inputMode: this.el.inputMode.value,
      },
      role: "operator",
      sessionId: this.sessionId,
      timestamp: Date.now(),
    };
    this.floorWin.postMessage(message, "*");
    this.trackSent = true;
    this.refreshTrackUi("MP3 enviado", "Sincronizando piso…");
  }

  forwardToPeer(message) {
    if (message.role === "floor" && this.wallWin && !this.wallWin.closed) {
      this.wallWin.postMessage(message, "*");
    }
    if (message.role === "wall" && this.floorWin && !this.floorWin.closed) {
      this.floorWin.postMessage(message, "*");
    }
  }

  refreshStatus() {
    this.el.floorStatus.textContent = this.floorConnected ? "Conectado" : "No conectado";
    this.el.wallStatus.textContent = this.wallConnected ? "Conectado" : "No conectado";
    this.el.phaseLabel.textContent = this.state?.state || "Idle";
  }

  refreshTrackUi(statusText, syncText) {
    this.el.trackName.textContent = this.trackNameValue;
    this.el.trackStatus.textContent = statusText || (this.trackBuffer ? "MP3 cargado" : "Demo interno");
    if (syncText) {
      this.el.trackSync.textContent = syncText;
      return;
    }

    if (!this.trackBuffer) {
      this.el.trackSync.textContent = "Pendiente";
      return;
    }

    this.el.trackSync.textContent = this.trackSent ? "Enviado al piso" : this.floorConnected ? "Listo para enviar" : "Abre piso";
  }

  refreshFromState() {
    if (!this.state) return;
    this.el.phaseLabel.textContent = this.state.state;
    this.el.previewP1.textContent = formatScore(this.state.players?.[0]?.score || 0);
    this.el.previewP2.textContent = formatScore(this.state.players?.[1]?.score || 0);
    const leader = this.state.leader;
    this.el.leaderNote.textContent =
      leader === 0
        ? "Marcador empatado"
        : `Va ganando ${leader}P con ${formatScore(this.state.players[leader - 1].score)}`;

    if (this.state.trackName) {
      this.trackNameValue = this.state.trackName;
      this.el.trackName.textContent = this.state.trackName;
      if (this.state.hasTrack) {
        this.el.trackStatus.textContent = `${this.state.bpmApprox || 120} BPM aprox.`;
        this.el.trackSync.textContent = "Listo en piso";
      }
    }
  }
}
