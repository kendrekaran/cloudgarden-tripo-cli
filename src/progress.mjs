export const SAVE_KEY = "cloudgarden.journey.v1";
export const GARDENS = ["dawn", "fern", "ember"];
export function readProgress(raw) {
  try {
    const s = JSON.parse(raw || "null");
    if (!s || s.version !== 1) throw 0;
    const awakened = [
      ...new Set(
        (Array.isArray(s.awakened) ? s.awakened : []).filter((x) =>
          GARDENS.includes(x),
        ),
      ),
    ];
    return {
      version: 1,
      awakened,
      completed: awakened.length === 3 && s.completed === true,
    };
  } catch {
    return { version: 1, awakened: [], completed: false };
  }
}
export function activate(progress, id) {
  if (id === "home")
    return { ...progress, completed: progress.awakened.length === 3 };
  if (!GARDENS.includes(id) || progress.awakened.includes(id)) return progress;
  return { ...progress, awakened: [...progress.awakened, id] };
}
export function distanceToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax,
    dz = bz - az,
    l = dx * dx + dz * dz;
  const t = l
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l))
    : 0;
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}
