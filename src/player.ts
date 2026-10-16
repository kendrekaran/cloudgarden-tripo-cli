import * as T from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { normalizeObject, type AssetStore } from "./assets";
import { type GardenWorld } from "./world";
import { SPAWN } from "./config";
export class Player {
  object = new T.Group();
  position = new T.Vector3(SPAWN.x, 2, SPAWN.z);
  velocity = new T.Vector3();
  mixer: T.AnimationMixer;
  actions = new Map<string, T.AnimationAction>();
  current = "";
  keys = new Set<string>();
  yaw = 0;
  pitch = 0.27;
  distance = 6.4;
  lastSafe = new T.Vector3(SPAWN.x, 2, SPAWN.z);
  fallSpeed = 0;
  running = false;
  ray = new T.Raycaster();
  cameraTarget = new T.Vector3();
  cameraInitialized = false;
  model: T.Object3D;
  constructor(
    private world: GardenWorld,
    private camera: T.PerspectiveCamera,
    store: AssetStore,
  ) {
    const gltf = store.get("explorer")!;
    const clips = gltf.animations;
    this.model = clone(gltf.scene);
    normalizeObject(this.model, 1.8);
    this.model.rotation.y -= Math.PI / 2;
    this.object.rotation.y = Math.PI;
    this.object.add(this.model);
    world.scene.add(this.object);
    this.mixer = new T.AnimationMixer(this.model);
    for (const clip of clips) {
      const n = clip.name.toLowerCase();
      const key = n.includes("idle")
        ? "idle"
        : n.includes("run")
          ? "run"
          : n.includes("walk")
            ? "walk"
            : null;
      if (key && !this.actions.has(key))
        this.actions.set(key, this.mixer.clipAction(clip));
    }
    if (!this.actions.size && gltf.animations.length)
      this.actions.set("idle", this.mixer.clipAction(gltf.animations[0]));
    this.position.y = world.ground(SPAWN.x, SPAWN.z);
    if (!Number.isFinite(this.position.y)) this.position.y = 2;
    this.lastSafe.copy(this.position);
    this.object.position.copy(this.position);
    this.changeAnimation("idle");
  }
  changeAnimation(name: string) {
    if (this.current === name) return;
    const next = this.actions.get(name) || this.actions.get("idle");
    const prev = this.actions.get(this.current);
    if (next) {
      const phase = prev && this.current !== "idle" && name !== "idle"
        ? prev.time / prev.getClip().duration : 0;
      next.reset();
      next.time = phase * next.getClip().duration;
      next.fadeIn(0.22).play();
      if (prev && prev !== next) prev.fadeOut(0.22);
    }
    this.current = name;
  }
  clear() {
    this.keys.clear();
    this.velocity.set(0, 0, 0);
    this.changeAnimation("idle");
  }
  look(dx: number, dy: number) {
    this.yaw -= dx * 0.0027;
    this.pitch = T.MathUtils.clamp(this.pitch + dy * 0.0022, -0.12, 0.85);
  }
  blocked(x: number, z: number, y: number) {
    const radius = 0.28;
    for (const b of this.world.obstacles) {
      if (y > b.max.y + 0.1 || y + 1.6 < b.min.y) continue;
      const cx = T.MathUtils.clamp(x, b.min.x, b.max.x),
        cz = T.MathUtils.clamp(z, b.min.z, b.max.z);
      if (Math.hypot(x - cx, z - cz) < radius) return true;
    }
    return false;
  }
  update(dt: number, active: boolean) {
    let dx = 0,
      dz = 0;
    if (active) {
      dx = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
      dz = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    }
    this.running = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = this.running ? 4.8 : 2.5;
    const direction = new T.Vector3(
      -Math.sin(this.yaw) * dz + Math.cos(this.yaw) * dx,
      0,
      -Math.cos(this.yaw) * dz - Math.sin(this.yaw) * dx,
    );
    if (direction.lengthSq() > 0) direction.normalize();
    const moving = direction.lengthSq() > 0.01;
    const blend = 1 - Math.exp(-dt * 12);
    this.velocity.x = T.MathUtils.lerp(
      this.velocity.x,
      direction.x * speed,
      blend,
    );
    this.velocity.z = T.MathUtils.lerp(
      this.velocity.z,
      direction.z * speed,
      blend,
    );
    const previousX = this.position.x, previousZ = this.position.z;
    for (const axis of ["x", "z"] as const) {
      const nx = this.position.x + (axis === "x" ? this.velocity.x * dt : 0),
        nz = this.position.z + (axis === "z" ? this.velocity.z * dt : 0);
      const ground = this.world.ground(nx, nz);
      const rise = ground - this.position.y;
      if (
        !this.world.bridgeBlocks(this.position.x, this.position.z, nx, nz) &&
        !this.blocked(nx, nz, this.position.y) &&
        (!Number.isFinite(ground) || rise < 0.45)
      ) {
        this.position.x = nx;
        this.position.z = nz;
      }
    }
    const floor = this.world.ground(this.position.x, this.position.z);
    if (Number.isFinite(floor) && this.position.y <= floor + 0.6) {
      this.position.y = T.MathUtils.lerp(
        this.position.y,
        floor,
        1 - Math.exp(-dt * 22),
      );
      this.fallSpeed = 0;
      if (
        [
          [0.6, 0],
          [-0.6, 0],
          [0, 0.6],
          [0, -0.6],
        ].every(
          ([x, z]) =>
            Math.abs(
              this.world.ground(this.position.x + x, this.position.z + z) -
                floor,
            ) < 0.55,
        )
      )
        this.lastSafe.copy(this.position);
    } else {
      this.fallSpeed += dt * 12;
      this.position.y -= this.fallSpeed * dt;
      if (Number.isFinite(floor) && this.position.y < floor) {
        this.position.y = floor;
        this.fallSpeed = 0;
      }
    }
    let recovered = false;
    if (this.position.y < -20) {
      this.position.copy(this.lastSafe);
      this.position.y += 0.2;
      this.fallSpeed = 0;
      this.clear();
      recovered = true;
    }
    if (moving) {
      const target = Math.atan2(direction.x, direction.z);
      this.object.quaternion.slerp(
        new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), target),
        1 - Math.exp(-dt * 12),
      );
    }
    this.object.position.copy(this.position);
    const actualSpeed = recovered ? 0 : Math.hypot(this.position.x - previousX, this.position.z - previousZ) / Math.max(dt, .001);
    this.changeAnimation(actualSpeed > .12 ? (this.running ? "run" : "walk") : "idle");
    const action = this.actions.get(this.current);
    if (action && this.current !== "idle") {
      action.setEffectiveTimeScale(T.MathUtils.clamp(actualSpeed / speed, .15, 1.1));
    }
    this.mixer.update(dt);
    return recovered;
  }
  updateCamera(dt: number) {
    const target = this.position.clone().add(new T.Vector3(0, 1.35, 0));
    this.cameraTarget.lerp(
      target,
      this.cameraInitialized ? 1 - Math.exp(-dt * 14) : 1,
    );
    const offset = new T.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).multiplyScalar(this.distance);
    const desired = this.cameraTarget.clone().add(offset);
    this.ray.set(this.cameraTarget, offset.clone().normalize());
    this.ray.far = this.distance;
    const hit = this.ray
      .intersectObjects(this.world.cameraObstacles, true)
      .find((h) => h.distance > 0.4);
    if (hit)
      desired
        .copy(this.cameraTarget)
        .addScaledVector(
          offset.normalize(),
          Math.max(1.1, hit.distance - 0.28),
        );
    const ground = this.world.ground(desired.x, desired.z);
    if (Number.isFinite(ground)) desired.y = Math.max(desired.y, ground + 0.6);
    this.camera.position.lerp(
      desired,
      this.cameraInitialized ? 1 - Math.exp(-dt * 12) : 1,
    );
    this.camera.lookAt(this.cameraTarget);
    this.cameraInitialized = true;
  }
  reset() {
    this.position.set(SPAWN.x, this.world.ground(SPAWN.x, SPAWN.z), SPAWN.z);
    this.lastSafe.copy(this.position);
    this.clear();
    this.fallSpeed = 0;
    this.yaw = 0;
    this.pitch = 0.27;
    this.cameraInitialized = false;
  }
}
