export function parseQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    screen: params.get("screen") || "operator",
    session: params.get("session") || "",
    input: params.get("input") || "",
    autoplay: params.get("autoplay") === "1",
  };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutSine(t) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function formatScore(value) {
  return new Intl.NumberFormat("es-CO").format(Math.round(value || 0));
}

export function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fitRect(srcWidth, srcHeight, destWidth, destHeight) {
  const scale = Math.min(destWidth / srcWidth, destHeight / srcHeight);
  return {
    width: srcWidth * scale,
    height: srcHeight * scale,
  };
}

export function drawImageCover(ctx, img, x, y, w, h, alpha = 1) {
  if (!img) return;
  const iw = img.width;
  const ih = img.height;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

export function drawImageContain(ctx, img, x, y, w, h, alpha = 1) {
  if (!img) return;
  const fit = fitRect(img.width, img.height, w, h);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x + (w - fit.width) / 2, y + (h - fit.height) / 2, fit.width, fit.height);
  ctx.restore();
}

export function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawRoundedRect(ctx, x, y, w, h, r, fill = true, stroke = false) {
  roundedRectPath(ctx, x, y, w, h, r);
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

export function drawGlowCircle(ctx, x, y, radius, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  const [r, gCh, b] = hexToRgb(color);
  g.addColorStop(0, `rgba(${r}, ${gCh}, ${b}, ${0.45 * alpha})`);
  g.addColorStop(1, `rgba(${r}, ${gCh}, ${b}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((c) => c + c).join("")
    : normalized;
  const int = Number.parseInt(value, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export function safeAreaRect(width, height, safeArea) {
  return {
    x: width * safeArea.x,
    y: height * safeArea.y,
    w: width * safeArea.w,
    h: height * safeArea.h,
  };
}
