import { ColorPaletteItem, Difficulty, HumanAppearance, MapId } from './types';

export const WORLD_WIDTH = 2200;
export const WORLD_HEIGHT = 1600;
export const COLOR_TILE_SIZE = 40;
export const COLOR_TILE_COLS = WORLD_WIDTH / COLOR_TILE_SIZE; // 55
export const COLOR_TILE_ROWS = WORLD_HEIGHT / COLOR_TILE_SIZE; // 40
export const NAV_TILE = 50;
export const NAV_COLS = WORLD_WIDTH / NAV_TILE; // 44
export const NAV_ROWS = WORLD_HEIGHT / NAV_TILE; // 32

export const ENTITY_RADIUS = 16;
export const STAMINA_MAX = 100;
export const STAMINA_DRAIN_PER_SEC = 32;
export const STAMINA_REGEN_PER_SEC = 24;

export const DASH_COOLDOWN = 2.5;
export const DASH_DURATION = 0.18;
export const DASH_SPEED_MULT = 2.25;

export const HIDE_MAX_DURATION = 5.5;
export const HIDE_COOLDOWN = 3.0;

export const COUNTDOWN_DURATION = 2.4; // 1, 2, 3 ready timer before GO!
export const GREY_PHASE_DURATION = 10.0; // 10 real seconds black-and-white before colors reveal
export const COLOR_PHASE_DURATION = 10.0; // 10 real seconds colored chase phase
export const COLOR_FADE_DURATION = 0.8;  // Smooth reveal transition
export const ROUND_END_DURATION = 0.0;
export const SCORE_PER_SURVIVOR = 100;

export const SAFE_COLOR_PALETTE: ColorPaletteItem[] = [
  { id: 'red',    name: 'RED',    hex: '#ef4444', rgb: [239, 68, 68],   gray: [76, 76, 76] },
  { id: 'blue',   name: 'BLUE',   hex: '#3b82f6', rgb: [59, 130, 246],  gray: [104, 104, 104] },
  { id: 'green',  name: 'GREEN',  hex: '#10b981', rgb: [16, 185, 129],  gray: [122, 122, 122] },
  { id: 'yellow', name: 'YELLOW', hex: '#facc15', rgb: [250, 204, 21],  gray: [164, 164, 164] },
  { id: 'purple', name: 'PURPLE', hex: '#a855f7', rgb: [168, 85, 247],  gray: [92, 92, 92] },
  { id: 'orange', name: 'ORANGE', hex: '#f97316', rgb: [249, 115, 22],  gray: [142, 142, 142] }
];

export const DIFFICULTY_CONFIG: Record<
  Difficulty,
  {
    label: string;
    runnerSpeed: number;
    chaserSpeed: number;
    sprintMult: number;
    chaserSprintMult: number;
    chaserSightRange: number;
    runnerCount: number;
    scoreMult: number;
    escalationPerRound: number;
  }
> = {
  easy: {
    label: 'Easy',
    runnerSpeed: 220,
    chaserSpeed: 148,
    sprintMult: 1.52,
    chaserSprintMult: 1.22,
    chaserSightRange: 460,
    runnerCount: 8,
    scoreMult: 1.0,
    escalationPerRound: 5
  },
  normal: {
    label: 'Normal',
    runnerSpeed: 222,
    chaserSpeed: 164,
    sprintMult: 1.5,
    chaserSprintMult: 1.24,
    chaserSightRange: 540,
    runnerCount: 8,
    scoreMult: 1.35,
    escalationPerRound: 7
  },
  hard: {
    label: 'Hard',
    runnerSpeed: 224,
    chaserSpeed: 180,
    sprintMult: 1.48,
    chaserSprintMult: 1.26,
    chaserSightRange: 640,
    runnerCount: 8,
    scoreMult: 1.75,
    escalationPerRound: 9
  }
};

export const MAP_INFO: Record<
  MapId,
  {
    id: MapId;
    name: string;
    subtitle: string;
    accent: string;
  }
> = {
  park: {
    id: 'park',
    name: 'Whispering Woods',
    subtitle: 'Forest paths, lily pad pond, stone ruins and hiding bushes',
    accent: '#059669'
  },
  city: {
    id: 'city',
    name: 'Metro Streets',
    subtitle: 'City avenues, storefronts, parked cars and shaded alleys',
    accent: '#2563eb'
  },
  campus: {
    id: 'campus',
    name: 'Oakridge Campus',
    subtitle: 'Brick halls, fountain quad, basketball court and hedges',
    accent: '#d97706'
  },
  plaza: {
    id: 'plaza',
    name: 'Harbor Plaza',
    subtitle: 'Cobblestone shops, market canopies, cafe patios and piers',
    accent: '#e11d48'
  }
};

// Distinctive Hunter attire for the Chaser (wide-brimmed hunter hat, goggles, leather trench coat & bandolier)
export const CHASER_APPEARANCE: HumanAppearance = {
  name: 'Hunter Vance',
  tagline: 'Master tracker',
  skin: '#e5b38c',
  hairStyle: 'hunter_hat',
  hairColor: '#1c1917',
  topStyle: 'hunter_coat',
  topColor: '#292524',
  topAccent: '#dc2626',
  pantsColor: '#171717',
  shoeColor: '#451a03',
  accessory: 'bandolier',
  isChaser: true
};

export const RUNNER_APPEARANCES: HumanAppearance[] = [
  {
    name: 'Maya',
    tagline: 'Nimble tile jumper',
    skin: '#f3c6a5',
    hairStyle: 'ponytail',
    hairColor: '#c026d3',
    topStyle: 'hoodie',
    topColor: '#0284c7',
    topAccent: '#38bdf8',
    pantsColor: '#1e293b',
    shoeColor: '#f8fafc',
    accessory: 'backpack'
  },
  {
    name: 'Leo',
    tagline: 'Fast corner cutter',
    skin: '#d99b72',
    hairStyle: 'spiky',
    hairColor: '#1e1b4b',
    topStyle: 'jacket',
    topColor: '#ea580c',
    topAccent: '#fdba74',
    pantsColor: '#334155',
    shoeColor: '#facc15',
    accessory: 'headphones'
  },
  {
    name: 'Zara',
    tagline: 'Tactical spotter',
    skin: '#8d5524',
    hairStyle: 'bob',
    hairColor: '#18181b',
    topStyle: 'shirt',
    topColor: '#10b981',
    topAccent: '#a7f3d0',
    pantsColor: '#1e3a8a',
    shoeColor: '#ffffff',
    accessory: 'scarf'
  },
  {
    name: 'Noah',
    tagline: 'Cool pathfinder',
    skin: '#f7d5ba',
    hairStyle: 'cap',
    hairColor: '#78350f',
    topStyle: 'hoodie',
    topColor: '#7c3aed',
    topAccent: '#ddd6fe',
    pantsColor: '#0f172a',
    shoeColor: '#38bdf8',
    accessory: 'backpack'
  },
  {
    name: 'Chloe',
    tagline: 'Fearless sprinter',
    skin: '#e8b494',
    hairStyle: 'beanie',
    hairColor: '#b45309',
    topStyle: 'jacket',
    topColor: '#e11d48',
    topAccent: '#fda4af',
    pantsColor: '#312e81',
    shoeColor: '#e2e8f0',
    accessory: 'none'
  },
  {
    name: 'Sam',
    tagline: 'Quick juker',
    skin: '#c68642',
    hairStyle: 'short',
    hairColor: '#27272a',
    topStyle: 'shirt',
    topColor: '#eab308',
    topAccent: '#fef08a',
    pantsColor: '#1f2937',
    shoeColor: '#f97316',
    accessory: 'headphones'
  },
  {
    name: 'Ava',
    tagline: 'Alert dodge pro',
    skin: '#f5cfa8',
    hairStyle: 'ponytail',
    hairColor: '#0284c7',
    topStyle: 'hoodie',
    topColor: '#14b8a6',
    topAccent: '#99f6e4',
    pantsColor: '#27272a',
    shoeColor: '#f472b6',
    accessory: 'scarf'
  },
  {
    name: 'Kai',
    tagline: 'Steady survivor',
    skin: '#deb089',
    hairStyle: 'spiky',
    hairColor: '#0f172a',
    topStyle: 'jacket',
    topColor: '#4f46e5',
    topAccent: '#a5b4fc',
    pantsColor: '#1e293b',
    shoeColor: '#f8fafc',
    accessory: 'cap'
  }
];
