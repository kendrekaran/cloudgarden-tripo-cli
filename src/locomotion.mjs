import * as T from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

/** Repair Tripo's drifting retargeted clips without changing the source GLB.
 * The imported rig has Z-up hips coordinates, beneath a Y-up Root transform.
 * Locomotion belongs to the controller; clips only supply a repeating pose.
 */
export function prepareExplorerClips(source, clips) {
  const rig = clone(source);
  const mixer = new T.AnimationMixer(rig);
  const hips = rig.getObjectByName('mixamorigHips');
  const spine = rig.getObjectByName('mixamorigSpine');
  const feet = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map(n => rig.getObjectByName(`mixamorig${n}`));
  if (!hips || !spine || feet.some(f => !f)) return clips.map(c => c.clone());
  const p = new T.Vector3(), q = new T.Quaternion();
  return clips.map(original => {
    const moving = /walk|run/i.test(original.name);
    const running = /run/i.test(original.name);
    let start = 0, end = original.duration;
    // Select a whole stride with the closest matching limb pose, excluding
    // clip lead-in frames. This avoids repeating a partial third step.
    if (moving) {
      const rotations = original.tracks.filter(t => /UpLeg|Leg\.|Foot|Arm\.|ForeArm/.test(t.name) && t.name.endsWith('.quaternion'));
      let best = Infinity;
      for (let i = 0; i <= 6; i++) {
        for (let length = running ? 13 : 25; length <= (running ? 18 : 31); length++) {
          const a = i / 24, b = (i + length) / 24;
          if (b > original.duration) continue;
          let score = 0;
          for (const track of rotations) {
            const interpolant = track.createInterpolant();
            const qa = new T.Quaternion().fromArray(interpolant.evaluate(a));
            const qb = new T.Quaternion().fromArray(interpolant.evaluate(b));
            score += qa.angleTo(qb) ** 2;
          }
          if (score < best) { best = score; start = a; end = b; }
        }
      }
    }
    const duration = end - start;
    const count = Math.ceil(duration * 60);
    const times = Array.from({length: count + 1}, (_, i) => i * duration / count);
    const tracks = original.tracks.map(track => {
      const sampler = track.createInterpolant();
      const size = track.getValueSize();
      const first = Array.from(sampler.evaluate(start));
      const last = Array.from(sampler.evaluate(end));
      const values = [];
      for (const time of times) {
        const value = Array.from(sampler.evaluate(start + time));
        if (track.name === 'mixamorigHips.position') {
          // Remove translation on the ground plane, including the run clip's
          // large initial offset; eliminate its erroneous vertical ramp.
          value[0] = 0;
          value[1] = 0;
          value[2] -= (last[2] - first[2]) * time / duration;
        }
        const blend = T.MathUtils.smoothstep(time / duration, .82, 1);
        if (track.name.endsWith('.quaternion')) {
          q.fromArray(value).slerp(new T.Quaternion().fromArray(first), blend).normalize();
          q.toArray(value);
        } else if (track.name !== 'mixamorigHips.position') {
          for (let j = 0; j < size; j++) value[j] = T.MathUtils.lerp(value[j], first[j], blend);
        }
        values.push(...value);
      }
      const result = track.clone();
      result.times = new Float32Array(times);
      result.values = new Float32Array(values);
      return result;
    });
    const clip = new T.AnimationClip(original.name, duration, tracks);
    const action = mixer.clipAction(clip).setLoop(T.LoopOnce, 1).play();
    action.clampWhenFinished = true;
    const hipTrack = tracks.find(t => t.name === 'mixamorigHips.position');
    const spineTrack = tracks.find(t => t.name === 'mixamorigSpine.quaternion');
    for (let i = 0; i < times.length; i++) {
      mixer.setTime(times[i]);
      rig.updateMatrixWorld(true);
      // Plant the lowest boot rather than retaining the imported rising hips.
      // Foot joints are approximately 2 cm above this source mesh's soles.
      const floor = Math.min(...feet.map(f => f.getWorldPosition(p).y));
      hipTrack.values[i * 3 + 2] += .02 - floor;
      if (moving) {
        // A small forward walking posture; reduce the run's exaggerated hunch.
        const correction = new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1), T.MathUtils.degToRad(running ? 12 : -7));
        const parent = spine.parent.getWorldQuaternion(new T.Quaternion());
        q.copy(parent).invert().multiply(correction).multiply(parent).multiply(spine.quaternion).normalize();
        q.toArray(spineTrack.values, i * 4);
      }
    }
    // Exact endpoint agreement, including the corrected planted-foot height.
    for (const track of tracks) {
      const size = track.getValueSize();
      for(let j=0;j<size;j++) track.values[track.values.length-size+j]=track.values[j];
    }
    action.stop();
    mixer.uncacheClip(clip);
    // Smooth across the circular boundary, not toward a frozen first pose.
    // This gives matching incoming/outgoing velocities as well as positions.
    for (const track of tracks.filter(t => t.name.endsWith('.quaternion'))) {
      const originalValues = track.values.slice();
      for (let i = 0; i < count; i++) {
        let weight = 0;
        for (let offset = -2; offset <= 2; offset++) {
          const sample = ((i + offset + count) % count) * 4;
          const w = [1, 4, 6, 4, 1][offset + 2];
          const value = new T.Quaternion().fromArray(originalValues, sample);
          if (!weight) q.copy(value); else q.slerp(value, w / (weight + w));
          weight += w;
        }
        q.normalize().toArray(track.values, i * 4);
      }
      track.values.set(track.values.slice(0, 4), count * 4);
    }
    // Bone origins are above the boot soles and move differently when the
    // ankle flexes. Bake contact from the rendered skinned mesh itself.
    const contactClip = clip.clone();
    const contactAction = mixer.clipAction(contactClip).setLoop(T.LoopOnce, 1).play();
    contactAction.clampWhenFinished = true;
    const meshes = [];
    rig.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
    const bindFloor = new T.Box3().setFromObject(source).min.y;
    const contactHeights = [];
    for (const time of times) {
      mixer.setTime(time);
      rig.updateMatrixWorld(true);
      let sole = Infinity;
      for (const mesh of meshes) {
        mesh.skeleton.update();
        for (let vertex = 0; vertex < mesh.geometry.attributes.position.count; vertex++) {
          mesh.getVertexPosition(vertex, p).applyMatrix4(mesh.matrixWorld);
          sole = Math.min(sole, p.y);
        }
      }
      contactHeights.push(hips.position.z + bindFloor - sole);
    }
    contactAction.stop();
    mixer.uncacheClip(contactClip);
    // A periodic low-pass filter removes the sharp change when the supporting
    // foot changes, while keeping the soles within a few millimetres of ground.
    for (let i = 0; i < count; i++) {
      hipTrack.values[i * 3 + 2] = (
        contactHeights[(i - 1 + count) % count] + 2 * contactHeights[i] + contactHeights[(i + 1) % count]
      ) / 4;
    }
    hipTrack.values[count * 3 + 2] = hipTrack.values[2];
    return clip;
  });
}
