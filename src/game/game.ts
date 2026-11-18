import { SoundEngine } from './audio';
import {
  CHASER_APPEARANCE,
  COLOR_FADE_DURATION,
  COLOR_PHASE_DURATION,
  COUNTDOWN_DURATION,
  DIFFICULTY_CONFIG,
  GREY_PHASE_DURATION,
  ROUND_END_DURATION,
  RUNNER_APPEARANCES,
  SAFE_COLOR_PALETTE,
  SCORE_PER_SURVIVOR,
  STAMINA_MAX,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from './constants';
import { Chaser, EntityEffectsHook, Runner } from './entities';
import { InputManager } from './input';
import { WorldMap } from './maps';
import {
  ColorPaletteItem,
  Difficulty,
  FloatingText,
  GameSettings,
  GameState,
  MapId,
  Particle,
  PlayerRole,
  RoundPhase
} from './types';

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export interface HudSnapshot {
  state: GameState;
  round: number;
  phase: RoundPhase;
  phaseTimer: number;
  phaseDuration: number;
  safeColor: ColorPaletteItem | null;
  runnersAlive: number;
  runnersTotal: number;
  score: number;
  stamina: number;
  dashReady: boolean;
  isHidden: boolean;
  isSafeOnColor: boolean;
  nearHidingSpot: boolean;
  chaserDistance: number;
  chaserAlert: 'SAFE' | 'NEARBY' | 'DANGER' | 'HIDDEN' | 'IMMUNE' | 'HUNTING';
  chaserCamping: boolean;
  countdownStep: '1' | '2' | '3' | 'GO!' | null;
  revealBannerActive: boolean;
  role: PlayerRole;
  mapId: MapId;
  difficulty: Difficulty;
  victory: boolean;
  endReason: string;
  caughtCount: number;
  survivedSeconds: number;
}

export class ChaseGame implements EntityEffectsHook {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private input: InputManager;
  sound = new SoundEngine();

  state: GameState = 'MENU';
  phase: RoundPhase = 'GREY_PHASE';
  phaseTimer = GREY_PHASE_DURATION;
  round = 1;

  mapId: MapId = 'park';
  difficulty: Difficulty = 'normal';
  role: PlayerRole = 'runner';
  settings: GameSettings = {
    sfxEnabled: true,
    voiceEnabled: true,
    musicEnabled: true,
    mouseMode: 'hold',
    showMinimap: true,
    showTileLetters: false
  };

  map: WorldMap;
  chaser!: Chaser;
  runners: Runner[] = [];
  particles: Particle[] = [];
  floatingTexts: FloatingText[] = [];

  camX = 0;
  camY = 0;
  viewW = 1280;
  viewH = 720;

  elapsed = 0;
  score = 0;
  caughtCount = 0;
  victory = false;
  endReason = '';

  private totalTime = 0;
  private lastTs = 0;
  private rafId = 0;
  private shakeTimer = 0;
  private shakeIntensity = 0;
  private hitstopTimer = 0;
  private hudSyncTimer = 0;
  private lastTickSec = -1;
  private countdownStep: '1' | '2' | '3' | 'GO!' | null = null;
  private goBannerTimer = 0;
  private revealBannerTimer = 0;
  private wasPlayerSafeOnColor = false;
  private onHudUpdate: (snap: HudSnapshot) => void;

  constructor(canvas: HTMLCanvasElement, onHudUpdate: (snap: HudSnapshot) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.input = new InputManager(canvas);
    this.onHudUpdate = onHudUpdate;

    this.map = new WorldMap(this.mapId);
    this.setupPreviewEntities();
    this.resizeCanvas();
    window.addEventListener('resize', this.handleResize);

    this.lastTs = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private handleResize = () => {
    this.resizeCanvas();
  };

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const w = Math.max(640, Math.floor(rect.width));
    const h = Math.max(400, Math.floor(rect.height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.viewW = w;
    this.viewH = h;
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    this.sound.stopMusic();
    this.sound.stopVoices();
  }

  applySettings(next: GameSettings) {
    this.settings = { ...next };
    this.sound.setSettings(next.sfxEnabled, next.musicEnabled, next.voiceEnabled);
    if (this.state === 'PLAYING' && next.musicEnabled) {
      this.sound.startMusic();
    }
  }

  setPreviewMap(mapId: MapId) {
    this.mapId = mapId;
    this.map = new WorldMap(mapId);
    if (this.state === 'MENU') {
      this.setupPreviewEntities();
    }
  }

  setRole(role: PlayerRole) {
    this.role = role;
  }

  setDifficulty(diff: Difficulty) {
    this.difficulty = diff;
    if (this.state === 'MENU') {
      this.setupPreviewEntities();
    }
  }

  private setupPreviewEntities() {
    const cfg = DIFFICULTY_CONFIG[this.difficulty];
    this.map.colorFade = 1; // Menu background shows rich full-color world preview
    this.chaser = new Chaser('chaser', CHASER_APPEARANCE, false, this.map.chaserSpawn.x, this.map.chaserSpawn.y);
    this.runners = [];
    for (let i = 0; i < cfg.runnerCount; i++) {
      const sp = this.map.spawnPoints[i % this.map.spawnPoints.length];
      const app = RUNNER_APPEARANCES[i % RUNNER_APPEARANCES.length];
      this.runners.push(new Runner(`r-${i}`, app, false, sp.x + (i % 2) * 24, sp.y));
    }
    this.camX = clamp(this.map.chaserSpawn.x - this.viewW / 2, 0, Math.max(0, WORLD_WIDTH - this.viewW));
    this.camY = clamp(this.map.chaserSpawn.y - this.viewH / 2, 0, Math.max(0, WORLD_HEIGHT - this.viewH));
    this.emitHud();
  }

  startGame(mapId?: MapId, difficulty?: Difficulty, role?: PlayerRole, selectedRunnerIdx = 0) {
    if (mapId) this.mapId = mapId;
    if (difficulty) this.difficulty = difficulty;
    if (role) this.role = role;

    this.sound.unlock();
    this.sound.playButton();
    if (this.settings.musicEnabled) {
      this.sound.startMusic();
    }

    this.map = new WorldMap(this.mapId);
    const cfg = DIFFICULTY_CONFIG[this.difficulty];
    const clampedRunnerIdx = Math.max(0, Math.min(cfg.runnerCount - 1, selectedRunnerIdx));

    this.chaser = new Chaser(
      'chaser',
      CHASER_APPEARANCE,
      this.role === 'chaser',
      this.map.chaserSpawn.x,
      this.map.chaserSpawn.y
    );

    this.runners = [];
    for (let i = 0; i < cfg.runnerCount; i++) {
      const sp = this.map.spawnPoints[i % this.map.spawnPoints.length];
      const app = RUNNER_APPEARANCES[i % RUNNER_APPEARANCES.length];
      const isHumanPlayer = this.role === 'runner' && i === clampedRunnerIdx;
      const ox = i >= this.map.spawnPoints.length ? 34 : 0;
      this.runners.push(new Runner(`r-${i}`, app, isHumanPlayer, sp.x + ox, sp.y));
    }

    this.particles = [];
    this.floatingTexts = [];
    this.round = 1;
    this.elapsed = 0;
    this.score = 0;
    this.caughtCount = 0;
    this.victory = false;
    this.endReason = '';
    this.wasPlayerSafeOnColor = false;
    this.state = 'PLAYING';

    this.beginCountdown();

    const focus = this.getPlayerEntity();
    this.camX = clamp(focus.x - this.viewW / 2, 0, Math.max(0, WORLD_WIDTH - this.viewW));
    this.camY = clamp(focus.y - this.viewH / 2, 0, Math.max(0, WORLD_HEIGHT - this.viewH));
    this.emitHud();
  }

  private beginCountdown() {
    this.map.colorFade = 0;
    this.phase = 'COUNTDOWN';
    this.phaseTimer = COUNTDOWN_DURATION;
    this.countdownStep = '1';
    this.goBannerTimer = 0;
    this.revealBannerTimer = 0;
    this.sound.playTick();
    this.emitHud();
  }

  private beginGreyPhase(reshuffle: boolean, fromStartCountdown = false) {
    if (reshuffle) {
      const prevColor = this.map.targetColorIndex;
      this.map.reshuffleColorBlocks(prevColor, false);
    }
    this.map.colorFade = 0;
    this.phase = 'GREY_PHASE';
    this.phaseTimer = GREY_PHASE_DURATION;
    this.lastTickSec = Math.ceil(this.phaseTimer);
    this.revealBannerTimer = 0;
    this.countdownStep = null;

    if (fromStartCountdown) {
      this.goBannerTimer = 0.9;
      this.sound.playReveal();
      this.sound.playStartVoice(this.role);
    } else {
      this.goBannerTimer = 0;
      this.sound.playTick();
    }
    this.emitHud();
  }

  private beginColorPhase() {
    this.phase = 'COLOR_PHASE';
    this.phaseTimer = COLOR_PHASE_DURATION;
    this.lastTickSec = Math.ceil(this.phaseTimer);
    this.wasPlayerSafeOnColor = false;
    this.goBannerTimer = 0;
    this.revealBannerTimer = 3.2;
    this.sound.playReveal();

    const safeCol = SAFE_COLOR_PALETTE[this.map.targetColorIndex];
    this.sound.playRevealVoice(safeCol.name, this.round > 1);
    this.shakeTimer = 0.14;
    this.shakeIntensity = 3.5;
    this.emitHud();
  }

  private completeColorRound() {
    const mult = DIFFICULTY_CONFIG[this.difficulty].scoreMult;
    const roundPoints = Math.round(SCORE_PER_SURVIVOR * mult);

    for (const r of this.runners) {
      if (!r.alive) continue;
      if (this.map.isOnSafeColorBlock(r.x, r.y)) {
        this.spawnBurst(r.x, r.y, '#34d399', 8);
      }
      r.isSafeOnColor = false;
    }

    if (this.role === 'runner') {
      const player = this.runners.find((r) => r.isPlayer);
      if (player?.alive) {
        const bonus = this.map.isOnSafeColorBlock(player.x, player.y)
          ? roundPoints
          : Math.round(roundPoints * 0.5);
        this.score += bonus;
      }
    }

    this.round += 1;
    // Return map to Black & White for 10s Scatter (no catching until next color reveal!)
    this.beginGreyPhase(true, false);
  }

  togglePause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.sound.playButton();
      this.emitHud();
    } else if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.sound.playButton();
      this.emitHud();
    }
  }

  returnToMenu() {
    this.sound.playButton();
    this.sound.stopMusic();
    this.sound.stopVoices();
    this.state = 'MENU';
    this.setupPreviewEntities();
  }

  private getPlayerEntity(): Runner | Chaser {
    if (this.role === 'chaser') return this.chaser;
    return this.runners.find((r) => r.isPlayer) || this.runners[0];
  }

  spawnDust(x: number, y: number, color = 'rgba(255,255,255,0.45)') {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 4,
      vx: (Math.random() - 0.5) * 28,
      vy: -12 - Math.random() * 20,
      color,
      size: 2.5 + Math.random() * 2.5,
      life: 0.32,
      maxLife: 0.32
    });
  }

  private spawnBurst(x: number, y: number, color: string, count = 18) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color,
        size: 3 + Math.random() * 3.5,
        life: 0.5,
        maxLife: 0.5
      });
    }
  }

  addFloatingText(text: string, x: number, y: number, color: string) {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      size: 16,
      life: 1.25,
      maxLife: 1.25
    });
  }

  private catchRunner(runner: Runner, fromTimeout = false) {
    if (!runner.alive) return;
    runner.alive = false;
    runner.exitHide(null);
    this.caughtCount++;
    this.chaser.catchLunge = 1;
    this.sound.playCatch();
    this.spawnBurst(runner.x, runner.y, '#ef4444', 20);
    this.spawnBurst(runner.x, runner.y, runner.appearance.topColor, 12);
    this.addFloatingText(
      fromTimeout ? 'TIME OUT!' : 'CAUGHT!',
      runner.x,
      runner.y - 30,
      '#ef4444'
    );
    this.shakeTimer = 0.25;
    this.shakeIntensity = 7;
    this.hitstopTimer = 0.05;

    if (this.role === 'chaser') {
      const bonus = Math.round(250 * DIFFICULTY_CONFIG[this.difficulty].scoreMult);
      this.score += bonus;
      this.addFloatingText(`+${bonus}`, runner.x, runner.y - 52, '#facc15');
    }

    if (this.role === 'runner' && runner.isPlayer) {
      this.sound.playOutVoice(true, runner.appearance.name, this.role);
      this.finishGame(
        false,
        fromTimeout
          ? 'You were not standing on the Safe Color tile!'
          : 'Hunter Vance caught you!'
      );
    } else if (this.runners.every((r) => !r.alive)) {
      if (this.role === 'chaser') {
        this.sound.playAllOutVoice(true);
        this.finishGame(true, 'You caught every runner!');
      } else {
        this.sound.playAllOutVoice(false);
        this.finishGame(false, 'All runners were caught!');
      }
    } else {
      this.sound.playOutVoice(false, runner.appearance.name, this.role);
    }
  }

  private finishGame(victory: boolean, reason: string) {
    this.state = 'GAME_OVER';
    this.victory = victory;
    this.endReason = reason;
    this.sound.stopMusic();
    if (victory) {
      this.sound.playVictory();
    } else {
      this.sound.playDefeat();
    }
    this.emitHud();
  }

  private loop = (ts: number) => {
    const rawDt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    const dt = Math.min(Math.max(rawDt, 0), 0.1);

    this.update(dt);
    this.render();

    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.totalTime += dt;

    if (this.input.consumeJustPressed('KeyP') || this.input.consumeJustPressed('Escape')) {
      if (this.state === 'PLAYING' || this.state === 'PAUSED') {
        this.togglePause();
      }
    }

    if (this.state === 'MENU') {
      const cfg = DIFFICULTY_CONFIG[this.difficulty];
      for (const r of this.runners) {
        r.updateAI(dt, this.chaser, cfg.runnerSpeed * 0.65, 1.2, this.map, 'GREY_PHASE', this);
      }
      this.chaser.updateAI(
        dt,
        this.runners,
        cfg.chaserSpeed * 0.65,
        1.15,
        320,
        this.map,
        'GREY_PHASE',
        this
      );
      this.camX = clamp(
        this.camX + Math.sin(this.totalTime * 0.2) * 14 * dt,
        0,
        Math.max(0, WORLD_WIDTH - this.viewW)
      );
      this.input.endFrame();
      return;
    }

    if (this.state !== 'PLAYING') {
      this.input.endFrame();
      return;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const f = this.floatingTexts[i];
      f.life -= dt;
      f.y -= 28 * dt;
      if (f.life <= 0) this.floatingTexts.splice(i, 1);
    }
    if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.input.endFrame();
      return;
    }

    this.phaseTimer = Math.max(0, this.phaseTimer - dt);
    if (this.goBannerTimer > 0) this.goBannerTimer = Math.max(0, this.goBannerTimer - dt);
    if (this.revealBannerTimer > 0) this.revealBannerTimer = Math.max(0, this.revealBannerTimer - dt);

    // Phase state machine: COUNTDOWN (1, 2, 3, GO!) -> 10s B&W Scatter (No Catch) <-> 10s Color Reveal (Chaser Hunts!)
    if (this.phase === 'COUNTDOWN') {
      this.map.colorFade = 0;
      const elapsedCd = COUNTDOWN_DURATION - this.phaseTimer;
      const nextStep: '1' | '2' | '3' =
        elapsedCd < 0.8 ? '1' : elapsedCd < 1.6 ? '2' : '3';
      if (nextStep !== this.countdownStep) {
        this.countdownStep = nextStep;
        this.sound.playTick();
        this.emitHud();
      }
      if (this.phaseTimer <= 0) {
        this.beginGreyPhase(false, true);
      }
      this.input.endFrame();
      return;
    }

    this.elapsed += dt;

    if (this.phase === 'GREY_PHASE') {
      this.map.colorFade = 0;
      const sec = Math.ceil(this.phaseTimer);
      if (sec !== this.lastTickSec && sec > 0) {
        this.lastTickSec = sec;
        if (sec <= 3) {
          this.sound.playTick();
        }
      }
      if (this.phaseTimer <= 0) {
        this.beginColorPhase();
      }
    } else if (this.phase === 'COLOR_PHASE') {
      if (this.map.colorFade < 1) {
        this.map.colorFade = Math.min(1, this.map.colorFade + dt / COLOR_FADE_DURATION);
      }
      const sec = Math.ceil(this.phaseTimer);
      if (sec !== this.lastTickSec && sec > 0) {
        this.lastTickSec = sec;
        if (sec <= 3) this.sound.playTick();
      }
      if (this.phaseTimer <= 0) {
        this.completeColorRound();
      }
    }

    if ((this.state as GameState) !== 'PLAYING') {
      this.input.endFrame();
      return;
    }

    const cfg = DIFFICULTY_CONFIG[this.difficulty];
    const chaserRoundSpeed = cfg.chaserSpeed + (this.round - 1) * cfg.escalationPerRound;

    this.input.updateWorldCursor(this.camX, this.camY);

    // Update Chaser (Hunter)
    if (this.role === 'chaser') {
      this.chaser.updatePlayer(
        dt,
        this.input,
        this.settings.mouseMode,
        chaserRoundSpeed,
        cfg.chaserSprintMult,
        this.map,
        this.phase,
        this.runners,
        this.sound,
        this
      );
    } else {
      this.chaser.updateAI(
        dt,
        this.runners,
        chaserRoundSpeed,
        cfg.chaserSprintMult,
        cfg.chaserSightRange,
        this.map,
        this.phase,
        this
      );
    }

    // Update Runners
    for (const r of this.runners) {
      if (r.isPlayer) {
        r.updatePlayer(
          dt,
          this.input,
          this.settings.mouseMode,
          cfg.runnerSpeed,
          cfg.sprintMult,
          this.map,
          this.phase,
          this.sound,
          this
        );
      } else {
        r.updateAI(dt, this.chaser, cfg.runnerSpeed, cfg.sprintMult, this.map, this.phase, this);
      }
    }

    // Catch Detection: ONLY active during COLOR_PHASE! Before colors reveal, Chaser CANNOT catch runners.
    if (this.phase === 'COLOR_PHASE') {
      for (const r of this.runners) {
        if (!r.alive) continue;
        if (this.map.isOnSafeColorBlock(r.x, r.y)) {
          continue; // Immune on safe color tile!
        }
        const catchDist = r.hiddenSpot ? 20 : 28;
        if (Math.hypot(this.chaser.x - r.x, this.chaser.y - r.y) < catchDist) {
          this.catchRunner(r, false);
          if ((this.state as GameState) === 'GAME_OVER') break;
        }
      }
    }

    // Safe color voice cue when player steps onto Safe Color tile
    if ((this.state as GameState) === 'PLAYING' && this.role === 'runner') {
      const player = this.runners.find((r) => r.isPlayer);
      if (player?.alive) {
        const nowSafe = this.phase === 'COLOR_PHASE' && this.map.isOnSafeColorBlock(player.x, player.y);
        if (nowSafe && !this.wasPlayerSafeOnColor) {
          this.sound.playSafeVoice(SAFE_COLOR_PALETTE[this.map.targetColorIndex].name);
        }
        this.wasPlayerSafeOnColor = nowSafe;
        this.score += dt * 10 * cfg.scoreMult;
      }
    }

    // Smooth exponentially damped camera following active player
    const focus = this.getPlayerEntity();
    const targetCamX = clamp(focus.x - this.viewW / 2, 0, Math.max(0, WORLD_WIDTH - this.viewW));
    const targetCamY = clamp(focus.y - this.viewH / 2, 0, Math.max(0, WORLD_HEIGHT - this.viewH));
    const camBlend = 1 - Math.exp(-9 * dt);
    this.camX += (targetCamX - this.camX) * camBlend;
    this.camY += (targetCamY - this.camY) * camBlend;

    this.hudSyncTimer -= dt;
    if (this.hudSyncTimer <= 0) {
      this.hudSyncTimer = 0.08;
      this.emitHud();
    }

    this.input.endFrame();
  }

  private emitHud() {
    const player = this.getPlayerEntity();
    const dChaser = Math.hypot(player.x - this.chaser.x, player.y - this.chaser.y);
    const runnersAlive = this.runners.filter((r) => r.alive).length;
    const isSafe =
      this.role === 'runner' &&
      this.phase === 'COLOR_PHASE' &&
      this.map.isOnSafeColorBlock(player.x, player.y);

    const nearSpot =
      this.role === 'runner' &&
      !player.hiddenSpot &&
      this.map.getNearestHidingSpot(player.x, player.y, 56) !== null;

    let chaserAlert: HudSnapshot['chaserAlert'] = 'SAFE';
    if (this.role === 'chaser') {
      chaserAlert = 'HUNTING';
    } else if (isSafe) {
      chaserAlert = 'IMMUNE';
    } else if (player.hiddenSpot) {
      chaserAlert = 'HIDDEN';
    } else if (dChaser < 170) {
      chaserAlert = 'DANGER';
    } else if (dChaser < 350) {
      chaserAlert = 'NEARBY';
    }

    const phaseDuration =
      this.phase === 'COUNTDOWN'
        ? COUNTDOWN_DURATION
        : this.phase === 'GREY_PHASE'
        ? GREY_PHASE_DURATION
        : this.phase === 'COLOR_PHASE'
        ? COLOR_PHASE_DURATION
        : ROUND_END_DURATION;

    this.onHudUpdate({
      state: this.state,
      round: this.round,
      phase: this.phase,
      phaseTimer: this.phaseTimer,
      phaseDuration,
      safeColor:
        this.phase === 'COLOR_PHASE' || this.phase === 'ROUND_END'
          ? SAFE_COLOR_PALETTE[this.map.targetColorIndex]
          : null,
      runnersAlive,
      runnersTotal: this.runners.length,
      score: Math.floor(this.score),
      stamina: Math.round((player.stamina / STAMINA_MAX) * 100),
      dashReady: player.dashCooldown <= 0,
      isHidden: player.hiddenSpot !== null,
      isSafeOnColor: isSafe,
      nearHidingSpot: nearSpot,
      chaserDistance: Math.round(dChaser / 18),
      chaserAlert,
      chaserCamping: this.role === 'chaser' && this.chaser.isCamping,
      countdownStep:
        this.phase === 'COUNTDOWN'
          ? this.countdownStep
          : this.goBannerTimer > 0
          ? 'GO!'
          : null,
      revealBannerActive: this.phase === 'COLOR_PHASE' && this.revealBannerTimer > 0,
      role: this.role,
      mapId: this.mapId,
      difficulty: this.difficulty,
      victory: this.victory,
      endReason: this.endReason,
      caughtCount: this.caughtCount,
      survivedSeconds: Math.round(this.elapsed)
    });
  }

  private render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.viewW, this.viewH);

    let sx = 0;
    let sy = 0;
    if (this.shakeTimer > 0) {
      sx = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      sy = (Math.random() - 0.5) * 2 * this.shakeIntensity;
    }

    // 1. World Map + Obstacles + Trees + Color Tiles (Native B&W -> Color fade at 60fps, zero ctx.filter!)
    ctx.save();
    ctx.translate(-Math.round(this.camX) + sx, -Math.round(this.camY) + sy);

    const highlightSafe = this.state === 'PLAYING' && (this.phase === 'COLOR_PHASE' || this.phase === 'ROUND_END');
    this.map.drawGround(
      ctx,
      this.totalTime,
      highlightSafe,
      {
        x: this.camX - 24,
        y: this.camY - 24,
        w: this.viewW + 48,
        h: this.viewH + 48
      },
      this.settings.showTileLetters
    );

    // Collect environment depth props (trees, buildings, cars, hiding spots)
    const envProps = this.map.getDepthRenderables(this.totalTime);
    envProps.sort((a, b) => a.sortY - b.sortY);
    for (const item of envProps) {
      item.draw(ctx);
    }
    ctx.restore();

    // 2. Characters & Dynamic Overlays (Always full vivid readability over B&W or Color map!)
    ctx.save();
    ctx.translate(-Math.round(this.camX) + sx, -Math.round(this.camY) + sy);

    // Mouse target reticle
    if (this.state === 'PLAYING' && this.input.mouseInsideCanvas) {
      const activeMouse = this.settings.mouseMode === 'follow' || this.input.mouseLeftDown;
      if (activeMouse) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          this.input.mouseWorldX,
          this.input.mouseWorldY,
          10 + Math.sin(this.totalTime * 8) * 2,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.beginPath();
        ctx.arc(this.input.mouseWorldX, this.input.mouseWorldY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Y-sort human characters
    const chars: { sortY: number; draw: (c: CanvasRenderingContext2D) => void }[] = [];
    for (const r of this.runners) {
      chars.push({ sortY: r.y, draw: (c) => r.draw(c) });
    }
    chars.push({ sortY: this.chaser.y, draw: (c) => this.chaser.draw(c) });
    chars.sort((a, b) => a.sortY - b.sortY);
    for (const c of chars) {
      c.draw(ctx);
    }

    // Nearest Safe Color Block directional guide arrow for Runner during COLOR_PHASE
    if (this.state === 'PLAYING' && this.role === 'runner' && this.phase === 'COLOR_PHASE') {
      const player = this.getPlayerEntity();
      if (!this.map.isOnSafeColorBlock(player.x, player.y)) {
        const nearestSafe = this.map.findNearestSafeColorBlock(player.x, player.y);
        if (nearestSafe) {
          const ang = Math.atan2(nearestSafe.y - player.y, nearestSafe.x - player.x);
          const safeCol = SAFE_COLOR_PALETTE[this.map.targetColorIndex];
          ctx.save();
          ctx.translate(player.x + Math.cos(ang) * 34, player.y + Math.sin(ang) * 34);
          ctx.rotate(ang);
          ctx.fillStyle = safeCol.hex;
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(-6, -6);
          ctx.lineTo(-3, 0);
          ctx.lineTo(-6, 6);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Hiding Spot Prompt
    if (this.state === 'PLAYING' && this.role === 'runner') {
      const player = this.getPlayerEntity();
      if (!player.hiddenSpot && player.hideCooldown <= 0) {
        const spot = this.map.getNearestHidingSpot(player.x, player.y, 56);
        if (spot) {
          ctx.save();
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.85)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(spot.x - 36, spot.y - 48, 72, 22, 6);
          else ctx.rect(spot.x - 36, spot.y - 48, 72, 22);
          ctx.fill();
          ctx.stroke();
          ctx.font = '700 11px system-ui, sans-serif';
          ctx.fillStyle = '#34d399';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('E Hide', spot.x, spot.y - 37);
          ctx.restore();
        }
      }
    }

    // Particles & Floating Texts
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = clamp(ft.life / (ft.maxLife * 0.45), 0, 1);
      ctx.font = `800 ${ft.size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(11, 14, 20, 0.92)';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    ctx.restore();

    // 3. Vignette & Minimap
    if (this.state === 'PLAYING') {
      const player = this.getPlayerEntity();
      const isSafe = this.phase === 'COLOR_PHASE' && this.map.isOnSafeColorBlock(player.x, player.y);
      if (this.role === 'runner' && !player.hiddenSpot && !isSafe) {
        const dChaser = Math.hypot(player.x - this.chaser.x, player.y - this.chaser.y);
        if (dChaser < 200) {
          const intensity = (1 - dChaser / 200) * 0.34;
          const grad = ctx.createRadialGradient(
            this.viewW / 2,
            this.viewH / 2,
            this.viewH * 0.25,
            this.viewW / 2,
            this.viewH / 2,
            this.viewW * 0.72
          );
          grad.addColorStop(0, 'rgba(239, 68, 68, 0)');
          grad.addColorStop(1, `rgba(220, 38, 38, ${intensity})`);
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, this.viewW, this.viewH);
        }
      }

      if (this.settings.showMinimap) {
        this.drawMinimap(ctx);
      }
    }

    ctx.restore();
  }

  private drawMinimap(ctx: CanvasRenderingContext2D) {
    const mw = 176;
    const mh = 128;
    const mx = this.viewW - mw - 16;
    const my = this.viewH - mh - 16;
    const sx = mw / WORLD_WIDTH;
    const sy = mh / WORLD_HEIGHT;

    ctx.save();
    ctx.fillStyle = 'rgba(11, 14, 20, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(mx, my, mw, mh, 8);
    else ctx.rect(mx, my, mw, mh);
    ctx.fill();
    ctx.stroke();

    // Full-map Tile Mosaic on Minimap (grayscale in Grey Phase, highlight Safe Color in Color Phase!)
    this.map.drawMinimapTiles(ctx, mx, my, mw, mh, this.phase === 'COLOR_PHASE');

    // Obstacles
    ctx.fillStyle = 'rgba(100, 116, 139, 0.48)';
    for (const obs of this.map.obstacles) {
      ctx.fillRect(mx + obs.x * sx, my + obs.y * sy, Math.max(2, obs.w * sx), Math.max(2, obs.h * sy));
    }

    // Runners
    for (const r of this.runners) {
      if (!r.alive || (r.hiddenSpot && this.role === 'chaser')) continue;
      ctx.fillStyle = r.isPlayer ? '#38bdf8' : '#e2e8f0';
      ctx.beginPath();
      ctx.arc(mx + r.x * sx, my + r.y * sy, r.isPlayer ? 3.5 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hunter
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(mx + this.chaser.x * sx, my + this.chaser.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Camera viewport box
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + this.camX * sx, my + this.camY * sy, this.viewW * sx, this.viewH * sy);

    ctx.restore();
  }
}
