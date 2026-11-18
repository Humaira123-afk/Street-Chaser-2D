export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type RoundPhase = 'COUNTDOWN' | 'GREY_PHASE' | 'COLOR_PHASE' | 'ROUND_END';

export type Difficulty = 'easy' | 'normal' | 'hard';

export type PlayerRole = 'runner' | 'chaser';

export type MapId = 'park' | 'city' | 'campus' | 'plaza';

export type MouseMoveMode = 'hold' | 'follow';

export type FacingDir = 'down' | 'up' | 'left' | 'right';

export type AnimState = 'idle' | 'walk' | 'run' | 'hide' | 'caught';

export type HairStyle =
  | 'short'
  | 'spiky'
  | 'ponytail'
  | 'bob'
  | 'hood'
  | 'cap'
  | 'beanie'
  | 'hunter_hat';

export interface ColorPaletteItem {
  id: string;
  name: string;
  hex: string;
  rgb: [number, number, number];
  gray: [number, number, number];
}

export interface ColorBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  colorIndex: number;
}

export interface HumanAppearance {
  name: string;
  tagline?: string;
  skin: string;
  hairStyle: HairStyle;
  hairColor: string;
  topStyle: 'hoodie' | 'jacket' | 'shirt' | 'trench' | 'hunter_coat';
  topColor: string;
  topAccent: string;
  pantsColor: string;
  shoeColor: string;
  accessory: 'none' | 'backpack' | 'scarf' | 'headphones' | 'cap' | 'bandolier';
  isChaser?: boolean;
}

export interface RectObstacle {
  kind:
    | 'building'
    | 'wall'
    | 'car'
    | 'bench'
    | 'water'
    | 'table'
    | 'stall'
    | 'crate'
    | 'rock'
    | 'log'
    | 'fountain';
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
  roofColor?: string;
  accentColor?: string;
  label?: string;
  direction?: 'h' | 'v';
  tall?: number;
}

export interface TreeProp {
  kind: 'pine' | 'oak' | 'birch' | 'palm';
  x: number;
  y: number;
  trunkRadius: number;
  canopyRadius: number;
  tint: string;
}

export interface HidingSpot {
  id: number;
  kind: 'bush' | 'hedge' | 'tent' | 'alcove';
  x: number;
  y: number;
  radius: number;
  color: string;
  occupants: number;
}

export interface DecorPatch {
  kind: 'road_h' | 'road_v' | 'sidewalk' | 'path' | 'court' | 'pier' | 'plaza' | 'grass_patch';
  x: number;
  y: number;
  w: number;
  h: number;
  color?: string;
}

export interface ScatterDetail {
  kind: 'flower' | 'mushroom' | 'crosswalk' | 'lamp' | 'campfire' | 'lilypad' | 'boat';
  x: number;
  y: number;
  color?: string;
  size?: number;
  angle?: number;
}

export interface GameSettings {
  sfxEnabled: boolean;
  voiceEnabled: boolean;
  musicEnabled: boolean;
  mouseMode: MouseMoveMode;
  showMinimap: boolean;
  showTileLetters: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}
