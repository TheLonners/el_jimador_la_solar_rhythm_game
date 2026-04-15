const ASSET_MAP = {
  startScreen: "./assets/backgrounds/start_screen_full.png",
  resultsScreen: "./assets/backgrounds/results_screen_full.png",
  floorGameplayBg: "./assets/backgrounds/floor_gameplay_bg.png",
  wallGameplayBg: "./assets/backgrounds/wall_gameplay_bg.png",
  jimadorLogo: "./assets/logos/el_jimador_logo.png",
  laSolarLogo: "./assets/logos/la_solar_logo.png",
  pressStart: "./assets/ui/press_start.png",
  highScore: "./assets/ui/high_score.png",
  insertCoin: "./assets/ui/insert_coin.png",
  medal1: "./assets/sprites/medal_1.png",
  medal2: "./assets/sprites/medal_2.png",
  medal3: "./assets/sprites/medal_3.png",
  coin: "./assets/sprites/coin.png",
  bottle_note: "./assets/sprites/bottle_note.png",
  bottle_note_alt1: "./assets/sprites/bottle_note_alt1.png",
  bottle_note_alt2: "./assets/sprites/bottle_note_alt2.png",
  bottle_note_alt3: "./assets/sprites/bottle_note_alt3.png",
  bottle_note_alt4: "./assets/sprites/bottle_note_alt4.png",
  cocktail_note: "./assets/sprites/cocktail_note.png",
  flamingo_note: "./assets/sprites/flamingo_note.png",
  fiesta_latina_logo: "./assets/sprites/fiesta_latina_logo.png",
  winner_sticker: "./assets/sprites/winner_sticker.png",
  hitGlow: "./assets/effects/hit_glow.png",
  pulseRing: "./assets/effects/pulse_ring.png",
  sparkBurst: "./assets/effects/spark_burst.png",
};

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function loadAssets() {
  const entries = await Promise.all(
    Object.entries(ASSET_MAP).map(async ([key, src]) => [key, await loadImage(src)])
  );
  return Object.fromEntries(entries);
}
