export type HorseCoat = 'palomino' | 'kary' | 'siwy' | 'kasztan' | 'bulany' | 'srokaty';
export type ManeColor = 'golden' | 'black' | 'white' | 'chestnut' | 'silver';
export type BlanketColor = 'emerald' | 'lavender' | 'rose' | 'celestial' | 'amber';
export type HairColor = 'blonde' | 'brown' | 'raven' | 'auburn' | 'silver';
export type OutfitColor = 'shire_green' | 'elven_violet' | 'rose_pink' | 'celestial_blue' | 'dunedain_grey';

export interface RiderProfile {
  name: string;
  hairColor: HairColor;
  outfitColor: OutfitColor;
}

export interface HorseProfile {
  name: string;
  coat: HorseCoat;
  maneColor: ManeColor;
  blanketColor: BlanketColor;
}

export type GameState = 'title' | 'creator' | 'playing' | 'camp' | 'map' | 'victory';

export type Gait = 'idle' | 'walk' | 'trot' | 'canter' | 'gallop';

export interface WorldMilestone {
  id: string;
  name: string;
  biome: string;
  zPos: number;
  description: string;
  visited: boolean;
}

export interface ActiveMonster {
  id: string;
  type: 'goblin' | 'orc' | 'troll';
  x: number;
  z: number;
  baseX: number;
  baseZ: number;
  health: number;
  maxHealth: number;
  state: 'idle' | 'patrol' | 'chase' | 'vanished';
  vanishTimer: number;
}

export interface AbandonedStable {
  id: string;
  x: number;
  z: number;
  name: string;
  applesRemaining: number;
  rested: boolean;
}

export interface FoxActor {
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  rotation: number;
  isFriendlyPetted: boolean;
  state: 'trot' | 'sit' | 'leap';
  animTime: number;
}
