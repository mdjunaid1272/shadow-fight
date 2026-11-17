import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createGltfLoader } from '../characters/AssetLoader';
import { GltfAvatar, normalizeClipName } from '../characters/GltfAvatar';

/**
 * Dev self-test (?gltftest): builds a small rigged mesh with named bones and animation clips in the
 * browser, EXPORTS it as a real GLB, then loads it back through the production loader + GltfAvatar.
 * Proves the GLB path (bone mapping, clip-name normalisation, AnimationMixer, IDLE fallback and
 * decoder availability) end to end without needing a real art asset. Results go to console + document.title.
 */
export async function runGltfSelfTest(): Promise<void> {
  let fails = 0;
  const ok = (c: boolean, m: string) => { console.info(`TEST: ${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
  try {
    // ---- build a minimal Mixamo-style rig
    const mk = (name: string, parent?: THREE.Bone, y = 0.3): THREE.Bone => { const b = new THREE.Bone(); b.name = name; b.position.y = y; parent?.add(b); return b; };
    const hips = mk('mixamorigHips'); const spine = mk('mixamorigSpine', hips); const head = mk('mixamorigHead', spine);
    const rArm = mk('mixamorigRightArm', spine); const rFore = mk('mixamorigRightForeArm', rArm); const rHand = mk('mixamorigRightHand', rFore);
    const bones = [hips, spine, head, rArm, rFore, rHand];
    const geo = new THREE.BoxGeometry(0.5, 1.5, 0.3, 1, 3, 1);
    const n = geo.attributes.position.count;
    const idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { idx[i * 4] = 0; wts[i * 4] = 1; }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x88aaff })); mesh.name = 'body';
    const scene = new THREE.Group(); scene.add(hips, mesh); mesh.bind(new THREE.Skeleton(bones));
    const q = (x: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), x);
    const clip = (name: string, amp: number) => new THREE.AnimationClip(name, 1, [new THREE.QuaternionKeyframeTrack('mixamorigSpine.quaternion', [0, 0.5, 1], [...q(0).toArray(), ...q(amp).toArray(), ...q(0).toArray()])]);
    const clips = [clip('Idle', 0.05), clip('Light Attack 1', 0.4), clip('Heavy Attack', 0.7), clip('Walk', 0.1)];

    // ---- export to a real binary GLB, then load it through the production pipeline
    const glb = await new GLTFExporter().parseAsync(scene, { binary: true, animations: clips }) as ArrayBuffer;
    ok(glb.byteLength > 500, `exported a GLB (${glb.byteLength} bytes)`);
    const { loader, support } = await createGltfLoader();
    ok(support.draco && support.meshopt, 'loader configured with Draco + Meshopt support');
    const gltf = await loader.parseAsync(glb, '');
    ok(gltf.animations.length === 4, `GLB round-trips its animation clips (${gltf.animations.map((a) => a.name).join(', ')})`);

    const avatar = GltfAvatar.fromGltf(gltf);
    const rep = avatar.report();
    ok(rep.mappedJoints.includes('hips') && rep.mappedJoints.includes('torso') && rep.mappedJoints.includes('head') && rep.mappedJoints.includes('shR') && rep.mappedJoints.includes('elR'), `bones mapped by rig name (${rep.mappedJoints.join(',')})`);
    ok(rep.missingJoints.length > 0 && rep.missingJoints.includes('knL'), `unmapped joints are reported, not hidden (${rep.missingJoints.join(',')})`);
    ok(rep.handSocket && !!avatar.handSocket, 'right-hand weapon socket found');
    ok(normalizeClipName('Light Attack 1') === 'LIGHT1' && normalizeClipName('heavy-attack') === 'HEAVY' && normalizeClipName('Idle') === 'IDLE', 'clip names normalise to game names');
    ok(avatar.hasClip('IDLE') && avatar.hasClip('LIGHT1') && avatar.hasClip('HEAVY') && avatar.hasClip('WALK') && !avatar.hasClip('KICK'), 'clips found by game name; missing KICK is truthfully absent');

    ok(avatar.play('LIGHT1') === 'LIGHT1', 'play(LIGHT1) uses the GLB clip');
    for (let i = 0; i < 20; i++) avatar.update(1 / 60);
    const pitch = new THREE.Euler().setFromQuaternion(spineOf(avatar).quaternion).x;
    ok(Math.abs(pitch) > 0.01, `AnimationMixer actually animates the skeleton (spine pitch ${pitch.toFixed(3)} rad)`);
    ok(avatar.play('KICK') === 'IDLE', 'a clip the GLB lacks falls back to IDLE (warned, never faked)');

    // ---- compression decoders are really available
    await MeshoptDecoder.ready; ok(typeof MeshoptDecoder.decodeGltfBuffer === 'function', 'Meshopt decoder initialised');
    const base = import.meta.env.BASE_URL;
    for (const f of ['libs/draco/draco_decoder.wasm', 'libs/draco/draco_wasm_wrapper.js', 'libs/basis/basis_transcoder.wasm', 'libs/basis/basis_transcoder.js']) {
      const r = await fetch(`${base}${f}`); ok(r.ok && (await r.arrayBuffer()).byteLength > 10000, `decoder file served: ${f}`);
    }
    avatar.dispose();
  } catch (e) { ok(false, `self-test threw: ${String(e)}`); }
  document.title = fails ? `GLTF_SELFTEST_FAIL_${fails}` : 'GLTF_SELFTEST_PASS';
  console.info(`TEST: ${fails ? fails + ' FAILED' : 'ALL GLB SELF-TESTS PASSED'}`);
}

function spineOf(a: GltfAvatar): THREE.Object3D {
  let found: THREE.Object3D = a.root;
  a.root.traverse((o) => { if (o.name === 'mixamorigSpine') found = o; });
  return found;
}
