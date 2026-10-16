// Bake local animation repairs into the shipped GLB; no Tripo API or credits.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {prepareExplorerClips} from '../src/locomotion.mjs';
const source='asset-sources/explorer-before-motion-fix.glb';
const bytes=fs.readFileSync(source), size=bytes.readUInt32LE(12);
const json=JSON.parse(bytes.subarray(20,20+size));
const bin=bytes.subarray(28+size);
const inspection=structuredClone(json);
delete inspection.images;delete inspection.textures;delete inspection.materials;
for(const mesh of inspection.meshes)for(const p of mesh.primitives)delete p.material;
inspection.buffers=[{uri:'data:application/octet-stream;base64,'+bin.toString('base64'),byteLength:bin.length}];
globalThis.ProgressEvent ??= class {};
const gltf=await new GLTFLoader().parseAsync(JSON.stringify(inspection),'');
const clips=prepareExplorerClips(gltf.scene,gltf.animations);
const buffers=[bin];let length=bin.length;
function accessor(values,type){
 const data=Buffer.from(values.buffer,values.byteOffset,values.byteLength);
 const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length});buffers.push(data);length+=data.length;
 const index=json.accessors.length;const components={SCALAR:1,VEC3:3,VEC4:4}[type];
 const entry={bufferView:view,componentType:5126,count:values.length/components,type};
 if(type==='SCALAR'){entry.min=[Math.min(...values)];entry.max=[Math.max(...values)];}
 json.accessors.push(entry);return index;
}
json.animations=clips.map(clip=>{
 const animation={name:clip.name,samplers:[],channels:[]};
 for(const track of clip.tracks){
  const dot=track.name.lastIndexOf('.'), name=track.name.slice(0,dot), property=track.name.slice(dot+1);
  const node=json.nodes.findIndex(n=>(n.name||'').replace(/[:.\[\]\/]/g,'')===name);
  if(node<0)throw new Error('Missing bone '+name);
  const path={position:'translation',quaternion:'rotation',scale:'scale'}[property];
  const sampler=animation.samplers.length;
  animation.samplers.push({input:accessor(track.times,'SCALAR'),output:accessor(track.values,property==='quaternion'?'VEC4':'VEC3'),interpolation:'LINEAR'});
  animation.channels.push({sampler,target:{node,path}});
 }
 return animation;
});
json.buffers=[{byteLength:length}];
json.asset.extras={...json.asset.extras,motionRevision:'grounded-stride-v2',derivedFrom:source};
const document=Buffer.from(JSON.stringify(json));const padded=Buffer.concat([document,Buffer.alloc((4-document.length%4)%4,32)]);
const payload=Buffer.concat(buffers);const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+payload.length,8);header.writeUInt32LE(padded.length,12);header.write('JSON',16);const chunk=Buffer.alloc(8);chunk.writeUInt32LE(payload.length);chunk.write('BIN\0',4);
const output=Buffer.concat([header,padded,chunk,payload]);fs.writeFileSync('public/assets/explorer.glb',output);
const manifest=JSON.parse(fs.readFileSync('public/assets/manifest.json'));
manifest.explorer.bytes=output.length;manifest.explorer.motionRevision='grounded-stride-v2';manifest.explorer.motionSource=source;manifest.explorer.sha256=crypto.createHash('sha256').update(output).digest('hex');
fs.writeFileSync('public/assets/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({revision:manifest.explorer.motionRevision,bytes:output.length,clips:clips.map(c=>({name:c.name,duration:c.duration})),sha256:manifest.explorer.sha256},null,2));
