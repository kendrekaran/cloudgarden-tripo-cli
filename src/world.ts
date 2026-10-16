import * as T from "three";

import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { makeAsset, windMaterial, type AssetStore } from "./assets";
import { ISLANDS, SHRINES, type AssetId } from "./config";
import { distanceToSegment } from "./progress.mjs";
export interface Bridge {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  ay: number;
  by: number;
  width: number;
}
export interface GardenShrine {
  id: string;
  name: string;
  message: string;
  position: T.Vector3;
  object: T.Group;
  light: T.PointLight;
  particles: T.Points;
  active: boolean;
}
function random(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const DOWN = new T.Vector3(0, -1, 0);
export class GardenWorld {
  scene: T.Scene;
  terrain: T.Object3D[] = [];
  obstacles: T.Box3[] = [];
  cameraObstacles: T.Object3D[] = [];
  bridges: Bridge[] = [];
  shrines: GardenShrine[] = [];
  foliage: {
    mesh: T.InstancedMesh;
    full: number;
    near: number;
    center: T.Vector3;
  }[] = [];
  clouds: T.Group = new T.Group();
  smoke: T.Points[] = [];
  ray = new T.Raycaster();
  private terrainCache = new Map<string, number>();
  private store: AssetStore;
  sun: T.DirectionalLight;
  ambient: T.HemisphereLight;
  cloudSheet: T.Mesh;
  low = false;
  constructor(scene: T.Scene, store: AssetStore) {
    this.scene = scene;
    this.store = store;
    scene.background = new T.Color("#a9d1dc");
    scene.fog = new T.FogExp2("#c1d9dc", 0.0033);
    this.ambient = new T.HemisphereLight("#d6edfa", "#6a7145", 2.05);
    scene.add(this.ambient);
    this.sun = new T.DirectionalLight("#ffe4ad", 3.3);
    this.sun.position.set(-60, 85, 35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -32;
    this.sun.shadow.camera.right = 32;
    this.sun.shadow.camera.top = 32;
    this.sun.shadow.camera.bottom = -32;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.normalBias = 0.045;
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);
    const sky = new T.Mesh(
      new T.SphereGeometry(1800, 32, 16),
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          top: { value: new T.Color("#4998c9") },
          horizon: { value: new T.Color("#9ac5d7") },
          sunDirection: { value: new T.Vector3(-0.7, 0.35, -0.45).normalize() },
        },
        vertexShader:
          "varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader: `varying vec3 vDirection;uniform vec3 top;uniform vec3 horizon;uniform vec3 sunDirection;void main(){vec3 d=normalize(vDirection);float t=pow(clamp(d.y*1.8+.08,0.,1.),.55);vec3 c=mix(horizon,top,t);float sun=max(dot(d,sunDirection),0.);c+=vec3(1.,.75,.38)*pow(sun,120.)*.28;c=mix(c,vec3(1.,.96,.82),smoothstep(.9996,.99985,sun));gl_FragColor=vec4(c,1.);
#include <colorspace_fragment>
}`,
      }),
    );
    scene.add(sky);
    for (const island of ISLANDS) {
      const group = store.get("island")!.scene.clone(true);
      group.traverse((o) => {
        if (o instanceof T.Mesh) {
          if (!o.geometry.boundsTree)
            o.geometry.boundsTree = new MeshBVH(o.geometry);
          o.raycast = acceleratedRaycast;
        }
      });
      group.scale.setScalar(island.r);
      group.position.set(island.x, 0, island.z);
      scene.add(group);
      group.updateMatrixWorld(true);
      this.terrain.push(group);
      this.cameraObstacles.push(group);
    }
    for (const island of ISLANDS.slice(1))
      this.addBridge(island.x, island.z, island.r);
    this.decorate();
    this.makeFoliage();
    this.makeShrines();
    this.cloudSheet = this.makeClouds();
  }
  rawGround(x: number, z: number) {
    this.ray.set(new T.Vector3(x, 45, z), DOWN);
    const hit = this.ray
      .intersectObjects(this.terrain, true)
      .find((h) => h.point.y > -7 && h.face && h.face.normal.y > -0.5);
    return hit?.point.y ?? -Infinity;
  }
  ground(x: number, z: number) {
    let y = this.rawGround(x, z);
    for (const b of this.bridges) {
      const dx = b.bx - b.ax,
        dz = b.bz - b.az;
      const t = ((x - b.ax) * dx + (z - b.az) * dz) / (dx * dx + dz * dz);
      if (
        t >= 0 &&
        t <= 1 &&
        distanceToSegment(x, z, b.ax, b.az, b.bx, b.bz) < b.width * 0.48
      )
        y = Math.max(y, T.MathUtils.lerp(b.ay, b.by, t));
    }
    return y;
  }
  bridgeBlocks(x: number, z: number, nx: number, nz: number) {
    for (const b of this.bridges) {
      const dx = b.bx - b.ax,
        dz = b.bz - b.az;
      const t = ((x - b.ax) * dx + (z - b.az) * dz) / (dx * dx + dz * dz);
      if (
        t > 0.015 &&
        t < 0.985 &&
        distanceToSegment(x, z, b.ax, b.az, b.bx, b.bz) < b.width * 0.48 &&
        distanceToSegment(nx, nz, b.ax, b.az, b.bx, b.bz) > b.width * 0.4
      )
        return true;
    }
    return false;
  }
  sampleGround(x: number, z: number) {
    const k = `${Math.round(x * 3)},${Math.round(z * 3)}`;
    if (!this.terrainCache.has(k))
      this.terrainCache.set(k, this.rawGround(x, z));
    return this.terrainCache.get(k)!;
  }
  addBridge(x: number, z: number, r: number) {
    const dir = new T.Vector2(x, z).normalize();
    const ax = dir.x * 39,
      az = dir.y * 39,
      bx = x - dir.x * r * 0.65,
      bz = z - dir.y * r * 0.65;
    const ay = this.rawGround(ax, az) + 0.15,
      by = this.rawGround(bx, bz) + 0.15;
    const b = { ax, az, bx, bz, ay, by, width: 3.5 };
    this.bridges.push(b);
    const length = Math.hypot(bx - ax, bz - az),
      pieces = Math.ceil(length / 10);
    const angle = Math.atan2(dir.x, dir.y);
    for (let i = 0; i < pieces; i++) {
      const t = (i + 0.5) / pieces;
      const root = new T.Group(),
        model = this.store.get("bridge")!.scene.clone(true);
      let box = new T.Box3().setFromObject(model),
        s = box.getSize(new T.Vector3()),
        c = box.getCenter(new T.Vector3());
      model.position.sub(c);
      const scale = new T.Group();
      scale.add(model);
      scale.scale.set(b.width / s.x, 2.0 / s.y, (length / pieces + 0.18) / s.z);
      root.add(scale);
      root.position.set(
        T.MathUtils.lerp(ax, bx, t),
        T.MathUtils.lerp(ay, by, t) + 0.65,
        T.MathUtils.lerp(az, bz, t),
      );
      root.rotation.y = angle;
      root.rotation.x = -Math.atan2(by - ay, length);
      this.scene.add(root);
      root.updateMatrixWorld(true);
      this.ray.set(new T.Vector3(root.position.x, 30, root.position.z), DOWN);
      const deck = this.ray.intersectObject(root, true)[0];
      if (deck) {
        root.position.y += T.MathUtils.lerp(ay, by, t) - deck.point.y;
        root.updateMatrixWorld(true);
      }
      this.cameraObstacles.push(root);
    }
  }
  place(
    id: AssetId,
    x: number,
    z: number,
    height: number,
    rotation = 0,
    solid = false,
  ) {
    const y = this.ground(x, z);
    if (!Number.isFinite(y)) return null;
    const root = makeAsset(this.store, id, height);
    root.position.set(x, y - 0.04, z);
    root.rotation.y = rotation;
    this.scene.add(root);
    root.updateMatrixWorld(true);
    if (solid) {
      const b = new T.Box3().setFromObject(root);
      this.obstacles.push(b);
      this.cameraObstacles.push(root);
    }
    return root;
  }
  nearPath(x: number, z: number, padding = 0) {
    if (
      Math.hypot(x, z) < 5 + padding ||
      distanceToSegment(x, z, 0, 19, 0, -8) < 1.8 + padding
    )
      return true;
    for (const i of ISLANDS.slice(1)) {
      if (distanceToSegment(x, z, 0, 0, i.x, i.z) < 1.8 + padding) return true;
    }
    return false;
  }
  decorate() {
    this.place("lantern", 2.7, 11, 1.5, -0.4);
    const rnd = random(775);
    this.place("shed", -13, 7, 5.5, -0.5, true);
    this.place("volcano", 22, -20, 6.8, 0.7, true);
    this.place("volcano", -65, 85, 4.3, 1.2, true);
    this.place("volcano", -53, 94, 2.5, 0.4, true);
    for (const island of ISLANDS) {
      for (let n = 0; n < 22; n++) {
        const a = rnd() * Math.PI * 2,
          dist = (0.64 + rnd() * 0.27) * island.r;
        const x = island.x + Math.sin(a) * dist,
          z = island.z + Math.cos(a) * dist;
        if (this.nearPath(x, z, 2)) continue;
        this.place("rock", x, z, 0.7 + rnd() * 2.2, rnd() * 6.28, true);
      }
    }
    for (const [x, z] of [
      [-11, 13],
      [-15, 12],
      [-18, 9],
      [7, -10],
      [10, -12],
    ])
      this.place("fence", x, z, 1.3, -0.9);
    // The same Tripo dirt patch is fitted and repeated along every garden path.
    for (const island of ISLANDS.slice(1)) {
      const len = Math.hypot(island.x, island.z),
        dir = new T.Vector2(island.x, island.z).normalize();
      for (let d = 0; d < len + 6; d += 3.5) {
        const x = dir.x * d,
          z = dir.y * d;
        if (
          this.bridges.some(
            (b) =>
              distanceToSegment(x, z, b.ax, b.az, b.bx, b.bz) < 2 &&
              Math.hypot(x, z) > 40 &&
              Math.hypot(x - island.x, z - island.z) > island.r * 0.7,
          )
        )
          continue;
        const ground = this.rawGround(x, z);
        if (!Number.isFinite(ground)) continue;
        const root = this.store.get("path")!.scene.clone(true),
          box = new T.Box3().setFromObject(root),
          size = box.getSize(new T.Vector3()),
          center = box.getCenter(new T.Vector3());
        root.position.sub(center);
        const fit = new T.Group();
        fit.add(root);
        fit.scale.set(3.5 / size.x, 0.025 / size.y, 4.5 / size.z);
        fit.rotation.y = Math.atan2(dir.x, dir.y);
        fit.position.set(x, ground + 0.025, z);
        fit.updateMatrixWorld(true);
        const patches: T.Mesh[] = [];
        fit.traverse((o) => {
          if (o instanceof T.Mesh) patches.push(o);
        });
        for (const patch of patches) {
          const geom = patch.geometry.clone();
          geom.applyMatrix4(patch.matrixWorld);
          const pos = geom.getAttribute("position"),
            idx = geom.index;
          const keep: number[] = [];
          const va = new T.Vector3(),
            vb = new T.Vector3(),
            vc = new T.Vector3();
          if (idx)
            for (let k = 0; k < idx.count; k += 3) {
              const a = idx.getX(k),
                b = idx.getX(k + 1),
                c = idx.getX(k + 2);
              va.fromBufferAttribute(pos, a);
              vb.fromBufferAttribute(pos, b);
              vc.fromBufferAttribute(pos, c);
              if (vb.sub(va).cross(vc.sub(va)).y > 0) keep.push(a, b, c);
            }
          if (idx) geom.setIndex(keep);
          for (let k = 0; k < pos.count; k++) {
            const gx = pos.getX(k),
              gz = pos.getZ(k),
              gy = this.rawGround(gx, gz);
            pos.setY(k, Number.isFinite(gy) ? gy + 0.035 : ground + 0.035);
          }
          geom.computeVertexNormals();
          const material = (
            Array.isArray(patch.material) ? patch.material[0] : patch.material
          ).clone() as T.MeshStandardMaterial;
          material.polygonOffset = true;
          material.polygonOffsetFactor = -1;
          material.side = T.DoubleSide;
          const conformed = new T.Mesh(geom, material);
          conformed.receiveShadow = true;
          this.scene.add(conformed);
        }
      }
    }
    for (const [x, z, h] of [
      [22, -20, 6.8],
      [-65, 85, 4.3],
      [-53, 94, 2.5],
    ]) {
      const y = this.ground(x, z);
      const positions = new Float32Array(48 * 3),
        phases = new Float32Array(48);
      for (let j = 0; j < 48; j++) {
        positions[j * 3] = (rnd() - 0.5) * 0.5;
        positions[j * 3 + 1] = rnd() * 6;
        positions[j * 3 + 2] = (rnd() - 0.5) * 0.5;
        phases[j] = rnd();
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(positions, 3));
      const mat = new T.PointsMaterial({
        size: 1.7,
        color: "#e9e5d9",
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        map: softTexture(),
      });
      const p = new T.Points(geo, mat);
      p.position.set(x, y + h * 0.88, z);
      p.userData.phases = phases;
      this.scene.add(p);
      this.smoke.push(p);
    }
  }
  makeFoliage() {
    const rnd = random(817);
    const specs: {
      id: AssetId;
      count: number;
      height: number;
      wind: number;
    }[] = [
      { id: "grass", count: 11000, height: 0.52, wind: 0.17 },
      { id: "grass-tall", count: 1500, height: 1.0, wind: 0.12 },
      { id: "flowers-white", count: 900, height: 0.6, wind: 0.07 },
      { id: "flowers-purple", count: 450, height: 0.85, wind: 0.07 },
      { id: "fern", count: 420, height: 1.0, wind: 0.05 },
    ];
    for (const spec of specs) {
      const template = makeAsset(this.store, spec.id, spec.height);
      template.updateMatrixWorld(true);
      const parts: T.Mesh[] = [];
      template.traverse((o) => {
        if (o instanceof T.Mesh) parts.push(o);
      });
      const transforms: T.Matrix4[] = [];
      const dummy = new T.Object3D();
      for (let n = 0; n < spec.count; n++) {
        const island =
          n < spec.count * 0.68
            ? ISLANDS[0]
            : ISLANDS[1 + Math.floor(rnd() * 3)];
        const a = rnd() * Math.PI * 2,
          r = Math.sqrt(rnd()) * island.r * 0.91;
        const x = island.x + Math.cos(a) * r,
          z = island.z + Math.sin(a) * r;
        if (this.nearPath(x, z, spec.id === "fern" ? 1.2 : 0)) continue;
        const y = this.sampleGround(x, z);
        if (!Number.isFinite(y) || y < -0.9) continue;
        if (
          this.obstacles.some(
            (b) =>
              x > b.min.x - 1 &&
              x < b.max.x + 1 &&
              z > b.min.z - 1 &&
              z < b.max.z + 1,
          )
        )
          continue;
        dummy.position.set(x, y - 0.035, z);
        dummy.rotation.set(
          (rnd() - 0.5) * 0.12,
          rnd() * 6.28,
          (rnd() - 0.5) * 0.12,
        );
        const size = 0.65 + rnd() * 0.75;
        dummy.scale.set(size, size * (0.8 + rnd() * 0.4), size);
        dummy.updateMatrix();
        transforms.push(dummy.matrix.clone());
      }
      // Shuffle placement order so reducing count preserves coverage on every island.
      for (let n = transforms.length - 1; n > 0; n--) {
        const j = Math.floor(rnd() * (n + 1));
        [transforms[n], transforms[j]] = [transforms[j], transforms[n]];
      }
      const cells = new Map<string, T.Matrix4[]>();
      for (const m of transforms) {
        const key = `${Math.floor(m.elements[12] / 18)},${Math.floor(m.elements[14] / 18)}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key)!.push(m);
      }
      for (const part of parts) {
        const geo = part.geometry.clone();
        geo.applyMatrix4(part.matrixWorld);
        const original = Array.isArray(part.material)
          ? part.material[0]
          : part.material;
        const material = windMaterial(original, spec.wind);
        for (const matrices of cells.values()) {
          const inst = new T.InstancedMesh(geo, material, matrices.length);
          inst.castShadow = false;
          inst.receiveShadow = true;
          const center = new T.Vector3();
          for (let j = 0; j < matrices.length; j++) {
            inst.setMatrixAt(j, matrices[j]);
            center.add(new T.Vector3().setFromMatrixPosition(matrices[j]));
            const color = new T.Color().setHSL(
              0.17 + (rnd() - 0.5) * 0.035,
              0.1 + rnd() * 0.12,
              0.82 + rnd() * 0.16,
            );
            inst.setColorAt(j, color);
          }
          center.divideScalar(matrices.length);
          inst.instanceMatrix.needsUpdate = true;
          inst.computeBoundingSphere();
          this.scene.add(inst);
          this.foliage.push({
            mesh: inst,
            full: matrices.length,
            near: Math.round(matrices.length * 0.48),
            center,
          });
        }
      }
    }
  }
  makeShrines() {
    for (const s of SHRINES) {
      const object = this.place(
        "shrine",
        s.x,
        s.z,
        2.6,
        Math.atan2(-s.x, -s.z),
        true,
      )!;
      const position = object.position.clone();
      const light = new T.PointLight(s.color, 0, 8, 2);
      light.position.copy(position).add(new T.Vector3(0, 2.3, 0));
      this.scene.add(light);
      const rnd = random(s.x + 100);
      const verts = new Float32Array(28 * 3);
      for (let i = 0; i < 28; i++) {
        verts[i * 3] = (rnd() - 0.5) * 4;
        verts[i * 3 + 1] = rnd() * 4;
        verts[i * 3 + 2] = (rnd() - 0.5) * 4;
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(verts, 3));
      const particles = new T.Points(
        geo,
        new T.PointsMaterial({
          size: 0.1,
          color: s.color,
          map: softTexture(),
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
          blending: T.AdditiveBlending,
        }),
      );
      particles.position.copy(position);
      this.scene.add(particles);
      this.shrines.push({
        ...s,
        object,
        position,
        light,
        particles,
        active: false,
      });
    }
  }
  makeClouds() {
    const rnd = random(812);
    for (let j = 0; j < 160; j++) {
      const cloud = makeAsset(this.store, "cloud", 14 + rnd() * 9);
      const a = rnd() * 6.28,
        r = j < 75 ? 70 + rnd() * 180 : 230 + rnd() * 500;
      cloud.position.set(Math.cos(a) * r, -29 - rnd() * 7, Math.sin(a) * r);
      cloud.scale.set(1.4 + rnd() * 1.3, 1, 1.3 + rnd() * 1.2);
      cloud.rotation.y = rnd() * 6.28;
      cloud.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.castShadow = false;
          o.receiveShadow = false;
          o.material = new T.MeshLambertMaterial({ color: "#b7cbd4" });
        }
      });
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
    const geo = new T.PlaneGeometry(2500, 2500);
    const mat = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv;uniform float uTime;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}void main(){vec2 p=vUv*110.+vec2(uTime*.005,0.);float n=noise(p)*.55+noise(p*2.)*.25+noise(p*4.)*.14+noise(p*8.)*.06;float aa=clamp(length(fwidth(p))*.8,0.,1.);n=mix(n,.52,aa);vec3 col=mix(vec3(.72,.80,.84),vec3(.98,.97,.92),smoothstep(.2,.8,n));gl_FragColor=vec4(col,1.);}`,
    });
    const sheet = new T.Mesh(geo, mat);
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.y = -25;
    this.scene.add(sheet);
    return sheet;
  }
  setQuality(low: boolean) {
    this.low = low;
    for (const f of this.foliage) f.mesh.count = low ? f.near : f.full;
    this.sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }
  update(time: number, player: T.Vector3) {
    this.sun.position.set(player.x - 60, 85, player.z + 35);
    this.sun.target.position.set(player.x, 0, player.z);
    this.sun.target.updateMatrixWorld();
    for (const f of this.foliage) {
      const distance = f.center.distanceTo(player);
      f.mesh.visible = distance < (this.low ? 75 : 115);
      const density = distance < 24 ? 1 : distance < 45 ? 0.65 : 0.28;
      f.mesh.count = Math.ceil((this.low ? f.near : f.full) * density);
    }
    (this.cloudSheet.material as T.ShaderMaterial).uniforms.uTime.value = time;
    this.clouds.position.x = Math.sin(time * 0.005) * 4;
    for (const s of this.shrines) {
      s.particles.rotation.y = time * 0.08;
      s.light.intensity = s.active ? 9 + Math.sin(time * 1.4) * 2 : 0;
      (s.particles.material as T.PointsMaterial).opacity = s.active
        ? 0.85
        : 0.25;
      s.particles.position.y = s.position.y + Math.sin(time * 0.7) * 0.16;
    }
    for (const smoke of this.smoke) {
      const pos = smoke.geometry.getAttribute("position") as T.BufferAttribute;
      const phases = smoke.userData.phases as Float32Array;
      for (let j = 0; j < pos.count; j++) {
        const rise = (phases[j] * 6 + time * 0.5) % 6;
        pos.setXYZ(
          j,
          Math.sin(j * 2 + time * 0.16) * (0.2 + rise * 0.14) + rise * 0.2,
          rise,
          Math.cos(j * 4 + time * 0.12) * (0.2 + rise * 0.1),
        );
      }
      pos.needsUpdate = true;
    }
  }
}
function softTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!,
    g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}
