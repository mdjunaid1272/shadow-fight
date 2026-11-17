# SHADOW CLASH

Three.js + TypeScript + Vite 3D weapon-fighting game: four fighters, three arenas, Story / Tournament / Survival /
Training / Duel, progression, store, missions, touch controls and an Android (Capacitor) wrapper.

```
npm install
npm run dev            # http://localhost:5173
npm run build          # typecheck + production build
npm test               # headless combat/AI, camera, animation + progression tests
npm run prepare:libs   # copy Draco/KTX2 decoders into public/libs (already done in the repo)
npm run android:sync   # build + copy into the Android project
npm run android:apk    # build a debug APK (needs JDK + Android SDK)
```

> `node_modules` must live on a local disk (not inside a Google Drive sync folder).

## Controls
A/D move (hold to sprint) · W/Space jump · S/Shift block · Q/E sidestep · J light · K heavy · L kick · U special (40 energy) · I ultimate (full energy) · Esc pause · F fullscreen · M mute.
Jump + J/K/L = air attack. Chains: J→J→K, J→L→K. Touch controls appear automatically on touch devices.

## Modes
- **Duel** - pick a fighter, difficulty and arena.
- **Story** - 5 chapters, 15 encounters, 3 bosses (multi-phase AI, extra health, never extra damage). First clears pay bonus gold; bosses unlock cosmetics.
- **Tournament** - 4 bouts of rising difficulty, final is a champion boss.
- **Survival** - endless waves, limited recovery (+20% health between waves), elite every 5th wave, optional ad revive.
- **Training** - infinite health/energy, no timer, dummy modes (idle / block / attack / AI), combo + damage readout.

## Architecture
```
src/core/        Game (battle runtime) · Flow (menus, modes, progression glue) · Modes · Match · VFX · particles
src/combat/      fixed-timestep fighter simulation, hit detection, combos (pure, no rendering)
src/ai/          EnemyAI (FSM + utility scoring, boss phases)
src/characters/  data-driven roster, procedural rig + clips, GLB loader/avatar
src/arenas/      Temple Courtyard · Shadow Dojo · Volcanic Fortress
src/progression/ save (IndexedDB, versioned), missions, achievements, store
src/monetization/ ad + purchase abstractions
src/UI/          HUD + Screens (all DOM)
```
Add a character by adding an entry to `src/characters/CharacterData.ts`; add an item in `src/progression/StoreData.ts`.

## Real assets (GLB)
Nothing is loaded at startup. Drop GLB files in `public/assets/` and list them in `public/assets/manifest.json`:
```json
{ "characters": { "ronin": "characters/ronin.glb" } }
```
The loader supports Draco and Meshopt geometry compression and KTX2 textures. Bones are matched by common rig names
(Mixamo etc.); animation clips are matched by name (`Idle`, `Light Attack 1` -> LIGHT1, `Heavy Attack`, `Hit Front`...).
A clip the GLB lacks falls back to its IDLE and is reported in the console - never faked. Cosmetic skins recolour the
procedural bodies only. `?gltftest` runs a self-test that exports and re-loads a synthetic rigged GLB.

## Monetization (integration-ready, nothing faked)
`AdManager` and `PurchaseManager` default to *not configured*: ad/IAP UI is hidden or disabled and no reward or purchase is ever
granted. Plug a real provider in with `setProvider()` (e.g. AdMob / Google Play Billing through Capacitor plugins).
Development mocks, clearly labelled TEST: `?testads`, `?devshop`. Interstitials only appear between sessions, never in combat.
Store items are cosmetic - nothing sold changes combat.

## Dev URL flags
`?autostart[=char]&mode=story|tournament|survival|training&idx=N&arena=temple|dojo|volcano` · `&bots` (AI drives the player) ·
`&speed=N` · `?screen=store|missions|story|weapons|profile|settings|characters` · `?pose=char:attack:frame&fx=hit|knock|special|ultimate|slam|charge|dash` ·
`?touch` · `?perf` is in Settings > Performance overlay. `node scripts/live-shot.mjs <url> <prefix> <seconds,...>` drives headless Chrome in real time.

## Android
`android/` is a Capacitor project (landscape, immersive fullscreen). `npm run android:apk` builds `android/app/build/outputs/apk/debug/app-debug.apk`.
Release signing, store listing and on-device profiling still need a physical device / your keystore.
