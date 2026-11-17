import type * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Lazy GLB asset pipeline. Nothing here is loaded at startup: the GLTF loader,
 * Draco / Meshopt (geometry compression) and KTX2 (texture compression) code are
 * dynamic imports, fetched only when a character or arena actually lists a GLB
 * in public/assets/manifest.json. With no manifest the game uses its procedural models.
 *
 * manifest.json example:
 *   { "characters": { "ronin": "characters/ronin.glb" }, "arenas": { "temple": "arenas/temple.glb" } }
 */
export interface AssetManifest { characters?: Record<string, string>; arenas?: Record<string, string> }

const BASE = `${import.meta.env.BASE_URL}assets/`;
const LIBS = `${import.meta.env.BASE_URL}libs/`;

let manifestPromise: Promise<AssetManifest> | null = null;

/** Reads assets/manifest.json once. A missing or invalid manifest simply means "no GLB assets yet". */
export function loadManifest(): Promise<AssetManifest> {
  manifestPromise ??= fetch(`${BASE}manifest.json`, { cache: 'no-cache' })
    .then(async (r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return {} as AssetManifest;
      return (await r.json()) as AssetManifest;
    })
    .catch(() => ({}) as AssetManifest)
    .then((m) => { console.info(`[Assets] manifest: ${Object.keys(m.characters ?? {}).length} GLB characters, ${Object.keys(m.arenas ?? {}).length} GLB arenas (others use procedural fallbacks)`); return m; });
  return manifestPromise;
}

export function assetUrl(path: string): string { return `${BASE}${path}`; }

export interface LoaderSupport { draco: boolean; meshopt: boolean; ktx2: boolean }

/** Builds a GLTFLoader with Draco, Meshopt and KTX2 support wired up (decoders copied by `npm run prepare:libs`). */
export async function createGltfLoader(renderer?: THREE.WebGLRenderer): Promise<{ loader: import('three/examples/jsm/loaders/GLTFLoader.js').GLTFLoader; support: LoaderSupport }> {
  const [{ GLTFLoader }, { DRACOLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/loaders/DRACOLoader.js'),
    import('three/examples/jsm/loaders/KTX2Loader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);
  const loader = new GLTFLoader();
  const draco = new DRACOLoader(); draco.setDecoderPath(`${LIBS}draco/`); loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  let ktx2 = false;
  if (renderer) { const k = new KTX2Loader(); k.setTranscoderPath(`${LIBS}basis/`); k.detectSupport(renderer); loader.setKTX2Loader(k); ktx2 = true; }
  return { loader, support: { draco: true, meshopt: true, ktx2 } };
}

export async function loadGltf(path: string, renderer?: THREE.WebGLRenderer): Promise<GLTF> {
  const { loader } = await createGltfLoader(renderer);
  return loader.loadAsync(assetUrl(path));
}
