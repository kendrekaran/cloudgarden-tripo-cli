import * as T from "three";
import { loadAssets, windUniform } from "./assets";
import { GardenWorld, type GardenShrine } from "./world";
import { Player } from "./player";
import { ISLANDS } from "./config";
import { readProgress, activate, SAVE_KEY } from "./progress.mjs";
import "./style.css";
import { GardenAudio } from "./audio";
const sound = new GardenAudio();
const el = <E extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as E;
const canvas = el<HTMLCanvasElement>("world");
let renderer: T.WebGLRenderer, world: GardenWorld, player: Player;
const scene = new T.Scene(),
  camera = new T.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 3000);
let mode: "menu" | "playing" | "pause" | "ending" = "menu",
  ready = false,
  low = false,
  toastTimer = 0,
  currentShrine: GardenShrine | undefined,
  lastSave = 0;
let progress = readProgress(safeRead(SAVE_KEY));
const frames: number[] = [];
let frameCount = 0,
  lastFrame = performance.now(),
  elapsed = 0,
  rendered = 0;
function safeRead(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    toast("Your browser could not save this journey.");
  }
}
function toast(message: string) {
  el("toast").textContent = message;
  el("toast").style.opacity = "1";
  toastTimer = 6;
}
function showError(error: unknown) {
  console.error(error);
  el("error").hidden = false;
  el("error-message").textContent =
    error instanceof Error ? error.message : String(error);
}
function updateQuest() {
  const count = progress.awakened.length;
  el("quest-count").textContent = `${count} / 3`;
  document
    .querySelectorAll(".quest-dots i")
    .forEach((dot, i) => dot.classList.toggle("active", i < count));
  el("objective-title").textContent = progress.completed
    ? "The gardens are yours"
    : count === 3
      ? "Return to the heart of the meadow"
      : "Wake the sleeping gardens";
  el("objective-detail").textContent = progress.completed
    ? "Keep wandering. Take the long way home."
    : count === 3
      ? "The home shrine is waiting for you."
      : "Follow the old bridges. Find the amber stones.";
  if (world)
    for (const s of world.shrines)
      s.active =
        s.id === "home" ? progress.completed : progress.awakened.includes(s.id);
}
function setMode(next: typeof mode) {
  mode = next;
  el("menu").hidden = next !== "menu";
  el("hud").hidden = next === "menu";
  el("pause").hidden = next !== "pause";
  el("ending").hidden = next !== "ending";
  document.body.classList.toggle("playing", next !== "menu");
  player?.clear();
  if (next !== "playing" && document.pointerLockElement)
    document.exitPointerLock();
}
async function lockPointer() {
  try {
    await canvas.requestPointerLock();
  } catch {
    /* Drag-to-look remains available when pointer lock is denied. */
  }
}
function start() {
  if (!ready) return;
  setMode("playing");
  sound.start();
  player.updateCamera(1);
  void lockPointer();
  toast(
    progress.completed
      ? "Welcome back to your garden."
      : "Three sleeping gardens.\nFollow the bridges, and listen to the wind.",
  );
}
function toggleQuality() {
  low = !low;
  try {
    localStorage.setItem("cloudgarden.quality", low ? "low" : "high");
  } catch {}
  applyQuality();
}
function applyQuality() {
  if (renderer) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, low ? 1 : 1.5));
    renderer.setSize(innerWidth, innerHeight, false);
  }
  world?.setQuality(low);
  el("quality").textContent = `Detail: ${low ? "Gentle" : "High"}`;
  el("menu-quality").textContent = `DETAIL: ${low ? "GENTLE" : "HIGH"}`;
}
function interact() {
  if (mode !== "playing" || !currentShrine) return;
  const s = currentShrine;
  if (s.id === "home" && progress.awakened.length < 3) {
    toast(
      "Three distant gardens are still dreaming.\nFollow the wooden bridges.",
    );
    return;
  }
  if (s.active) {
    toast(s.id === "home" ? "The meadow feels like home." : s.message);
    return;
  }
  progress = activate(progress, s.id);
  sound.chime();
  save();
  updateQuest();
  toast(s.message);
  if (progress.completed) setMode("ending");
}
el("start").onclick = start;
el("resume").onclick = () => {
  setMode("playing");
  void lockPointer();
};
el("pause-button").onclick = () => setMode("pause");
el("keep-playing").onclick = () => {
  setMode("playing");
  void lockPointer();
};
el("sound").onclick = () => {
  sound.toggle();
  el("sound").textContent = `Sound: ${sound.muted ? "Off" : "On"}`;
};
el("quality").onclick = toggleQuality;
el("menu-quality").onclick = toggleQuality;
let restartArmed = false;
el("restart").onclick = () => {
  if (!restartArmed) {
    restartArmed = true;
    el("restart").textContent = "Reset saved progress? Click again";
    setTimeout(() => {
      restartArmed = false;
      el("restart").textContent = "Start a new journey";
    }, 4000);
    return;
  }
  progress = readProgress(null);
  save();
  updateQuest();
  player.reset();
  setMode("playing");
  void lockPointer();
  restartArmed = false;
  el("restart").textContent = "Start a new journey";
  toast("A new morning in the meadow.");
};
addEventListener("keydown", (e) => {
  if (
    ["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ArrowUp", "ArrowDown"].includes(
      e.code,
    ) &&
    mode === "playing"
  )
    e.preventDefault();
  if (e.code === "Escape") {
    if (mode === "playing") setMode("pause");
    else if (mode === "pause") {
      setMode("playing");
      void lockPointer();
    }
    return;
  }
  if (mode === "playing") {
    player?.keys.add(e.code);
    if (e.code === "KeyE" && !e.repeat) interact();
  }
});
addEventListener("keyup", (e) => player?.keys.delete(e.code));
let dragging = false;
canvas.addEventListener("mousedown", () => {
  if (mode === "playing") {
    dragging = true;
    void lockPointer();
  }
});
addEventListener("mouseup", () => (dragging = false));
addEventListener("mousemove", (e) => {
  if (
    mode === "playing" &&
    (document.pointerLockElement === canvas || dragging)
  )
    player?.look(e.movementX, e.movementY);
});
canvas.addEventListener(
  "wheel",
  (e) => {
    if (mode === "playing") {
      e.preventDefault();
      player.distance = T.MathUtils.clamp(
        player.distance + e.deltaY * 0.005,
        3.4,
        9,
      );
    }
  },
  { passive: false },
);
document.addEventListener("pointerlockchange", () => {
  if (!document.pointerLockElement && mode === "playing") setMode("pause");
});
addEventListener("blur", () => {
  if (mode === "playing") setMode("pause");
  player?.clear();
});
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer?.setSize(innerWidth, innerHeight, false);
});
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  setMode("pause");
  showError(
    new Error(
      "The graphics connection was interrupted. Reload to resume your saved journey.",
    ),
  );
});
async function init() {
  try {
    renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    low = safeRead("cloudgarden.quality") === "low";
    applyQuality();
    const assets = await loadAssets((n, label) => {
      el("load-bar").style.width = `${n * 88}%`;
      el("load-label").textContent =
        `Preparing ${label.replaceAll("-", " ")} · ${Math.round(n * 100)}%`;
    });
    el("load-label").textContent = "Planting the meadow…";
    await new Promise((r) => setTimeout(r, 50));
    world = new GardenWorld(scene, assets);
    player = new Player(world, camera, assets);
    applyQuality();
    updateQuest();
    camera.position.set(13, 6, 28);
    camera.lookAt(-6, 2, 2);
    await renderer.compileAsync(scene, camera);
    ready = true;
    el<HTMLButtonElement>("start").disabled = false;
    el("start-label").textContent = progress.awakened.length
      ? "Continue your journey"
      : "Begin wandering";
    el("load-bar").style.width = "100%";
    el("load-label").textContent = "YOUR LITTLE WORLD IS READY";
    // Read-only diagnostics for QA and performance reporting. No player teleport or quest shortcuts.
    Object.defineProperty(window, "cloudgarden", {
      value: {
        get state() {
          return {
            build: "grounded-stride-v2",
            mode,
            position: player.position.toArray(),
            yaw: player.yaw,
            pitch: player.pitch,
            progress: JSON.parse(JSON.stringify(progress)),
            nearShrine: currentShrine?.id,
            animations: [...player.actions.keys()],
            motion: {
              name: player.current,
              phase: player.actions.get(player.current)?.time,
              hips: player.model.getObjectByName("mixamorigHips")?.position.toArray(),
            },
            quality: low ? "gentle" : "high",
            fps: frames.length
              ? Math.round(
                  1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
                )
              : 0,
            drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            assetCount: assets.size,
            bridges: world.bridges.map((b) => ({ ...b })),
            shrinePositions: world.shrines.map((s) => ({
              id: s.id,
              position: s.position.toArray(),
            })),
          };
        },
      },
    });
    requestAnimationFrame(frame);
  } catch (error) {
    showError(error);
  }
}
function frame(now: number) {
  requestAnimationFrame(frame);
  const raw = (now - lastFrame) / 1000,
    dt = Math.min(raw, 0.05);
  lastFrame = now;
  elapsed += dt;
  frameCount++;
  if (frameCount > 60 && raw < 1) {
    frames.push(raw * 1000);
    if (frames.length > 180) frames.shift();
  }
  windUniform.value = elapsed;
  world.update(elapsed, player.position);
  if (mode === "menu") {
    camera.position.set(
      13 + Math.sin(elapsed * 0.035) * 2,
      6.5,
      28 + Math.cos(elapsed * 0.035),
    );
    camera.lookAt(-6, 1.8, 2);
    player.mixer.update(dt);
  } else {
    if (player.update(dt, mode === "playing"))
      toast("The wind brings you safely back.");
    player.updateCamera(dt);
  }
  if (mode === "playing") {
    sound.update(elapsed);
    currentShrine = world.shrines.find(
      (s) =>
        Math.hypot(
          player.position.x - s.position.x,
          player.position.z - s.position.z,
        ) < 4.3,
    );
    el("interact").hidden = !currentShrine;
    if (currentShrine)
      el("interact-text").textContent = currentShrine.active
        ? "Listen to the garden"
        : currentShrine.id === "home"
          ? progress.awakened.length === 3
            ? "Wake the heart of the meadow"
            : "Listen to the sleeping stone"
          : "Awaken " + currentShrine.name.toLowerCase();
    const island = ISLANDS.find(
      (i) => Math.hypot(player.position.x - i.x, player.position.z - i.z) < i.r,
    );
    el("location-name").textContent = island
      ? island.name.toUpperCase()
      : "BETWEEN EARTH AND SKY";
    const angle = ((((player.yaw * 180) / Math.PI) % 360) + 360) % 360;
    el("bearing").textContent = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
      Math.round(angle / 45) % 8
    ];
    if (elapsed - lastSave > 15) {
      save();
      lastSave = elapsed;
    }
  }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) el("toast").style.opacity = "0";
  }
  renderer.render(scene, camera);
  rendered++;
}
void init();
