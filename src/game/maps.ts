import {
  COLOR_TILE_COLS,
  COLOR_TILE_ROWS,
  COLOR_TILE_SIZE,
  NAV_COLS,
  NAV_ROWS,
  NAV_TILE,
  SAFE_COLOR_PALETTE,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from './constants';
import {
  ColorBlock,
  DecorPatch,
  HidingSpot,
  MapId,
  RectObstacle,
  ScatterDetail,
  TreeProp
} from './types';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

const FADE_COLOR_CACHE = new Map<string, string>();
function fadeHex(hex: string, tFade: number): string {
  if (tFade >= 0.99 || !hex.startsWith('#') || hex.length !== 7) return hex;
  const step = Math.round(clamp(tFade, 0, 1) * 12);
  if (step >= 12) return hex;
  const key = `${hex}_${step}`;
  const cached = FADE_COLOR_CACHE.get(key);
  if (cached) return cached;

  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const t = step / 12;
  const rr = Math.round(lum + (r - lum) * t);
  const gg = Math.round(lum + (g - lum) * t);
  const bb = Math.round(lum + (b - lum) * t);
  const out = `rgb(${rr},${gg},${bb})`;
  FADE_COLOR_CACHE.set(key, out);
  return out;
}

const BFS_TOTAL = NAV_ROWS * NAV_COLS;
const bfsVisited = new Uint8Array(BFS_TOTAL);
const bfsParent = new Int16Array(BFS_TOTAL);
const bfsQueue = new Int16Array(BFS_TOTAL);

function resolveCircleRect(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): { hit: boolean; nx: number; ny: number } {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  const d2 = dx * dx + dy * dy;
  if (d2 < r * r) {
    const d = Math.sqrt(d2) || 0.0001;
    const overlap = r - d;
    return { hit: true, nx: (dx / d) * overlap, ny: (dy / d) * overlap };
  }
  return { hit: false, nx: 0, ny: 0 };
}

function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  // Sample along segment for fast reliable LOS checks against solid tall obstacles
  const steps = Math.max(4, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 22));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) {
      return true;
    }
  }
  return false;
}

export class WorldMap {
  id: MapId;
  baseColor = '#3b7a62';
  decor: DecorPatch[] = [];
  obstacles: RectObstacle[] = [];
  trees: TreeProp[] = [];
  hidingSpots: HidingSpot[] = [];
  details: ScatterDetail[] = [];
  navBlocked: boolean[][] = [];
  colorGrid: number[][] = [];
  tileWalkable: boolean[][] = [];
  safeTileCenters: { x: number; y: number }[] = [];
  targetColorIndex = 0;
  colorFade = 0; // 0 = black & white (grey phase), 1 = full color
  spawnPoints: { x: number; y: number }[] = [];
  chaserSpawn: { x: number; y: number } = { x: 1100, y: 800 };

  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;
  private lastMinimapFade = -1;
  private lastMinimapHighlight = false;

  constructor(id: MapId) {
    this.id = id;
    this.buildMap(id);
    this.buildNavGrid();
    this.buildTileWalkability();
    this.generateColorBlocks();
  }

  private buildMap(id: MapId) {
    this.decor = [];
    this.obstacles = [];
    this.trees = [];
    this.hidingSpots = [];
    this.details = [];
    this.spawnPoints = [];

    if (id === 'park') this.buildPark();
    else if (id === 'city') this.buildCity();
    else if (id === 'campus') this.buildCampus();
    else this.buildPlaza();
  }

  // =========================================================================
  // MAP 1: WHISPERING WOODS (Inspired by lush RPG forest & pond map)
  // =========================================================================
  private buildPark() {
    this.baseColor = '#3f7d64';

    // Lighter meadow clearings
    this.decor.push(
      { kind: 'grass_patch', x: 220, y: 200, w: 500, h: 360, color: '#478b6f' },
      { kind: 'grass_patch', x: 1380, y: 240, w: 520, h: 400, color: '#478b6f' },
      { kind: 'grass_patch', x: 760, y: 520, w: 680, h: 520, color: '#478b6f' },
      { kind: 'grass_patch', x: 260, y: 1020, w: 560, h: 420, color: '#478b6f' },
      { kind: 'grass_patch', x: 1350, y: 980, w: 560, h: 420, color: '#478b6f' }
    );

    // Winding dirt footpaths forming loops around the pond & woods
    const dirt = '#8f7758';
    this.decor.push(
      { kind: 'path', x: 180, y: 270, w: 1820, h: 72, color: dirt },
      { kind: 'path', x: 180, y: 1240, w: 1820, h: 72, color: dirt },
      { kind: 'path', x: 320, y: 270, w: 72, h: 1040, color: dirt },
      { kind: 'path', x: 1740, y: 270, w: 72, h: 1040, color: dirt },
      { kind: 'path', x: 760, y: 270, w: 74, h: 1040, color: dirt },
      { kind: 'path', x: 1350, y: 270, w: 74, h: 1040, color: dirt },
      { kind: 'path', x: 760, y: 745, w: 660, h: 74, color: dirt }
    );

    // Wooden bridges across the central pond
    this.decor.push(
      { kind: 'pier', x: 1048, y: 610, w: 104, h: 350, color: '#9a6e45' }
    );

    // Central pond (two split basins on either side of the wooden bridge)
    this.obstacles.push(
      { kind: 'water', x: 870, y: 650, w: 175, h: 265, color: '#3b8da8' },
      { kind: 'water', x: 1155, y: 650, w: 175, h: 265, color: '#3b8da8' },
      // East corner ancient stone ruin wall & crate
      { kind: 'wall', x: 1920, y: 120, w: 54, h: 420, color: '#64748b', roofColor: '#94a3b8' },
      { kind: 'wall', x: 1920, y: 680, w: 54, h: 360, color: '#64748b', roofColor: '#94a3b8' },
      { kind: 'crate', x: 2040, y: 310, w: 46, h: 42, color: '#7c5338' },
      // Fallen logs & boulders
      { kind: 'log', x: 520, y: 520, w: 120, h: 34, color: '#6b472d' },
      { kind: 'log', x: 1510, y: 540, w: 125, h: 34, color: '#6b472d' },
      { kind: 'log', x: 520, y: 1010, w: 118, h: 34, color: '#6b472d' },
      { kind: 'log', x: 1500, y: 1020, w: 125, h: 34, color: '#6b472d' },
      { kind: 'rock', x: 640, y: 740, w: 58, h: 48, color: '#6b7280' },
      { kind: 'rock', x: 1520, y: 780, w: 62, h: 50, color: '#6b7280' },
      { kind: 'rock', x: 1080, y: 180, w: 64, h: 52, color: '#6b7280' },
      // Park benches
      { kind: 'bench', x: 920, y: 585, w: 86, h: 28, color: '#855836' },
      { kind: 'bench', x: 1200, y: 945, w: 86, h: 28, color: '#855836' },
      { kind: 'bench', x: 420, y: 420, w: 86, h: 28, color: '#855836' }
    );

    // Lush trees (pine & oak/birch)
    const treeCoords: [number, number, 'pine' | 'oak' | 'birch'][] = [
      [140, 140, 'pine'], [290, 130, 'oak'], [520, 145, 'pine'], [720, 140, 'birch'],
      [940, 150, 'oak'], [1260, 150, 'pine'], [1480, 140, 'oak'], [1680, 145, 'pine'],
      [140, 420, 'oak'], [155, 680, 'pine'], [145, 960, 'oak'], [155, 1410, 'pine'],
      [510, 680, 'oak'], [560, 880, 'pine'], [640, 430, 'birch'], [640, 1130, 'oak'],
      [960, 430, 'pine'], [1240, 430, 'birch'], [960, 1120, 'oak'], [1240, 1120, 'pine'],
      [1580, 420, 'oak'], [1610, 910, 'pine'], [1580, 1140, 'birch'],
      [480, 1440, 'oak'], [880, 1440, 'pine'], [1280, 1440, 'birch'], [1680, 1430, 'oak'],
      [2040, 920, 'pine'], [2050, 1250, 'oak']
    ];
    for (const [x, y, kind] of treeCoords) {
      this.trees.push({
        kind,
        x,
        y,
        trunkRadius: 16,
        canopyRadius: kind === 'pine' ? 42 : 48,
        tint: kind === 'pine' ? '#1b6b59' : kind === 'birch' ? '#2e8b6e' : '#24775d'
      });
    }

    // Hiding bushes scattered around escape paths
    const bushCoords: [number, number][] = [
      [450, 210], [890, 215], [1390, 215],
      [250, 560], [685, 610], [1480, 620],
      [260, 1080], [690, 1010], [1480, 1120],
      [1080, 1370], [1860, 580], [1860, 1140]
    ];
    bushCoords.forEach(([x, y], i) => {
      this.hidingSpots.push({
        id: i,
        kind: 'bush',
        x,
        y,
        radius: 30,
        color: '#1b5e43',
        occupants: 0
      });
    });

    // Lily pads & campfire (flowers/mushrooms omitted so small tiles replace grass cleanly)
    this.details.push(
      { kind: 'lilypad', x: 920, y: 710, size: 11 },
      { kind: 'lilypad', x: 985, y: 840, size: 13 },
      { kind: 'lilypad', x: 1210, y: 720, size: 12 },
      { kind: 'lilypad', x: 1270, y: 850, size: 10 },
      { kind: 'campfire', x: 2060, y: 400, size: 18 }
    );

    this.chaserSpawn = { x: 1100, y: 495 };
    this.spawnPoints = [
      { x: 356, y: 306 },
      { x: 1776, y: 306 },
      { x: 356, y: 1276 },
      { x: 1776, y: 1276 },
      { x: 796, y: 780 },
      { x: 1386, y: 780 },
      { x: 1100, y: 1276 }
    ];
  }

  // =========================================================================
  // MAP 2: METRO CITY STREETS
  // =========================================================================
  private buildCity() {
    this.baseColor = '#475569'; // Concrete sidewalk tone

    // Asphalt avenues & cross streets
    const asphalt = '#1e2430';
    this.decor.push(
      { kind: 'road_h', x: 0, y: 320, w: WORLD_WIDTH, h: 170, color: asphalt },
      { kind: 'road_h', x: 0, y: 1080, w: WORLD_WIDTH, h: 170, color: asphalt },
      { kind: 'road_v', x: 420, y: 0, w: 170, h: WORLD_HEIGHT, color: asphalt },
      { kind: 'road_v', x: 1580, y: 0, w: 170, h: WORLD_HEIGHT, color: asphalt },
      { kind: 'road_v', x: 1020, y: 320, w: 140, h: 930, color: asphalt },
      // Central mini-park median
      { kind: 'grass_patch', x: 650, y: 560, w: 300, h: 450, color: '#2e6f54' },
      { kind: 'grass_patch', x: 1220, y: 560, w: 300, h: 450, color: '#2e6f54' }
    );

    // Zebra crosswalks at major intersections
    const intersections = [
      [420, 320], [1020, 320], [1580, 320],
      [420, 1080], [1020, 1080], [1580, 1080]
    ];
    for (const [ix, iy] of intersections) {
      this.details.push({ kind: 'crosswalk', x: ix, y: iy, size: 140 });
    }

    // City Buildings (with rich storefronts & roof details)
    this.obstacles.push(
      { kind: 'building', x: 70, y: 60, w: 280, h: 200, color: '#7c2d12', roofColor: '#451a03', accentColor: '#fb923c', label: 'COFFEE' },
      { kind: 'building', x: 670, y: 60, w: 300, h: 200, color: '#1e3a8a', roofColor: '#172554', accentColor: '#38bdf8', label: 'ARCADE' },
      { kind: 'building', x: 1210, y: 60, w: 300, h: 200, color: '#831843', roofColor: '#500724', accentColor: '#f472b6', label: 'DINER' },
      { kind: 'building', x: 1830, y: 60, w: 300, h: 200, color: '#065f46', roofColor: '#022c22', accentColor: '#34d399', label: 'MARKET' },

      { kind: 'building', x: 70, y: 560, w: 280, h: 440, color: '#334155', roofColor: '#1e293b', accentColor: '#94a3b8', label: 'METRO APTS' },
      { kind: 'building', x: 1830, y: 560, w: 300, h: 440, color: '#4c1d95', roofColor: '#2e1065', accentColor: '#a78bfa', label: 'THEATER' },

      { kind: 'building', x: 70, y: 1310, w: 280, h: 220, color: '#78350f', roofColor: '#451a03', accentColor: '#fbbf24', label: 'BAKERY' },
      { kind: 'building', x: 670, y: 1310, w: 290, h: 220, color: '#1e293b', roofColor: '#0f172a', accentColor: '#60a5fa', label: 'BANK' },
      { kind: 'building', x: 1220, y: 1310, w: 290, h: 220, color: '#7f1d1d', roofColor: '#450a0a', accentColor: '#f87171', label: 'GARAGE' },
      { kind: 'building', x: 1830, y: 1310, w: 300, h: 220, color: '#134e4a', roofColor: '#042f2e', accentColor: '#2dd4bf', label: 'PHARMACY' },

      // Parked cars & taxis on streets
      { kind: 'car', x: 170, y: 345, w: 110, h: 52, color: '#eab308', direction: 'h' },
      { kind: 'car', x: 740, y: 418, w: 110, h: 52, color: '#ef4444', direction: 'h' },
      { kind: 'car', x: 1320, y: 345, w: 116, h: 52, color: '#3b82f6', direction: 'h' },
      { kind: 'car', x: 1900, y: 1105, w: 112, h: 52, color: '#10b981', direction: 'h' },
      { kind: 'car', x: 780, y: 1180, w: 112, h: 52, color: '#f8fafc', direction: 'h' },
      { kind: 'car', x: 445, y: 710, w: 52, h: 110, color: '#f97316', direction: 'v' },
      { kind: 'car', x: 1675, y: 740, w: 52, h: 112, color: '#a855f7', direction: 'v' },

      // Street benches & crates
      { kind: 'bench', x: 750, y: 660, w: 90, h: 28, color: '#785032' },
      { kind: 'bench', x: 1320, y: 880, w: 90, h: 28, color: '#785032' },
      { kind: 'crate', x: 1040, y: 120, w: 52, h: 48, color: '#6b4c35' }
    );

    // Street trees
    const treePts: [number, number][] = [
      [690, 595], [910, 595], [690, 965], [910, 965],
      [1260, 595], [1480, 595], [1260, 965], [1480, 965]
    ];
    treePts.forEach(([x, y]) => {
      this.trees.push({ kind: 'oak', x, y, trunkRadius: 15, canopyRadius: 42, tint: '#237558' });
    });

    // Urban hiding spots (planter hedges & shaded alley alcoves)
    const hidePts: [number, number, 'hedge' | 'alcove'][] = [
      [385, 225, 'alcove'], [995, 225, 'alcove'], [1545, 225, 'alcove'],
      [800, 785, 'hedge'], [1370, 785, 'hedge'],
      [385, 810, 'alcove'], [1790, 810, 'alcove'],
      [385, 1345, 'alcove'], [995, 1345, 'alcove'], [1545, 1345, 'alcove']
    ];
    hidePts.forEach(([x, y, kind], i) => {
      this.hidingSpots.push({
        id: i,
        kind,
        x,
        y,
        radius: 28,
        color: kind === 'hedge' ? '#166534' : '#334155',
        occupants: 0
      });
    });

    // Streetlamps
    for (const lx of [390, 620, 1185, 1550, 1790]) {
      this.details.push({ kind: 'lamp', x: lx, y: 305 }, { kind: 'lamp', x: lx, y: 1065 });
    }

    this.chaserSpawn = { x: 1090, y: 785 };
    this.spawnPoints = [
      { x: 505, y: 405 },
      { x: 1665, y: 405 },
      { x: 505, y: 1165 },
      { x: 1665, y: 1165 },
      { x: 250, y: 405 },
      { x: 1920, y: 405 },
      { x: 1090, y: 150 }
    ];
  }

  // =========================================================================
  // MAP 3: OAKRIDGE CAMPUS
  // =========================================================================
  private buildCampus() {
    this.baseColor = '#3f7c54'; // Campus quad lawn

    // Paved stone campus walkways & central plaza
    const stone = '#94a3b8';
    this.decor.push(
      { kind: 'plaza', x: 850, y: 560, w: 500, h: 480, color: '#cbd5e1' },
      { kind: 'path', x: 200, y: 310, w: 1800, h: 76, color: stone },
      { kind: 'path', x: 200, y: 1210, w: 1800, h: 76, color: stone },
      { kind: 'path', x: 460, y: 200, w: 76, h: 1200, color: stone },
      { kind: 'path', x: 1660, y: 200, w: 76, h: 1200, color: stone },
      { kind: 'path', x: 1062, y: 180, w: 76, h: 1240, color: stone },
      { kind: 'path', x: 200, y: 762, w: 1800, h: 76, color: stone },
      // Outdoor Basketball Court on West Lawn
      { kind: 'court', x: 590, y: 470, w: 220, h: 240, color: '#b45309' }
    );

    // Brick Campus Buildings & Fountain
    this.obstacles.push(
      { kind: 'building', x: 640, y: 60, w: 360, h: 190, color: '#991b1b', roofColor: '#450a0a', accentColor: '#e2e8f0', label: 'MAIN HALL' },
      { kind: 'building', x: 1200, y: 60, w: 360, h: 190, color: '#9a3412', roofColor: '#431407', accentColor: '#fde68a', label: 'LIBRARY' },
      { kind: 'building', x: 80, y: 520, w: 300, h: 520, color: '#7f1d1d', roofColor: '#450a0a', accentColor: '#fca5a5', label: 'GYMNASIUM' },
      { kind: 'building', x: 1820, y: 520, w: 300, h: 520, color: '#1e3a8a', roofColor: '#172554', accentColor: '#93c5fd', label: 'SCIENCE WING' },
      { kind: 'building', x: 640, y: 1340, w: 360, h: 190, color: '#854d0e', roofColor: '#422006', accentColor: '#fef08a', label: 'CAFETERIA' },
      { kind: 'building', x: 1200, y: 1340, w: 360, h: 190, color: '#374151', roofColor: '#111827', accentColor: '#d1d5db', label: 'ARTS CENTER' },
      // Central Quad Fountain
      { kind: 'fountain', x: 1030, y: 730, w: 140, h: 140, color: '#38bdf8' },
      // Campus Benches & Picnic Tables
      { kind: 'table', x: 1410, y: 520, w: 96, h: 52, color: '#855836' },
      { kind: 'table', x: 1410, y: 630, w: 96, h: 52, color: '#855836' },
      { kind: 'table', x: 1410, y: 980, w: 96, h: 52, color: '#855836' },
      { kind: 'bench', x: 920, y: 600, w: 90, h: 28, color: '#785032' },
      { kind: 'bench', x: 1190, y: 970, w: 90, h: 28, color: '#785032' }
    );

    // Campus Oak & Birch Trees
    const treePts: [number, number, 'oak' | 'birch'][] = [
      [250, 180, 'oak'], [250, 1410, 'birch'], [1950, 180, 'oak'], [1950, 1410, 'birch'],
      [620, 960, 'oak'], [740, 1080, 'birch'], [1480, 440, 'oak'], [1520, 1100, 'birch']
    ];
    treePts.forEach(([x, y, kind]) => {
      this.trees.push({ kind, x, y, trunkRadius: 15, canopyRadius: 46, tint: '#226f54' });
    });

    // Trimmed Courtyard Hedges (Hiding Spots)
    const hedgePts: [number, number][] = [
      [580, 280], [1600, 280],
      [880, 620], [1320, 620],
      [880, 980], [1320, 980],
      [580, 1310], [1600, 1310],
      [420, 620], [1770, 980]
    ];
    hedgePts.forEach(([x, y], i) => {
      this.hidingSpots.push({
        id: i,
        kind: 'hedge',
        x,
        y,
        radius: 30,
        color: '#15803d',
        occupants: 0
      });
    });

    this.chaserSpawn = { x: 1100, y: 520 };
    this.spawnPoints = [
      { x: 498, y: 348 },
      { x: 1698, y: 348 },
      { x: 498, y: 1248 },
      { x: 1698, y: 1248 },
      { x: 1098, y: 1248 },
      { x: 250, y: 420 },
      { x: 1940, y: 420 }
    ];
  }

  // =========================================================================
  // MAP 4: HARBOR MARKET PLAZA
  // =========================================================================
  private buildPlaza() {
    this.baseColor = '#b59f84'; // Warm Mediterranean cobblestone

    // Main promenade & harbor waterfront
    this.decor.push(
      { kind: 'plaza', x: 140, y: 140, w: 1920, h: 1140, color: '#c4b199' },
      { kind: 'path', x: 140, y: 540, w: 1920, h: 90, color: '#a89378' },
      { kind: 'path', x: 140, y: 950, w: 1920, h: 90, color: '#a89378' },
      { kind: 'path', x: 560, y: 140, w: 90, h: 1160, color: '#a89378' },
      { kind: 'path', x: 1540, y: 140, w: 90, h: 1160, color: '#a89378' },
      // Wooden harbor piers extending over water
      { kind: 'pier', x: 540, y: 1290, w: 130, h: 270, color: '#8b5e34' },
      { kind: 'pier', x: 1520, y: 1290, w: 130, h: 270, color: '#8b5e34' }
    );

    // Harbor water along bottom (split around the two piers)
    this.obstacles.push(
      { kind: 'water', x: 0, y: 1310, w: 540, h: 290, color: '#2b7a9b' },
      { kind: 'water', x: 670, y: 1310, w: 850, h: 290, color: '#2b7a9b' },
      { kind: 'water', x: 1650, y: 1310, w: 550, h: 290, color: '#2b7a9b' },

      // Boutique storefronts along north promenade
      { kind: 'building', x: 140, y: 50, w: 320, h: 180, color: '#b91c1c', roofColor: '#7f1d1d', accentColor: '#fecaca', label: 'GELATO' },
      { kind: 'building', x: 720, y: 50, w: 320, h: 180, color: '#0369a1', roofColor: '#0c4a6e', accentColor: '#bae6fd', label: 'BOUTIQUE' },
      { kind: 'building', x: 1180, y: 50, w: 320, h: 180, color: '#047857', roofColor: '#064e3b', accentColor: '#a7f3d0', label: 'BISTRO' },
      { kind: 'building', x: 1740, y: 50, w: 320, h: 180, color: '#9333ea', roofColor: '#581c87', accentColor: '#e9d5ff', label: 'CURIOS' },

      // Market stalls with striped awnings
      { kind: 'stall', x: 260, y: 350, w: 150, h: 72, color: '#dc2626', accentColor: '#ffffff' },
      { kind: 'stall', x: 260, y: 720, w: 150, h: 72, color: '#2563eb', accentColor: '#fef08a' },
      { kind: 'stall', x: 840, y: 360, w: 160, h: 72, color: '#16a34a', accentColor: '#ffffff' },
      { kind: 'stall', x: 1210, y: 360, w: 160, h: 72, color: '#ea580c', accentColor: '#ffffff' },
      { kind: 'stall', x: 1770, y: 350, w: 150, h: 72, color: '#0891b2', accentColor: '#ffffff' },
      { kind: 'stall', x: 1770, y: 720, w: 150, h: 72, color: '#db2777', accentColor: '#ffffff' },

      // Central Plaza Fountain & Café Tables
      { kind: 'fountain', x: 1030, y: 700, w: 140, h: 140, color: '#38bdf8' },
      { kind: 'table', x: 760, y: 730, w: 74, h: 74, color: '#ef4444' },
      { kind: 'table', x: 1360, y: 730, w: 74, h: 74, color: '#3b82f6' },
      { kind: 'table', x: 820, y: 1120, w: 74, h: 74, color: '#10b981' },
      { kind: 'table', x: 1300, y: 1120, w: 74, h: 74, color: '#f59e0b' },
      { kind: 'crate', x: 430, y: 1130, w: 54, h: 48, color: '#785032' },
      { kind: 'crate', x: 1720, y: 1130, w: 54, h: 48, color: '#785032' }
    );

    // Coastal palm trees
    const palmPts: [number, number][] = [
      [160, 460], [160, 1140], [2040, 460], [2040, 1140],
      [740, 620], [1460, 620], [740, 920], [1460, 920]
    ];
    palmPts.forEach(([x, y]) => {
      this.trees.push({ kind: 'palm', x, y, trunkRadius: 13, canopyRadius: 44, tint: '#15803d' });
    });

    // Market Tent & Flowerbed Hiding Spots
    const hidePts: [number, number, 'tent' | 'hedge'][] = [
      [510, 290, 'tent'], [1690, 290, 'tent'],
      [330, 880, 'hedge'], [1850, 880, 'hedge'],
      [1100, 470, 'tent'], [1100, 1080, 'tent'],
      [605, 1420, 'tent'], [1585, 1420, 'tent']
    ];
    hidePts.forEach(([x, y, kind], i) => {
      this.hidingSpots.push({
        id: i,
        kind,
        x,
        y,
        radius: 30,
        color: kind === 'tent' ? '#7c3aed' : '#15803d',
        occupants: 0
      });
    });

    // Moored Harbor Boats
    this.details.push(
      { kind: 'boat', x: 350, y: 1460, color: '#f8fafc', size: 70 },
      { kind: 'boat', x: 1100, y: 1475, color: '#ef4444', size: 76 },
      { kind: 'boat', x: 1840, y: 1460, color: '#38bdf8', size: 70 }
    );

    this.chaserSpawn = { x: 1100, y: 585 };
    this.spawnPoints = [
      { x: 605, y: 585 },
      { x: 1585, y: 585 },
      { x: 605, y: 995 },
      { x: 1585, y: 995 },
      { x: 240, y: 585 },
      { x: 1940, y: 585 },
      { x: 605, y: 1510 }
    ];
  }

  // =========================================================================
  // NAVIGATION GRID & COLLISION HELPERS
  // =========================================================================
  private buildNavGrid() {
    this.navBlocked = Array.from({ length: NAV_ROWS }, () => new Array(NAV_COLS).fill(false));

    for (let r = 0; r < NAV_ROWS; r++) {
      for (let c = 0; c < NAV_COLS; c++) {
        const rx = c * NAV_TILE + 6;
        const ry = r * NAV_TILE + 6;
        const rw = NAV_TILE - 12;
        const rh = NAV_TILE - 12;

        let blocked = false;
        for (const obs of this.obstacles) {
          if (rx < obs.x + obs.w && rx + rw > obs.x && ry < obs.y + obs.h && ry + rh > obs.y) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          const cx = c * NAV_TILE + NAV_TILE / 2;
          const cy = r * NAV_TILE + NAV_TILE / 2;
          for (const t of this.trees) {
            if (Math.hypot(cx - t.x, cy - t.y) < t.trunkRadius + 16) {
              blocked = true;
              break;
            }
          }
        }
        this.navBlocked[r][c] = blocked;
      }
    }
  }

  moveEntity(entity: { x: number; y: number; radius: number }, dx: number, dy: number) {
    const r = entity.radius;
    entity.x = clamp(entity.x + dx, r + 10, WORLD_WIDTH - r - 10);
    this.resolveCollisions(entity);
    entity.y = clamp(entity.y + dy, r + 10, WORLD_HEIGHT - r - 10);
    this.resolveCollisions(entity);
  }

  private resolveCollisions(entity: { x: number; y: number; radius: number }) {
    for (const obs of this.obstacles) {
      const res = resolveCircleRect(entity.x, entity.y, entity.radius, obs.x, obs.y, obs.w, obs.h);
      if (res.hit) {
        entity.x += res.nx;
        entity.y += res.ny;
      }
    }
    for (const t of this.trees) {
      const dx = entity.x - t.x;
      const dy = entity.y - t.y;
      const minD = entity.radius + t.trunkRadius;
      const d2 = dx * dx + dy * dy;
      if (d2 < minD * minD) {
        const d = Math.sqrt(d2) || 0.001;
        const push = minD - d;
        entity.x += (dx / d) * push;
        entity.y += (dy / d) * push;
      }
    }
  }

  hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    for (const obs of this.obstacles) {
      // Low obstacles (water, bench, rock, log) don't block line of sight; buildings/walls/cars/stalls do
      if (obs.kind === 'water' || obs.kind === 'bench' || obs.kind === 'log' || obs.kind === 'table') {
        continue;
      }
      if (segmentIntersectsRect(x1, y1, x2, y2, obs.x, obs.y, obs.w, obs.h)) {
        return false;
      }
    }
    return true;
  }

  findNextWaypoint(sx: number, sy: number, tx: number, ty: number): { x: number; y: number } {
    const sc = clamp(Math.floor(sx / NAV_TILE), 0, NAV_COLS - 1);
    const sr = clamp(Math.floor(sy / NAV_TILE), 0, NAV_ROWS - 1);
    const gc = clamp(Math.floor(tx / NAV_TILE), 0, NAV_COLS - 1);
    const gr = clamp(Math.floor(ty / NAV_TILE), 0, NAV_ROWS - 1);

    if (sc === gc && sr === gr) return { x: tx, y: ty };

    bfsVisited.fill(0);
    bfsParent.fill(-1);

    const startIdx = sr * NAV_COLS + sc;
    const goalIdx = gr * NAV_COLS + gc;
    let head = 0;
    let tail = 0;
    bfsQueue[tail++] = startIdx;
    bfsVisited[startIdx] = 1;

    let found = -1;
    while (head < tail) {
      const curIdx = bfsQueue[head++];
      if (curIdx === goalIdx) {
        found = curIdx;
        break;
      }
      const r = Math.floor(curIdx / NAV_COLS);
      const c = curIdx - r * NAV_COLS;

      // 4 neighbors (down, up, right, left)
      if (r + 1 < NAV_ROWS) {
        const ni = curIdx + NAV_COLS;
        if (!bfsVisited[ni] && (!this.navBlocked[r + 1][c] || ni === goalIdx)) {
          bfsVisited[ni] = 1;
          bfsParent[ni] = curIdx;
          bfsQueue[tail++] = ni;
        }
      }
      if (r - 1 >= 0) {
        const ni = curIdx - NAV_COLS;
        if (!bfsVisited[ni] && (!this.navBlocked[r - 1][c] || ni === goalIdx)) {
          bfsVisited[ni] = 1;
          bfsParent[ni] = curIdx;
          bfsQueue[tail++] = ni;
        }
      }
      if (c + 1 < NAV_COLS) {
        const ni = curIdx + 1;
        if (!bfsVisited[ni] && (!this.navBlocked[r][c + 1] || ni === goalIdx)) {
          bfsVisited[ni] = 1;
          bfsParent[ni] = curIdx;
          bfsQueue[tail++] = ni;
        }
      }
      if (c - 1 >= 0) {
        const ni = curIdx - 1;
        if (!bfsVisited[ni] && (!this.navBlocked[r][c - 1] || ni === goalIdx)) {
          bfsVisited[ni] = 1;
          bfsParent[ni] = curIdx;
          bfsQueue[tail++] = ni;
        }
      }
    }

    if (found === -1) return { x: tx, y: ty };

    let cur = found;
    while (bfsParent[cur] !== -1) {
      const p = bfsParent[cur];
      if (p === startIdx) {
        const rr = Math.floor(cur / NAV_COLS);
        const cc = cur - rr * NAV_COLS;
        return { x: cc * NAV_TILE + NAV_TILE / 2, y: rr * NAV_TILE + NAV_TILE / 2 };
      }
      cur = p;
    }
    return { x: tx, y: ty };
  }

  getNearestHidingSpot(x: number, y: number, maxRange = 54): HidingSpot | null {
    let best: HidingSpot | null = null;
    let bestD = maxRange;
    for (const h of this.hidingSpots) {
      const d = Math.hypot(x - h.x, y - h.y);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  }

  private buildTileWalkability() {
    this.tileWalkable = Array.from({ length: COLOR_TILE_ROWS }, () =>
      new Array(COLOR_TILE_COLS).fill(true)
    );
    for (let r = 0; r < COLOR_TILE_ROWS; r++) {
      for (let c = 0; c < COLOR_TILE_COLS; c++) {
        const cx = c * COLOR_TILE_SIZE + COLOR_TILE_SIZE / 2;
        const cy = r * COLOR_TILE_SIZE + COLOR_TILE_SIZE / 2;
        let ok = cx >= 26 && cx <= WORLD_WIDTH - 26 && cy >= 26 && cy <= WORLD_HEIGHT - 26;
        if (ok) {
          for (const obs of this.obstacles) {
            if (
              cx >= obs.x - 6 &&
              cx <= obs.x + obs.w + 6 &&
              cy >= obs.y - 6 &&
              cy <= obs.y + obs.h + 6
            ) {
              ok = false;
              break;
            }
          }
        }
        if (ok) {
          for (const t of this.trees) {
            if (Math.hypot(cx - t.x, cy - t.y) < t.trunkRadius + 10) {
              ok = false;
              break;
            }
          }
        }
        this.tileWalkable[r][c] = ok;
      }
    }
  }

  generateColorBlocks(avoidColorIndex?: number, keepFullColor = false) {
    const numColors = SAFE_COLOR_PALETTE.length;
    let nextColor = Math.floor(Math.random() * numColors);
    if (avoidColorIndex !== undefined && nextColor === avoidColorIndex) {
      nextColor = (nextColor + 1 + Math.floor(Math.random() * (numColors - 1))) % numColors;
    }
    this.targetColorIndex = nextColor;
    this.colorGrid = Array.from({ length: COLOR_TILE_ROWS }, () =>
      new Array(COLOR_TILE_COLS).fill(-1)
    );

    const hasAdjacentSameColor = (r: number, c: number, colorIdx: number): boolean => {
      for (let dr = -1; dr <= 1; dr++) {
        const nr = r + dr;
        if (nr < 0 || nr >= COLOR_TILE_ROWS) continue;
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nc = c + dc;
          if (nc < 0 || nc >= COLOR_TILE_COLS) continue;
          if (this.colorGrid[nr][nc] === colorIdx) return true;
        }
      }
      return false;
    };

    // 1. Place well-spaced single Safe Color tiles across all 4 quadrants (never next-to-next)
    const placedSafe: [number, number][] = [];
    const quadRanges: [number, number, number, number][] = [
      [2, Math.floor(COLOR_TILE_ROWS / 2) - 2, 2, Math.floor(COLOR_TILE_COLS / 2) - 2],
      [2, Math.floor(COLOR_TILE_ROWS / 2) - 2, Math.floor(COLOR_TILE_COLS / 2) + 1, COLOR_TILE_COLS - 3],
      [Math.floor(COLOR_TILE_ROWS / 2) + 1, COLOR_TILE_ROWS - 3, 2, Math.floor(COLOR_TILE_COLS / 2) - 2],
      [Math.floor(COLOR_TILE_ROWS / 2) + 1, COLOR_TILE_ROWS - 3, Math.floor(COLOR_TILE_COLS / 2) + 1, COLOR_TILE_COLS - 3]
    ];

    for (const [rMin, rMax, cMin, cMax] of quadRanges) {
      const candidates: [number, number][] = [];
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          if (this.tileWalkable[r][c]) {
            candidates.push([r, c]);
          }
        }
      }
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = tmp;
      }

      let quadSafe = 0;
      for (const [sr, sc] of candidates) {
        if (quadSafe >= 10) break;
        let tooClose = false;
        for (const [er, ec] of placedSafe) {
          if (Math.abs(sr - er) <= 4 && Math.abs(sc - ec) <= 4) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;
        this.colorGrid[sr][sc] = this.targetColorIndex;
        placedSafe.push([sr, sc]);
        quadSafe++;
      }
    }

    // 2. Scatter mixed single decoy tiles on ~43% of remaining walkable cells so grass shows clearly,
    //    guaranteeing NO two tiles of the same color touch orthogonally or diagonally.
    const decoyCandidates: [number, number][] = [];
    for (let r = 1; r < COLOR_TILE_ROWS - 1; r++) {
      for (let c = 1; c < COLOR_TILE_COLS - 1; c++) {
        if (!this.tileWalkable[r][c] || this.colorGrid[r][c] !== -1) continue;
        decoyCandidates.push([r, c]);
      }
    }
    for (let i = decoyCandidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = decoyCandidates[i];
      decoyCandidates[i] = decoyCandidates[j];
      decoyCandidates[j] = tmp;
    }

    const decoyPool: number[] = [];
    for (let ci = 0; ci < numColors; ci++) {
      if (ci !== this.targetColorIndex) decoyPool.push(ci);
    }

    const decoyTarget = Math.floor(decoyCandidates.length * 0.43);
    let decoyPlaced = 0;
    for (const [r, c] of decoyCandidates) {
      if (decoyPlaced >= decoyTarget) break;
      const startIdx = Math.floor(Math.random() * decoyPool.length);
      let chosen = -1;
      for (let k = 0; k < decoyPool.length; k++) {
        const ci = decoyPool[(startIdx + k) % decoyPool.length];
        if (!hasAdjacentSameColor(r, c, ci)) {
          chosen = ci;
          break;
        }
      }
      if (chosen !== -1) {
        this.colorGrid[r][c] = chosen;
        decoyPlaced++;
      }
    }

    // Cache walkable safe tile centers for fast AI & directional compass lookups
    this.safeTileCenters = [];
    for (let r = 0; r < COLOR_TILE_ROWS; r++) {
      for (let c = 0; c < COLOR_TILE_COLS; c++) {
        if (this.tileWalkable[r][c] && this.colorGrid[r][c] === this.targetColorIndex) {
          this.safeTileCenters.push({
            x: c * COLOR_TILE_SIZE + COLOR_TILE_SIZE / 2,
            y: r * COLOR_TILE_SIZE + COLOR_TILE_SIZE / 2
          });
        }
      }
    }

    this.colorFade = keepFullColor ? 1 : 0;
    this.lastMinimapFade = -1;
  }

  reshuffleColorBlocks(avoidColorIndex?: number, keepFullColor = false) {
    this.generateColorBlocks(avoidColorIndex, keepFullColor);
  }

  getColorBlockAt(x: number, y: number): ColorBlock | null {
    const c = clamp(Math.floor(x / COLOR_TILE_SIZE), 0, COLOR_TILE_COLS - 1);
    const r = clamp(Math.floor(y / COLOR_TILE_SIZE), 0, COLOR_TILE_ROWS - 1);
    const colorIndex = this.colorGrid[r]?.[c];
    if (colorIndex === undefined || colorIndex < 0) return null;
    return {
      x: c * COLOR_TILE_SIZE,
      y: r * COLOR_TILE_SIZE,
      w: COLOR_TILE_SIZE,
      h: COLOR_TILE_SIZE,
      colorIndex
    };
  }

  isOnSafeColorBlock(x: number, y: number): boolean {
    if (this.colorFade < 0.15) return false;
    const c = clamp(Math.floor(x / COLOR_TILE_SIZE), 0, COLOR_TILE_COLS - 1);
    const r = clamp(Math.floor(y / COLOR_TILE_SIZE), 0, COLOR_TILE_ROWS - 1);
    return this.colorGrid[r]?.[c] === this.targetColorIndex;
  }

  findNearestSafeColorBlock(x: number, y: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestD2 = Infinity;
    for (const pt of this.safeTileCenters) {
      const dx = pt.x - x;
      const dy = pt.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = pt;
      }
    }
    return best;
  }

  drawMinimapTiles(
    ctx: CanvasRenderingContext2D,
    mx: number,
    my: number,
    mw: number,
    mh: number,
    highlightSafe: boolean
  ) {
    if (!this.minimapCanvas && typeof document !== 'undefined') {
      this.minimapCanvas = document.createElement('canvas');
      this.minimapCanvas.width = COLOR_TILE_COLS;
      this.minimapCanvas.height = COLOR_TILE_ROWS;
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }
    if (!this.minimapCanvas || !this.minimapCtx) return;

    const tFade = clamp(this.colorFade, 0, 1);
    if (
      Math.abs(tFade - this.lastMinimapFade) > 0.04 ||
      highlightSafe !== this.lastMinimapHighlight
    ) {
      this.lastMinimapFade = tFade;
      this.lastMinimapHighlight = highlightSafe;
      const mctx = this.minimapCtx;
      const baseStyle = fadeHex(this.baseColor, tFade);
      for (let r = 0; r < COLOR_TILE_ROWS; r++) {
        for (let c = 0; c < COLOR_TILE_COLS; c++) {
          const ci = this.colorGrid[r][c];
          if (ci < 0) {
            mctx.fillStyle = baseStyle;
            mctx.fillRect(c, r, 1, 1);
            continue;
          }
          const p = SAFE_COLOR_PALETTE[ci];
          if (highlightSafe && tFade > 0.25) {
            if (ci === this.targetColorIndex) {
              mctx.fillStyle = p.hex;
            } else {
              mctx.fillStyle = `rgb(${Math.round(p.rgb[0] * 0.45)}, ${Math.round(p.rgb[1] * 0.45)}, ${Math.round(p.rgb[2] * 0.45)})`;
            }
          } else {
            const rr = Math.round(p.gray[0] + (p.rgb[0] - p.gray[0]) * tFade);
            const gg = Math.round(p.gray[1] + (p.rgb[1] - p.gray[1]) * tFade);
            const bb = Math.round(p.gray[2] + (p.rgb[2] - p.gray[2]) * tFade);
            mctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`;
          }
          mctx.fillRect(c, r, 1, 1);
        }
      }
    }

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(this.minimapCanvas, mx, my, mw, mh);
    ctx.restore();
  }

  // =========================================================================
  // RENDERING: Natural Grass/Ground Base + Scattered Non-Adjacent Color Tiles
  // =========================================================================
  drawGround(
    ctx: CanvasRenderingContext2D,
    time: number,
    highlightSafeBlocks = false,
    viewRect?: { x: number; y: number; w: number; h: number },
    showTileLetters = false
  ) {
    const startCol = viewRect
      ? Math.max(0, Math.floor(viewRect.x / COLOR_TILE_SIZE) - 1)
      : 0;
    const endCol = viewRect
      ? Math.min(COLOR_TILE_COLS - 1, Math.ceil((viewRect.x + viewRect.w) / COLOR_TILE_SIZE) + 1)
      : COLOR_TILE_COLS - 1;
    const startRow = viewRect
      ? Math.max(0, Math.floor(viewRect.y / COLOR_TILE_SIZE) - 1)
      : 0;
    const endRow = viewRect
      ? Math.min(COLOR_TILE_ROWS - 1, Math.ceil((viewRect.y + viewRect.h) / COLOR_TILE_SIZE) + 1)
      : COLOR_TILE_ROWS - 1;

    const tFade = clamp(this.colorFade, 0, 1);

    // 1. Natural grass / biome ground base (fades smoothly from B&W to color)
    ctx.fillStyle = fadeHex(this.baseColor, tFade);
    if (viewRect) {
      ctx.fillRect(
        startCol * COLOR_TILE_SIZE,
        startRow * COLOR_TILE_SIZE,
        (endCol - startCol + 1) * COLOR_TILE_SIZE,
        (endRow - startRow + 1) * COLOR_TILE_SIZE
      );
    } else {
      ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    }

    // 2. Biome decor patches (grass clearings, dirt paths, avenues, plazas, piers, courts)
    for (const d of this.decor) {
      if (d.kind === 'grass_patch') {
        ctx.fillStyle = fadeHex(d.color || '#478b6f', tFade);
        ctx.beginPath();
        ctx.ellipse(d.x + d.w / 2, d.y + d.h / 2, d.w / 2, d.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (d.kind === 'road_h' || d.kind === 'road_v') {
        ctx.fillStyle = fadeHex(d.color || '#1e2430', tFade);
        ctx.fillRect(d.x, d.y, d.w, d.h);
        // Dashed lane line
        ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([18, 16]);
        ctx.beginPath();
        if (d.kind === 'road_h') {
          ctx.moveTo(d.x, d.y + d.h / 2);
          ctx.lineTo(d.x + d.w, d.y + d.h / 2);
        } else {
          ctx.moveTo(d.x + d.w / 2, d.y);
          ctx.lineTo(d.x + d.w / 2, d.y + d.h);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (d.kind === 'path' || d.kind === 'plaza') {
        ctx.fillStyle = fadeHex(d.color || '#8f7758', tFade);
        ctx.fillRect(d.x, d.y, d.w, d.h);
      } else if (d.kind === 'pier') {
        ctx.fillStyle = fadeHex(d.color || '#8b5e34', tFade);
        ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.strokeStyle = fadeHex('#5c3c20', tFade);
        ctx.lineWidth = 2;
        for (let py = d.y + 10; py < d.y + d.h; py += 16) {
          ctx.beginPath();
          ctx.moveTo(d.x, py);
          ctx.lineTo(d.x + d.w, py);
          ctx.stroke();
        }
      } else if (d.kind === 'court') {
        ctx.fillStyle = fadeHex(d.color || '#b45309', tFade);
        ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.strokeStyle = 'rgba(254, 243, 199, 0.6)';
        ctx.lineWidth = 3;
        ctx.strokeRect(d.x + 8, d.y + 8, d.w - 16, d.h - 16);
        ctx.beginPath();
        ctx.arc(d.x + d.w / 2, d.y + d.h / 2, 32, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 3. Subtle 40x40 map grid lines + grass texture tufts over open ground
    const minX = startCol * COLOR_TILE_SIZE;
    const maxX = (endCol + 1) * COLOR_TILE_SIZE;
    const minY = startRow * COLOR_TILE_SIZE;
    const maxY = (endRow + 1) * COLOR_TILE_SIZE;

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = startCol; c <= endCol + 1; c++) {
      const gx = c * COLOR_TILE_SIZE;
      ctx.moveTo(gx, minY);
      ctx.lineTo(gx, maxY);
    }
    for (let r = startRow; r <= endRow + 1; r++) {
      const gy = r * COLOR_TILE_SIZE;
      ctx.moveTo(minX, gy);
      ctx.lineTo(maxX, gy);
    }
    ctx.stroke();

    // Grass tufts on grass-rich biomes in empty grid cells
    if (this.id === 'park' || this.id === 'campus') {
      ctx.strokeStyle = fadeHex('#275c46', tFade);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let r = startRow; r <= endRow; r++) {
        const rowColors = this.colorGrid[r];
        for (let c = startCol; c <= endCol; c++) {
          if (rowColors[c] >= 0 || ((r * 7 + c * 13) % 3 !== 0)) continue;
          const bx = c * COLOR_TILE_SIZE + 14 + ((r * 11 + c * 5) % 12);
          const by = r * COLOR_TILE_SIZE + 22 + ((r * 3 + c * 7) % 10);
          ctx.moveTo(bx - 3, by);
          ctx.lineTo(bx - 5, by - 5);
          ctx.moveTo(bx, by);
          ctx.lineTo(bx, by - 6);
          ctx.moveTo(bx + 3, by);
          ctx.lineTo(bx + 5, by - 4);
        }
      }
      ctx.stroke();
    }

    // 4. Scattered mixed non-adjacent color tiles (~43% density so grass remains clearly visible!)
    const tileMain: string[] = new Array(SAFE_COLOR_PALETTE.length);
    for (let i = 0; i < SAFE_COLOR_PALETTE.length; i++) {
      const p = SAFE_COLOR_PALETTE[i];
      const br = p.gray[0] + (p.rgb[0] - p.gray[0]) * tFade;
      const bg = p.gray[1] + (p.rgb[1] - p.gray[1]) * tFade;
      const bb = p.gray[2] + (p.rgb[2] - p.gray[2]) * tFade;
      tileMain[i] = `rgb(${Math.round(br)},${Math.round(bg)},${Math.round(bb)})`;
    }

    const pulse = 0.6 + 0.4 * Math.sin(time * 7);
    const tilePad = 2.5;
    const innerSize = COLOR_TILE_SIZE - tilePad * 2;
    const topBevelStyle = 'rgba(255,255,255,0.22)';
    const botBevelStyle = 'rgba(0,0,0,0.22)';
    const tileBorderStyle = 'rgba(15,23,42,0.48)';
    const safeStrokeStyle = `rgba(255,255,255,${(pulse * tFade).toFixed(2)})`;
    const showSafeStroke = highlightSafeBlocks && tFade > 0.2;
    const drawLetters = showTileLetters && tFade > 0.25;

    if (drawLetters) {
      ctx.font = '900 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }

    for (let r = startRow; r <= endRow; r++) {
      const ty = r * COLOR_TILE_SIZE;
      const rowColors = this.colorGrid[r];
      for (let c = startCol; c <= endCol; c++) {
        const ci = rowColors[c];
        if (ci < 0) continue;
        const tx = c * COLOR_TILE_SIZE;

        ctx.fillStyle = tileMain[ci];
        ctx.fillRect(tx + tilePad, ty + tilePad, innerSize, innerSize);

        ctx.fillStyle = topBevelStyle;
        ctx.fillRect(tx + tilePad + 1, ty + tilePad + 1, innerSize - 2, 2.5);

        ctx.fillStyle = botBevelStyle;
        ctx.fillRect(tx + tilePad + 1, ty + tilePad + innerSize - 3.5, innerSize - 2, 2.5);

        ctx.strokeStyle = tileBorderStyle;
        ctx.lineWidth = 1.25;
        ctx.strokeRect(tx + tilePad, ty + tilePad, innerSize, innerSize);

        if (showSafeStroke && ci === this.targetColorIndex) {
          ctx.strokeStyle = safeStrokeStyle;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(tx + tilePad + 2, ty + tilePad + 2, innerSize - 4, innerSize - 4);
        }

        if (drawLetters) {
          const letter = SAFE_COLOR_PALETTE[ci].name[0];
          ctx.fillStyle = ci === 3 ? '#1c1917' : '#ffffff';
          ctx.fillText(letter, tx + COLOR_TILE_SIZE / 2, ty + COLOR_TILE_SIZE / 2 + 0.5);
        }
      }
    }

    // Water bodies (ponds / harbor)
    for (const obs of this.obstacles) {
      if (obs.kind !== 'water') continue;
      ctx.fillStyle = fadeHex(obs.color || '#3b8da8', tFade);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 24);
      else ctx.rect(obs.x, obs.y, obs.w, obs.h);
      ctx.fill();
      ctx.strokeStyle = fadeHex('#bae6fd', tFade);
      ctx.lineWidth = 3;
      ctx.stroke();

      // Gentle animated water shimmer lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2;
      for (let wy = obs.y + 34; wy < obs.y + obs.h - 24; wy += 44) {
        const shift = Math.sin(time * 2 + wy) * 8;
        ctx.beginPath();
        ctx.moveTo(obs.x + 28 + shift, wy);
        ctx.lineTo(obs.x + obs.w - 32 + shift, wy);
        ctx.stroke();
      }
    }

    // Environmental details over tiles/water (crosswalks, lilypads, boats, campfire)
    for (const det of this.details) {
      if (det.kind === 'lilypad') {
        ctx.fillStyle = fadeHex('#22c55e', tFade);
        ctx.beginPath();
        ctx.arc(det.x, det.y, det.size || 11, 0.2, Math.PI * 1.9);
        ctx.lineTo(det.x, det.y);
        ctx.closePath();
        ctx.fill();
      } else if (det.kind === 'crosswalk') {
        ctx.fillStyle = 'rgba(248, 250, 252, 0.45)';
        for (let i = 0; i < 6; i++) {
          ctx.fillRect(det.x + 14 + i * 24, det.y + 8, 12, 28);
          ctx.fillRect(det.x + 14 + i * 24, det.y + 132, 12, 28);
        }
      } else if (det.kind === 'boat') {
        const bob = Math.sin(time * 2.2 + det.x) * 3;
        ctx.save();
        ctx.translate(det.x, det.y + bob);
        ctx.fillStyle = fadeHex(det.color || '#f8fafc', tFade);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, (det.size || 70) / 2, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = fadeHex('#9a6e45', tFade);
        ctx.fillRect(-16, -6, 32, 12);
        ctx.restore();
      } else if (det.kind === 'campfire') {
        ctx.fillStyle = '#475569';
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(det.x + Math.cos(ang) * 12, det.y + Math.sin(ang) * 12, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        const flicker = 1 + Math.sin(time * 14) * 0.16;
        ctx.fillStyle = fadeHex('#f97316', tFade);
        ctx.beginPath();
        ctx.arc(det.x, det.y, 10 * flicker, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = fadeHex('#fde047', tFade);
        ctx.beginPath();
        ctx.arc(det.x, det.y - 2, 5.5 * flicker, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // World perimeter border
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, WORLD_WIDTH - 14, WORLD_HEIGHT - 14);
  }

  getDepthRenderables(time: number): { sortY: number; draw: (ctx: CanvasRenderingContext2D) => void }[] {
    const list: { sortY: number; draw: (ctx: CanvasRenderingContext2D) => void }[] = [];

    // Obstacles (except water which is on ground)
    for (const obs of this.obstacles) {
      if (obs.kind === 'water') continue;
      list.push({
        sortY: obs.y + obs.h,
        draw: (ctx) => this.drawObstacle(ctx, obs, time)
      });
    }

    // Trees
    for (const t of this.trees) {
      list.push({
        sortY: t.y + 8,
        draw: (ctx) => this.drawTree(ctx, t)
      });
    }

    // Hiding Spots
    for (const h of this.hidingSpots) {
      list.push({
        sortY: h.y + 10,
        draw: (ctx) => this.drawHidingSpot(ctx, h)
      });
    }

    // Lamps
    const tFade = clamp(this.colorFade, 0, 1);
    for (const det of this.details) {
      if (det.kind !== 'lamp') continue;
      list.push({
        sortY: det.y,
        draw: (ctx) => {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(det.x - 3, det.y - 42, 6, 42);
          ctx.fillStyle = fadeHex('#fde047', tFade);
          ctx.beginPath();
          ctx.arc(det.x, det.y - 44, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    return list;
  }

  private drawObstacle(ctx: CanvasRenderingContext2D, obs: RectObstacle, time: number) {
    const tFade = clamp(this.colorFade, 0, 1);
    ctx.save();
    if (obs.kind === 'building') {
      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.fillRect(obs.x + 8, obs.y + 12, obs.w, obs.h);

      // Front wall facade
      ctx.fillStyle = fadeHex(obs.color || '#475569', tFade);
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

      // Roof top surface
      const roofH = Math.max(40, obs.h - 52);
      ctx.fillStyle = fadeHex(obs.roofColor || '#1e293b', tFade);
      ctx.fillRect(obs.x + 6, obs.y + 6, obs.w - 12, roofH);

      // Storefront windows & awning along bottom edge
      const awY = obs.y + obs.h - 46;
      ctx.fillStyle = fadeHex(obs.accentColor || '#38bdf8', tFade);
      ctx.fillRect(obs.x + 14, awY, obs.w - 28, 14);
      ctx.fillStyle = fadeHex('#bae6fd', tFade);
      for (let wx = obs.x + 24; wx < obs.x + obs.w - 44; wx += 48) {
        ctx.fillRect(wx, obs.y + obs.h - 26, 28, 18);
      }

      // Building sign
      if (obs.label) {
        ctx.font = '800 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(obs.label, obs.x + obs.w / 2, obs.y + roofH / 2 + 6);
      }
    } else if (obs.kind === 'car') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(obs.x + 4, obs.y + 6, obs.w, obs.h);

      const bodyColor = fadeHex(obs.color || '#ef4444', tFade);
      ctx.fillStyle = bodyColor;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 10);
      else ctx.rect(obs.x, obs.y, obs.w, obs.h);
      ctx.fill();
      ctx.stroke();

      // Cabin & windshield
      ctx.fillStyle = fadeHex('#93c5fd', tFade);
      if (obs.direction === 'h') {
        ctx.fillRect(obs.x + 22, obs.y + 7, obs.w - 44, obs.h - 14);
        ctx.fillStyle = bodyColor;
        ctx.fillRect(obs.x + 36, obs.y + 9, obs.w - 72, obs.h - 18);
      } else {
        ctx.fillRect(obs.x + 7, obs.y + 22, obs.w - 14, obs.h - 44);
        ctx.fillStyle = bodyColor;
        ctx.fillRect(obs.x + 9, obs.y + 36, obs.w - 18, obs.h - 72);
      }
    } else if (obs.kind === 'stall') {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(obs.x + 4, obs.y + 6, obs.w, obs.h);
      // Striped market canopy
      const stripes = 6;
      const sw = obs.w / stripes;
      const cA = fadeHex(obs.color || '#dc2626', tFade);
      const cB = fadeHex(obs.accentColor || '#ffffff', tFade);
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? cA : cB;
        ctx.fillRect(obs.x + i * sw, obs.y, sw + 0.5, obs.h);
      }
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
    } else if (obs.kind === 'fountain') {
      const cx = obs.x + obs.w / 2;
      const cy = obs.y + obs.h / 2;
      ctx.fillStyle = '#cbd5e1';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, obs.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = fadeHex('#38bdf8', tFade);
      ctx.beginPath();
      ctx.arc(cx, cy, obs.w / 2 - 12, 0, Math.PI * 2);
      ctx.fill();

      const ripple = 14 + Math.sin(time * 5) * 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, ripple, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (obs.kind === 'wall') {
      ctx.fillStyle = fadeHex(obs.color || '#64748b', tFade);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      ctx.fillStyle = fadeHex(obs.roofColor || '#94a3b8', tFade);
      ctx.fillRect(obs.x + 5, obs.y + 5, obs.w - 10, obs.h - 12);
    } else if (obs.kind === 'bench') {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(obs.x + 3, obs.y + 4, obs.w, obs.h);
      ctx.fillStyle = fadeHex(obs.color || '#855836', tFade);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      ctx.fillStyle = fadeHex('#a16c43', tFade);
      ctx.fillRect(obs.x + 3, obs.y + 4, obs.w - 6, 8);
    } else if (obs.kind === 'table') {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(obs.x + 4, obs.y + 6, obs.w, obs.h);
      ctx.fillStyle = fadeHex(obs.color || '#855836', tFade);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 8);
      else ctx.rect(obs.x, obs.y, obs.w, obs.h);
      ctx.fill();
      ctx.stroke();
    } else if (obs.kind === 'log') {
      ctx.fillStyle = fadeHex(obs.color || '#6b472d', tFade);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(obs.x, obs.y, obs.w, obs.h, 12);
      else ctx.rect(obs.x, obs.y, obs.w, obs.h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = fadeHex('#b48a62', tFade);
      ctx.beginPath();
      ctx.arc(obs.x + 12, obs.y + obs.h / 2, obs.h * 0.36, 0, Math.PI * 2);
      ctx.fill();
    } else if (obs.kind === 'rock') {
      ctx.fillStyle = fadeHex(obs.color || '#6b7280', tFade);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.w / 2, obs.y + obs.h / 2, obs.w / 2, obs.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#9ca3af';
      ctx.beginPath();
      ctx.ellipse(obs.x + obs.w * 0.42, obs.y + obs.h * 0.38, obs.w * 0.22, obs.h * 0.16, -0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (obs.kind === 'crate') {
      ctx.fillStyle = fadeHex(obs.color || '#7c5338', tFade);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      ctx.beginPath();
      ctx.moveTo(obs.x, obs.y);
      ctx.lineTo(obs.x + obs.w, obs.y + obs.h);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTree(ctx: CanvasRenderingContext2D, t: TreeProp) {
    const tFade = clamp(this.colorFade, 0, 1);
    ctx.save();
    ctx.translate(t.x, t.y);

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(6, 10, t.canopyRadius * 0.85, t.canopyRadius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk
    ctx.fillStyle = t.kind === 'birch' ? '#e2e8f0' : fadeHex('#6b472d', tFade);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.fillRect(-8, -22, 16, 28);
    ctx.strokeRect(-8, -22, 16, 28);

    if (t.kind === 'pine') {
      // Tiered pine cones
      for (let tier = 0; tier < 3; tier++) {
        const yOff = -22 - tier * 18;
        const w = t.canopyRadius - tier * 8;
        ctx.fillStyle = fadeHex(tier === 2 ? '#228b6d' : t.tint, tFade);
        ctx.beginPath();
        ctx.moveTo(0, yOff - 32);
        ctx.lineTo(-w, yOff + 10);
        ctx.lineTo(w, yOff + 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (t.kind === 'palm') {
      ctx.fillStyle = fadeHex('#16a34a', tFade);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        ctx.save();
        ctx.translate(0, -28);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(18, 0, 22, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Broadleaf lush canopy clusters
      ctx.fillStyle = fadeHex(t.tint, tFade);
      ctx.beginPath();
      ctx.arc(-14, -36, t.canopyRadius * 0.58, 0, Math.PI * 2);
      ctx.arc(14, -36, t.canopyRadius * 0.58, 0, Math.PI * 2);
      ctx.arc(0, -50, t.canopyRadius * 0.64, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.arc(-6, -54, t.canopyRadius * 0.34, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawHidingSpot(ctx: CanvasRenderingContext2D, h: HidingSpot) {
    const tFade = clamp(this.colorFade, 0, 1);
    ctx.save();
    ctx.translate(h.x, h.y);

    if (h.kind === 'tent') {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 8, h.radius + 4, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = fadeHex(h.color, tFade);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, -28);
      ctx.lineTo(-h.radius, 12);
      ctx.lineTo(h.radius, 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (h.kind === 'alcove') {
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-28, -22, 56, 38, 6);
      else ctx.rect(-28, -22, 56, 38);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-20, -14, 40, 22);
    } else {
      // Bush / Hedge cluster
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 9, h.radius, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = fadeHex(h.color, tFade);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(-11, -2, 16, 0, Math.PI * 2);
      ctx.arc(11, -2, 16, 0, Math.PI * 2);
      ctx.arc(0, -11, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Subtle berry dots on bushes
      if (h.kind === 'bush') {
        ctx.fillStyle = fadeHex('#f43f5e', tFade);
        ctx.beginPath();
        ctx.arc(-8, -8, 2.5, 0, Math.PI * 2);
        ctx.arc(9, -3, 2.5, 0, Math.PI * 2);
        ctx.arc(2, -14, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
