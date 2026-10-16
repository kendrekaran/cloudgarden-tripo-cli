import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';


// Load the actual shipped skeleton and animation data. Textures are irrelevant
// to motion and omitted so the same regression runs in Node without a GPU.
const bytes=fs.readFileSync(new URL('../public/assets/explorer.glb',import.meta.url));
const size=bytes.readUInt32LE(12);
const json=JSON.parse(bytes.subarray(20,20+size));
const bin=bytes.subarray(28+size);
delete json.images;delete json.textures;delete json.materials;
for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
json.buffers=[{uri:'data:application/octet-stream;base64,'+bin.toString('base64'),byteLength:bin.length}];
globalThis.ProgressEvent ??= class {};
const gltf=await new GLTFLoader().parseAsync(JSON.stringify(json),'');
const originals=gltf.animations.map(c=>c.toJSON());
const clips=gltf.animations;

test('shipped GLB contains baked motion repair',()=>{
 assert.equal(json.asset.extras.motionRevision, 'grounded-stride-v2');
 assert.deepEqual(gltf.animations.map(c=>c.toJSON()),originals);
 assert.deepEqual(clips.map(c=>c.name),['idle','run','walk']);
});
for(const clip of clips){
 test(`${clip.name}: repeated cycles have no pelvis drift or loop teleport`,()=>{
  const mixer=new T.AnimationMixer(gltf.scene);
  const action=mixer.clipAction(clip).play();
  const hips=gltf.scene.getObjectByName('mixamorigHips');
  const bones=[];gltf.scene.traverse(o=>{if(o.isBone)bones.push(o);});
  const p=new T.Vector3();
  const samples=[];let min=Infinity,max=-Infinity,maxJump=0;
  for(let frame=0;frame<=Math.ceil(clip.duration*120*4);frame++){
   mixer.setTime(frame/120);gltf.scene.updateMatrixWorld(true);
   const positions=bones.map(b=>b.getWorldPosition(new T.Vector3()));
   if(samples.length)for(let i=0;i<positions.length;i++)maxJump=Math.max(maxJump,positions[i].distanceTo(samples.at(-1)[i]));
   samples.push(positions);hips.getWorldPosition(p);min=Math.min(min,p.y);max=Math.max(max,p.y);
  }
  assert.ok(max-min<.14,`pelvis vertical travel ${max-min}m`);
  assert.ok(maxJump<.07,`joint jump ${maxJump}m per 120Hz frame`);
  for(const t of clip.tracks){const n=t.getValueSize();assert.deepEqual(Array.from(t.values.slice(0,n)),Array.from(t.values.slice(-n)),t.name);}
  action.stop();
 });
}

for (const clip of clips.filter(c => /run|walk/.test(c.name))) {
 test(`${clip.name}: rendered boot soles stay grounded throughout the stride`, () => {
  const restFloor = new T.Box3().setFromObject(gltf.scene).min.y;
  const mixer = new T.AnimationMixer(gltf.scene);
  const action = mixer.clipAction(clip).play();
  const p = new T.Vector3();
  const errors = [];
  for (let frame = 0; frame < 180; frame++) {
   mixer.setTime(frame * clip.duration / 90);
   gltf.scene.updateMatrixWorld(true);
   let sole = Infinity;
   gltf.scene.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    mesh.skeleton.update();
    for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex++) {
     mesh.getVertexPosition(vertex, p).applyMatrix4(mesh.matrixWorld);
     sole = Math.min(sole, p.y);
    }
   });
   errors.push(Math.abs(sole - restFloor));
  }
  assert.ok(Math.max(...errors) < .012, `visible sole error ${Math.max(...errors)} source metres`);
  action.stop();
 });
}
