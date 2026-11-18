import { SoundEngine } from './audio';
import {
  DASH_COOLDOWN,
  DASH_DURATION,
  DASH_SPEED_MULT,
  ENTITY_RADIUS,
  HIDE_COOLDOWN,
  HIDE_MAX_DURATION,
  STAMINA_DRAIN_PER_SEC,
  STAMINA_MAX,
  STAMINA_REGEN_PER_SEC,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from './constants';
import { drawHuman, getFacingFromVector } from './humanRenderer';
import { InputManager } from './input';
import { WorldMap } from './maps';
import {
  AnimState,
  FacingDir,
  HidingSpot,
  HumanAppearance,
  MouseMoveMode,
  RoundPhase
} from './types';

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export interface EntityEffectsHook {
  spawnDust: (x: number, y: number, color?: string) => void;
  addFloatingText: (text: string, x: number, y: number, color: string) => void;
}

export class HumanCharacter {
  id: string;
  appearance: HumanAppearance;
  isPlayer: boolean;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  radius = ENTITY_RADIUS;
  facing: FacingDir = 'down';
  anim: AnimState = 'idle';
  animTime = 0;

  alive = true;
  stamina = STAMINA_MAX;
  sprinting = false;
  dashTimer = 0;
  dashCooldown = 0;
  dashDirX = 0;
  dashDirY = 0;

  hiddenSpot: HidingSpot | null = null;
  hideTimer = 0;
  hideCooldown = 0;
  catchLunge = 0;
  isSafeOnColor = false;

  protected footstepTimer = 0;
  protected aiWanderAngle = Math.random() * Math.PI * 2;
  protected aiWanderTimer = 0;

  constructor(id: string, appearance: HumanAppearance, isPlayer: boolean, x: number, y: number) {
    this.id = id;
    this.appearance = appearance;
    this.isPlayer = isPlayer;
    this.x = x;
    this.y = y;
  }

  protected applyPhysics(
    dt: number,
    moveX: number,
    moveY: number,
    wantsSprint: boolean,
    baseSpeed: number,
    sprintMult: number,
    map: WorldMap,
    sound: SoundEngine | null,
    fx: EntityEffectsHook | null,
    manageStamina = true
  ) {
    this.animTime += dt;
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.hideCooldown > 0) this.hideCooldown = Math.max(0, this.hideCooldown - dt);
    if (this.catchLunge > 0) this.catchLunge = Math.max(0, this.catchLunge - dt * 4);

    if (this.hiddenSpot) {
      this.vx = 0;
      this.vy = 0;
      this.anim = 'hide';
      this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN_PER_SEC * 1.2 * dt);
      this.hideTimer += dt;
      return;
    }

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      const speed = baseSpeed * DASH_SPEED_MULT;
      this.vx = this.dashDirX * speed;
      this.vy = this.dashDirY * speed;
      this.anim = 'run';
      map.moveEntity(this, this.vx * dt, this.vy * dt);
      if (fx && Math.random() < 0.7) {
        fx.spawnDust(this.x, this.y + 10, 'rgba(226, 232, 240, 0.75)');
      }
      return;
    }

    const mag = Math.hypot(moveX, moveY);
    const isMoving = mag > 0.05;
    if (isMoving) {
      moveX /= mag;
      moveY /= mag;
      this.facing = getFacingFromVector(moveX, moveY, this.facing);
    }

    const wasSprinting = this.sprinting;
    if (manageStamina) {
      if (wantsSprint && isMoving && this.stamina > 2) {
        this.sprinting = true;
        this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN_PER_SEC * dt);
        if (!wasSprinting && this.isPlayer && sound) {
          sound.playRunVoice('sprint');
        }
      } else {
        this.sprinting = false;
        this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN_PER_SEC * dt);
      }
    } else {
      this.sprinting = wantsSprint && isMoving && this.stamina > 15;
      if (this.sprinting && !wasSprinting && this.isPlayer && sound) {
        sound.playRunVoice('sprint');
      }
    }

    const speed = baseSpeed * (this.sprinting ? sprintMult : 1);
    const targetVx = moveX * speed;
    const targetVy = moveY * speed;
    const accel = 1 - Math.exp(-16 * dt);
    this.vx = lerp(this.vx, targetVx, accel);
    this.vy = lerp(this.vy, targetVy, accel);

    const actualSpeed = Math.hypot(this.vx, this.vy);
    if (actualSpeed > 25) {
      this.anim = this.sprinting || actualSpeed > baseSpeed * 0.85 ? 'run' : 'walk';
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = this.sprinting ? 0.22 : 0.34;
        if (this.isPlayer && sound) {
          sound.playFootstep(this.sprinting);
        }
        if (fx && this.sprinting) {
          fx.spawnDust(this.x, this.y + 10, 'rgba(255, 255, 255, 0.35)');
        }
      }
    } else {
      this.anim = 'idle';
    }

    map.moveEntity(this, this.vx * dt, this.vy * dt);
  }

  triggerDash(dirX: number, dirY: number, sound: SoundEngine | null): boolean {
    if (this.dashCooldown > 0 || this.hiddenSpot) return false;
    let dx = dirX;
    let dy = dirY;
    const mag = Math.hypot(dx, dy);
    if (mag < 0.1) {
      dx = this.facing === 'right' ? 1 : this.facing === 'left' ? -1 : 0;
      dy = this.facing === 'down' ? 1 : this.facing === 'up' ? -1 : 0;
    } else {
      dx /= mag;
      dy /= mag;
    }
    this.dashDirX = dx;
    this.dashDirY = dy;
    this.dashTimer = DASH_DURATION;
    this.dashCooldown = DASH_COOLDOWN;
    if (this.isPlayer && sound) {
      sound.playDash();
      sound.playRunVoice('dash');
    }
    return true;
  }

  enterHide(spot: HidingSpot, sound: SoundEngine | null, fx: EntityEffectsHook | null) {
    if (this.hiddenSpot || this.hideCooldown > 0) return false;
    this.hiddenSpot = spot;
    spot.occupants++;
    this.hideTimer = 0;
    this.x = spot.x;
    this.y = spot.y;
    if (this.isPlayer && sound) sound.playHide(true);
    if (fx) fx.addFloatingText('HIDDEN', this.x, this.y - 30, '#34d399');
    return true;
  }

  exitHide(sound: SoundEngine | null) {
    if (!this.hiddenSpot) return;
    this.hiddenSpot.occupants = Math.max(0, this.hiddenSpot.occupants - 1);
    this.hiddenSpot = null;
    this.hideCooldown = HIDE_COOLDOWN;
    if (this.isPlayer && sound) sound.playHide(false);
  }

  draw(ctx: CanvasRenderingContext2D) {
    drawHuman(ctx, {
      x: this.x,
      y: this.y,
      facing: this.facing,
      anim: this.alive ? this.anim : 'caught',
      animTime: this.animTime,
      appearance: this.appearance,
      isPlayer: this.isPlayer,
      isHidden: this.hiddenSpot !== null,
      isSafeOnColor: this.isSafeOnColor && this.alive,
      isSprinting: this.sprinting,
      dashProgress: this.dashTimer > 0 ? this.dashTimer / DASH_DURATION : 0,
      catchLunge: this.catchLunge,
      label: this.alive ? (this.isPlayer ? 'YOU' : this.appearance.name) : undefined
    });
  }
}

export class Runner extends HumanCharacter {
  caughtTimer = 0;
  private safeZoneWaypoint: { x: number; y: number } | null = null;
  private repathTimer = 0;

  updatePlayer(
    dt: number,
    input: InputManager,
    mouseMode: MouseMoveMode,
    baseSpeed: number,
    sprintMult: number,
    map: WorldMap,
    phase: RoundPhase,
    sound: SoundEngine,
    fx: EntityEffectsHook
  ) {
    if (!this.alive) {
      this.caughtTimer += dt;
      this.isSafeOnColor = false;
      return;
    }

    this.isSafeOnColor = phase === 'COLOR_PHASE' && map.isOnSafeColorBlock(this.x, this.y);

    const move = input.getPlayerMoveVector(this.x, this.y, mouseMode);

    if (input.consumeJustPressed('KeyE') || input.consumeJustPressed('KeyF')) {
      if (this.hiddenSpot) {
        this.exitHide(sound);
      } else {
        const spot = map.getNearestHidingSpot(this.x, this.y, 56);
        if (spot) {
          this.enterHide(spot, sound, fx);
        }
      }
    }

    if (this.hiddenSpot) {
      const kb = input.getKeyboardMove();
      if (this.hideTimer >= HIDE_MAX_DURATION || kb.x !== 0 || kb.y !== 0) {
        this.exitHide(sound);
      }
    }

    if (input.consumeJustPressed('Space') || input.consumeJustPressed('MouseRight')) {
      if (this.hiddenSpot) this.exitHide(sound);
      this.triggerDash(move.x, move.y, sound);
    }

    const wantsSprint =
      input.isHeld('ShiftLeft') || input.isHeld('ShiftRight') || (move.usingMouse && this.stamina > 30);

    if (!this.hiddenSpot && move.x === 0 && move.y === 0 && input.mouseInsideCanvas) {
      const dx = input.mouseWorldX - this.x;
      const dy = input.mouseWorldY - this.y;
      if (Math.hypot(dx, dy) > 16) {
        this.facing = getFacingFromVector(dx, dy, this.facing);
      }
    }

    this.applyPhysics(dt, move.x, move.y, wantsSprint, baseSpeed, sprintMult, map, sound, fx);
  }

  updateAI(
    dt: number,
    chaser: Chaser,
    baseSpeed: number,
    sprintMult: number,
    map: WorldMap,
    phase: RoundPhase,
    fx: EntityEffectsHook
  ) {
    if (!this.alive) {
      this.caughtTimer += dt;
      this.isSafeOnColor = false;
      return;
    }

    this.isSafeOnColor = phase === 'COLOR_PHASE' && map.isOnSafeColorBlock(this.x, this.y);
    const dChaser = Math.hypot(this.x - chaser.x, this.y - chaser.y);

    // During Color Phase, AI Runners sprint directly to the nearest Target Safe Color block!
    if (phase === 'COLOR_PHASE') {
      if (this.hiddenSpot) this.exitHide(null);

      if (this.isSafeOnColor) {
        // Already safe inside the target color tile: stay centered & protected until next color reveals
        const block = map.getColorBlockAt(this.x, this.y);
        if (block) {
          const cx = block.x + block.w / 2;
          const cy = block.y + block.h / 2;
          const dx = cx - this.x;
          const dy = cy - this.y;
          const distCenter = Math.hypot(dx, dy);
          if (distCenter > 10) {
            this.applyPhysics(dt, dx, dy, false, baseSpeed * 0.55, sprintMult, map, null, fx);
          } else {
            this.applyPhysics(dt, 0, 0, false, baseSpeed, sprintMult, map, null, fx);
          }
          return;
        }
      }

      const safeGoal = map.findNearestSafeColorBlock(this.x, this.y);
      if (safeGoal) {
        this.repathTimer -= dt;
        if (this.repathTimer <= 0 || !this.safeZoneWaypoint) {
          this.repathTimer = 0.24 + Math.random() * 0.12;
          if (map.hasLineOfSight(this.x, this.y, safeGoal.x, safeGoal.y)) {
            this.safeZoneWaypoint = safeGoal;
          } else {
            this.safeZoneWaypoint = map.findNextWaypoint(this.x, this.y, safeGoal.x, safeGoal.y);
          }
        }
        const dx = this.safeZoneWaypoint.x - this.x;
        const dy = this.safeZoneWaypoint.y - this.y;
        const wantsSprint = this.stamina > 12;
        if (dChaser < 120 && this.dashCooldown <= 0) {
          this.triggerDash(dx, dy, null);
        }
        this.applyPhysics(dt, dx, dy, wantsSprint, baseSpeed, sprintMult, map, null, fx);
        return;
      }
    }

    // GREY PHASE (or fallback): Hide / Evade Hunter / Roam
    if (this.hiddenSpot) {
      if (this.hideTimer >= HIDE_MAX_DURATION - 0.8 || dChaser < 95) {
        this.exitHide(null);
      } else {
        this.applyPhysics(dt, 0, 0, false, baseSpeed, sprintMult, map, null, fx);
        return;
      }
    }

    if (dChaser > 170 && dChaser < 360 && this.hideCooldown <= 0 && this.stamina < 45) {
      const spot = map.getNearestHidingSpot(this.x, this.y, 48);
      if (spot && spot.occupants === 0) {
        this.enterHide(spot, null, fx);
        return;
      }
    }

    let moveX = 0;
    let moveY = 0;
    let wantsSprint = false;

    if (dChaser < 340 && dChaser > 0.1) {
      let awayX = (this.x - chaser.x) / dChaser;
      let awayY = (this.y - chaser.y) / dChaser;

      if (this.x < 140) awayX += 0.9;
      if (this.x > WORLD_WIDTH - 140) awayX -= 0.9;
      if (this.y < 140) awayY += 0.9;
      if (this.y > WORLD_HEIGHT - 140) awayY -= 0.9;

      const probeX = this.x + awayX * 48;
      const probeY = this.y + awayY * 48;
      const col = Math.floor(probeX / 50);
      const row = Math.floor(probeY / 50);
      if (row >= 0 && row < map.navBlocked.length && col >= 0 && col < map.navBlocked[0].length) {
        if (map.navBlocked[row][col]) {
          const ang = Math.atan2(awayY, awayX) + (this.id.charCodeAt(0) % 2 === 0 ? 1.1 : -1.1);
          awayX = Math.cos(ang);
          awayY = Math.sin(ang);
        }
      }

      moveX = awayX;
      moveY = awayY;
      wantsSprint = dChaser < 220 && this.stamina > 15;

      if (dChaser < 88 && this.dashCooldown <= 0) {
        this.triggerDash(awayX, awayY, null);
      }
    } else {
      this.aiWanderTimer -= dt;
      if (this.aiWanderTimer <= 0) {
        this.aiWanderTimer = 1.1 + Math.random() * 1.8;
        this.aiWanderAngle += (Math.random() - 0.5) * 2.2;
      }
      if (this.x < 120 || this.x > WORLD_WIDTH - 120 || this.y < 120 || this.y > WORLD_HEIGHT - 120) {
        this.aiWanderAngle = Math.atan2(WORLD_HEIGHT / 2 - this.y, WORLD_WIDTH / 2 - this.x);
      }
      moveX = Math.cos(this.aiWanderAngle);
      moveY = Math.sin(this.aiWanderAngle);
    }

    this.applyPhysics(dt, moveX, moveY, wantsSprint, baseSpeed, sprintMult, map, null, fx);
  }
}

export class Chaser extends HumanCharacter {
  targetMemory: { x: number; y: number } | null = null;
  patrolPoint: { x: number; y: number } | null = null;
  repathTimer = 0;
  cachedWaypoint: { x: number; y: number } | null = null;
  isCamping = false;

  private campAnchorX = 0;
  private campAnchorY = 0;
  private campAnchorInit = false;
  private campTimer = 0;
  private campWarnCooldown = 0;

  updatePlayer(
    dt: number,
    input: InputManager,
    mouseMode: MouseMoveMode,
    baseSpeed: number,
    sprintMult: number,
    map: WorldMap,
    phase: RoundPhase,
    runners: Runner[],
    sound: SoundEngine,
    fx: EntityEffectsHook
  ) {
    if (!this.campAnchorInit) {
      this.campAnchorX = this.x;
      this.campAnchorY = this.y;
      this.campAnchorInit = true;
    }
    if (this.campWarnCooldown > 0) {
      this.campWarnCooldown = Math.max(0, this.campWarnCooldown - dt);
    }

    const move = input.getPlayerMoveVector(this.x, this.y, mouseMode);
    const hasMoveInput = Math.hypot(move.x, move.y) > 0.05;

    // Check if Hunter is camping right behind/beside a runner protected on a Safe Color tile
    let nearSafeRunner = false;
    if (phase === 'COLOR_PHASE') {
      for (const r of runners) {
        if (!r.alive || !r.isSafeOnColor) continue;
        if (Math.hypot(r.x - this.x, r.y - this.y) < 115) {
          nearSafeRunner = true;
          break;
        }
      }
    }

    // Trailing 58px movement leash: pacing inside one spot or standing still triggers stamina drain;
    // moving properly across the map resets the timer and keeps stamina full!
    const dxAnchor = this.x - this.campAnchorX;
    const dyAnchor = this.y - this.campAnchorY;
    const distAnchor = Math.hypot(dxAnchor, dyAnchor);
    const leashRadius = 58;

    if (hasMoveInput && distAnchor > leashRadius && !nearSafeRunner) {
      this.campAnchorX = this.x - (dxAnchor / distAnchor) * leashRadius;
      this.campAnchorY = this.y - (dyAnchor / distAnchor) * leashRadius;
      this.campTimer = 0;
      this.isCamping = false;
    } else {
      this.campTimer += dt;
      if (this.campTimer >= 0.85 || nearSafeRunner) {
        this.isCamping = true;
      }
    }

    if (this.isCamping) {
      const drainRate = nearSafeRunner ? 32 : 24;
      this.stamina = Math.max(0, this.stamina - drainRate * dt);
      if (this.campWarnCooldown <= 0 && this.stamina < 88) {
        this.campWarnCooldown = 2.6;
        fx.addFloatingText(
          nearSafeRunner ? 'DONT CAMP! MOVE!' : 'KEEP MOVING!',
          this.x,
          this.y - 36,
          '#f97316'
        );
      }
    } else if (hasMoveInput) {
      this.stamina = Math.min(STAMINA_MAX, this.stamina + 70 * dt);
    }

    if (input.consumeJustPressed('Space') || input.consumeJustPressed('MouseRight')) {
      if (this.stamina >= 15) {
        this.triggerDash(move.x, move.y, sound);
      }
    }

    const wantsSprint =
      (input.isHeld('ShiftLeft') || input.isHeld('ShiftRight')) && !this.isCamping && this.stamina > 15;

    if (!hasMoveInput && input.mouseInsideCanvas) {
      const dx = input.mouseWorldX - this.x;
      const dy = input.mouseWorldY - this.y;
      if (Math.hypot(dx, dy) > 16) {
        this.facing = getFacingFromVector(dx, dy, this.facing);
      }
    }

    const effectiveSpeed = this.stamina < 15 ? baseSpeed * 0.78 : baseSpeed;
    this.applyPhysics(
      dt,
      move.x,
      move.y,
      wantsSprint,
      effectiveSpeed,
      sprintMult,
      map,
      sound,
      fx,
      false
    );
  }

  updateAI(
    dt: number,
    runners: Runner[],
    baseSpeed: number,
    sprintMult: number,
    sightRange: number,
    map: WorldMap,
    phase: RoundPhase,
    fx: EntityEffectsHook
  ) {
    this.isCamping = false;
    let bestTarget: Runner | null = null;
    let bestDist = Infinity;

    // Chaser CANNOT chase or catch runners until colors are revealed (COLOR_PHASE)!
    if (phase === 'COLOR_PHASE') {
      for (const r of runners) {
        if (!r.alive) continue;
        // CORE RULE: Chaser CANNOT chase anyone standing on the Target Safe Color block!
        if (map.isOnSafeColorBlock(r.x, r.y)) {
          continue;
        }

        const d = Math.hypot(r.x - this.x, r.y - this.y);
        if (r.hiddenSpot && d > 52) continue;

        const visible = d <= sightRange && map.hasLineOfSight(this.x, this.y, r.x, r.y);
        const effectiveDist = visible ? d : d * 1.45;
        if (effectiveDist < bestDist) {
          bestDist = effectiveDist;
          bestTarget = r;
        }
      }
    } else {
      this.targetMemory = null;
    }

    let goalX = this.x;
    let goalY = this.y;
    let wantsSprint = false;

    if (phase === 'COLOR_PHASE' && this.targetMemory && map.isOnSafeColorBlock(this.targetMemory.x, this.targetMemory.y)) {
      this.targetMemory = null;
    }

    if (bestTarget) {
      this.targetMemory = { x: bestTarget.x, y: bestTarget.y };
      goalX = bestTarget.x;
      goalY = bestTarget.y;
      const realDist = Math.hypot(goalX - this.x, goalY - this.y);
      wantsSprint = realDist < 300 && realDist > 60 && this.stamina > 25;
      if (realDist < 85 && realDist > 34 && this.dashCooldown <= 0) {
        this.triggerDash(goalX - this.x, goalY - this.y, null);
      }
    } else if (this.targetMemory) {
      goalX = this.targetMemory.x;
      goalY = this.targetMemory.y;
      if (Math.hypot(goalX - this.x, goalY - this.y) < 34) {
        this.targetMemory = null;
      }
    } else {
      if (!this.patrolPoint || Math.hypot(this.patrolPoint.x - this.x, this.patrolPoint.y - this.y) < 55) {
        const pts = map.spawnPoints;
        this.patrolPoint = pts[Math.floor(Math.random() * pts.length)];
      }
      goalX = this.patrolPoint.x;
      goalY = this.patrolPoint.y;
    }

    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || !this.cachedWaypoint) {
      this.repathTimer = 0.24 + Math.random() * 0.1;
      if (map.hasLineOfSight(this.x, this.y, goalX, goalY)) {
        this.cachedWaypoint = { x: goalX, y: goalY };
      } else {
        this.cachedWaypoint = map.findNextWaypoint(this.x, this.y, goalX, goalY);
      }
    }

    const dx = this.cachedWaypoint.x - this.x;
    const dy = this.cachedWaypoint.y - this.y;
    this.applyPhysics(dt, dx, dy, wantsSprint, baseSpeed, sprintMult, map, null, fx);
  }
}
