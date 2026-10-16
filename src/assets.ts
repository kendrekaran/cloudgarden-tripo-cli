import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { ASSET_IDS, type AssetId } from "./config";
export type AssetStore = Map<AssetId, GLTF>;
export async function loadAssets(
  onProgress: (n: number, label: string) => void,
): Promise<AssetStore> {
  const store: AssetStore = new Map(),
    loader = new GLTFLoader();
  let next = 0,
    done = 0;
  async function worker() {
    while (next < ASSET_IDS.length) {
      const id = ASSET_IDS[next++];
      const model = await loader.loadAsync(
        `${import.meta.env.BASE_URL}assets/${id}.glb${id === "explorer" ? "?motion=grounded-stride-v2" : ""}`,
      );
      model.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (m instanceof THREE.MeshStandardMaterial) {
              m.metalness = 0;
              m.roughness = 0.9;
              m.envMapIntensity = 0.5;
              if (id === "island") {
                m.side = THREE.DoubleSide;
                m.color.set("#a9b68d");
              }
              if (
                [
                  "grass",
                  "grass-tall",
                  "fern",
                  "flowers-white",
                  "flowers-purple",
                ].includes(id)
              ) {
                m.side = THREE.DoubleSide;
                m.shadowSide = THREE.DoubleSide;
              }
            }
          }
        }
      });
      store.set(id, model);
      onProgress(++done / ASSET_IDS.length, id);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return store;
}
export function normalizeObject(obj: THREE.Object3D, height: number) {
  const b = new THREE.Box3().setFromObject(obj),
    size = b.getSize(new THREE.Vector3()),
    center = b.getCenter(new THREE.Vector3());
  const s = height / Math.max(size.y, 0.001);
  obj.scale.multiplyScalar(s);
  obj.position.set(-center.x * s, -b.min.y * s, -center.z * s);
  return obj;
}
export function makeAsset(store: AssetStore, id: AssetId, height: number) {
  const wrapper = new THREE.Group();
  const obj = store.get(id)!.scene.clone(true);
  normalizeObject(obj, height);
  wrapper.add(obj);
  wrapper.userData.asset = id;
  return wrapper;
}
export const windUniform = { value: 0 };
export function windMaterial(original: THREE.Material, strength: number) {
  const mat = original.clone() as THREE.MeshStandardMaterial;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGardenTime = windUniform;
    shader.vertexShader = "uniform float uGardenTime;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
 vec3 gardenOrigin = vec3(0.0);
 #ifdef USE_INSTANCING
 gardenOrigin = instanceMatrix[3].xyz;
 #endif
 float sway = sin(uGardenTime * 1.7 + gardenOrigin.x * 0.35 + gardenOrigin.z * 0.27);
 transformed.x += sway * pow(max(position.y, 0.0), 1.3) * ${strength.toFixed(3)};
 transformed.z += cos(uGardenTime * 1.25 + gardenOrigin.z * 0.2) * max(position.y,0.0) * ${(strength * 0.42).toFixed(3)};
 `,
    );
  };
  mat.customProgramCacheKey = () => `garden-wind-${strength}`;
  return mat;
}
