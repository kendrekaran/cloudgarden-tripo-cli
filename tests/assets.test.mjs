import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root));
const manifest=JSON.parse(read('public/assets/manifest.json'));
function glb(name){const b=read(`public/assets/${name}.glb`);assert.equal(b.toString('ascii',0,4),'glTF');assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);return JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));}
test('all sixteen Tripo assets are self-contained valid GLBs with provenance',()=>{assert.equal(Object.keys(manifest).length,16);for(const [name,entry]of Object.entries(manifest)){assert.ok(entry.sourceTaskId);assert.ok(entry.sourceModel,`${name} source provenance missing`);const doc=glb(name);assert.ok(doc.meshes.length,`${name} has no mesh`);for(const item of [...doc.buffers,...(doc.images||[])])assert.ok(!item.uri||item.uri.startsWith('data:'),`${name} needs an external file`);}});
test('optimized explorer retains its rig and all three Tripo motions',()=>{const doc=glb('explorer');assert.ok(doc.skins[0].joints.length>=20);const names=doc.animations.map(a=>a.name);for(const n of ['idle','walk','run'])assert.ok(names.includes(n),n);assert.ok(manifest.explorer.triangles<25000);});
test('generation ledger reconciles with account balance and stays inside cap',()=>{const d=JSON.parse(read('asset-ledger.json'));const total=Object.values(d.jobs).reduce((sum,j)=>sum+(j.result.credits_consumed||0),0);assert.equal(total,400);assert.equal(total,d.initial_balance-d.final_balance);assert.ok(total<=d.budget);assert.equal(d.budget,500);});
