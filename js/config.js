export const GAME_CONFIG = {
  title: "El Jimador x La Solar Rhythm Game",
  sessionPrefix: "jimador-solar-session",
  defaultDurationMs: 60000,
  countdownMs: 3200,
  travelMs: 1725,
  noteMinGapMs: 180,
  footDebounceMs: 155,
  hitWindows: {
    perfect: 85,
    great: 130,
    good: 180,
    miss: 260,
  },
  fpsBroadcast: 24,
  lanesPerPlayer: 3,
  playerCount: 2,
  playerAreaGapRatio: 0.08,
  laneGapRatio: 0.04,
  safeArea: {
    x: 0.055,
    y: 0.065,
    w: 0.89,
    h: 0.87,
  },
  colors: {
    cyan: "#25d9ff",
    cyanSoft: "#7ce8ff",
    blue: "#236dff",
    deepBlue: "#0b2578",
    gold: "#ffc645",
    orange: "#ff8536",
    pink: "#ff5bc7",
    white: "#f4f7ff",
    red: "#ff5377",
    bg: "#07020f",
    panel: "rgba(8, 6, 22, 0.74)",
  },
  inputMode: "mouse",
};

export const PLAYER_META = [
  { id: 1, label: "1P", keyMap: ["KeyA", "KeyS", "KeyD"], color: "#25d9ff", accent: "#59f2ff" },
  { id: 2, label: "2P", keyMap: ["KeyJ", "KeyK", "KeyL"], color: "#ffc645", accent: "#ffd97e" },
];

export const NOTE_ASSETS = [
  "coin",
  "bottle_note",
  "bottle_note_alt1",
  "bottle_note_alt2",
  "bottle_note_alt3",
  "bottle_note_alt4",
  "cocktail_note",
  "flamingo_note",
  "winner_sticker",
];

export function makeSessionId() {
  return `${GAME_CONFIG.sessionPrefix}-${Date.now().toString(36)}`;
}
