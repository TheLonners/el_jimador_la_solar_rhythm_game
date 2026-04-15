import { loadAssets } from "./assets.js";
import { AudioEngine } from "./audio.js";
import { RelayChannel } from "./relay.js";
import { parseQuery } from "./utils.js";
import { FloorScreen } from "./floor-screen.js";
import { WallScreen } from "./wall-screen.js";
import { OperatorScreen } from "./operator-screen.js";
import { makeSessionId as createSessionId } from "./config.js";

async function init() {
  const query = parseQuery();
  const assets = await loadAssets();
  const audio = new AudioEngine();
  const sessionId = query.session || createSessionId();

  const operatorEl = document.getElementById("operator-screen");
  const floorCanvas = document.getElementById("floor-canvas");
  const wallCanvas = document.getElementById("wall-canvas");

  if (query.screen === "floor") {
    floorCanvas.classList.remove("hidden");
    const relay = new RelayChannel(sessionId, "floor");
    const screen = new FloorScreen({
      canvas: floorCanvas,
      assets,
      relay,
      audio,
      sessionId,
      inputMode: query.input || "mouse",
    });
    screen.start();
    return;
  }

  if (query.screen === "wall") {
    wallCanvas.classList.remove("hidden");
    const relay = new RelayChannel(sessionId, "wall");
    const screen = new WallScreen({
      canvas: wallCanvas,
      assets,
      relay,
      sessionId,
    });
    screen.start();
    return;
  }

  operatorEl.classList.remove("hidden");
  new OperatorScreen({ root: operatorEl, audio });
}

init();
