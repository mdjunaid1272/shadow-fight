import type { Arena } from './Arena';
import { ShadowDojo } from './ShadowDojo';
import { TempleCourtyard } from './TempleCourtyard';
import { VolcanicFortress } from './VolcanicFortress';

export interface ArenaInfo { id: string; name: string; create: () => Arena }

/** Arenas are created on demand, so only the active one holds GPU resources. */
export const ARENAS: ArenaInfo[] = [
  { id: 'temple', name: 'TEMPLE COURTYARD', create: () => new TempleCourtyard() },
  { id: 'dojo', name: 'SHADOW DOJO', create: () => new ShadowDojo() },
  { id: 'volcano', name: 'VOLCANIC FORTRESS', create: () => new VolcanicFortress() },
];

export const getArena = (id: string): ArenaInfo => ARENAS.find((a) => a.id === id) ?? ARENAS[0];
