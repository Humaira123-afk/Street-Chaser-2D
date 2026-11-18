import { AnimState, FacingDir, HumanAppearance } from './types';

export interface DrawHumanOptions {
  x: number;
  y: number;
  facing: FacingDir;
  anim: AnimState;
  animTime: number;
  appearance: HumanAppearance;
  isPlayer: boolean;
  isHidden: boolean;
  isSafeOnColor: boolean;
  isSprinting: boolean;
  dashProgress: number;
  catchLunge: number;
  label?: string;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}

export function getFacingFromVector(vx: number, vy: number, current: FacingDir): FacingDir {
  if (Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05) return current;
  if (Math.abs(vx) >= Math.abs(vy) * 0.9) {
    return vx >= 0 ? 'right' : 'left';
  }
  return vy >= 0 ? 'down' : 'up';
}

export function drawHuman(ctx: CanvasRenderingContext2D, opts: DrawHumanOptions) {
  const {
    x,
    y,
    facing,
    anim,
    animTime,
    appearance,
    isPlayer,
    isHidden,
    isSafeOnColor,
    isSprinting,
    dashProgress,
    catchLunge,
    label
  } = opts;

  ctx.save();
  ctx.translate(x, y);

  // Protective Safe Color Shield Ring when standing on Target Color Block
  if (isSafeOnColor && anim !== 'caught') {
    const pulse = 18 + Math.sin(animTime * 8) * 2;
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(0, 10, pulse, pulse * 0.52, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, -10, 24, 0, Math.PI * 2);
    ctx.stroke();
  } else if (!isHidden && anim !== 'caught') {
    if (appearance.isChaser) {
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.ellipse(0, 12, 20, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isPlayer) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, 12, 16, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Contact shadow
  ctx.fillStyle = isHidden ? 'rgba(0, 0, 0, 0.22)' : 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(0, 12, isHidden ? 12 : appearance.isChaser ? 15 : 13, 6.2, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isHidden) {
    ctx.globalAlpha = 0.45;
  }

  const speedFreq = anim === 'run' ? (isSprinting ? 17 : 13) : anim === 'walk' ? 8.5 : 2.6;
  const phase = animTime * speedFreq;
  const isMoving = anim === 'walk' || anim === 'run';

  const stride = isMoving ? Math.sin(phase) : 0;
  const bob = isMoving
    ? Math.abs(Math.sin(phase)) * (anim === 'run' ? 3.4 : 1.8)
    : anim === 'idle'
    ? Math.sin(phase) * 0.8
    : 0;

  const crouchOffset = anim === 'hide' ? 6 : 0;
  const forwardLean =
    anim === 'run' ? (isSprinting ? 0.14 : 0.08) : anim === 'hide' ? 0.12 : 0;

  if (anim === 'caught') {
    ctx.rotate(Math.PI * 0.44);
    ctx.translate(4, 2);
  }

  if (dashProgress > 0) {
    ctx.scale(1.12, 0.9);
  }

  // Make the Hunter slightly taller/broader for intimidating silhouette
  if (appearance.isChaser) {
    ctx.scale(1.08, 1.08);
  }

  const outline = '#0f172a';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const isSide = facing === 'left' || facing === 'right';
  const flipX = facing === 'left' ? -1 : 1;

  ctx.save();
  if (isSide) {
    ctx.scale(flipX, 1);
    ctx.rotate(forwardLean + catchLunge * 0.22);
  } else {
    ctx.translate(0, catchLunge * 3);
  }

  ctx.translate(0, -bob + crouchOffset);

  if (isSide) {
    drawHumanSide(ctx, appearance, stride, isMoving, anim, outline);
  } else {
    drawHumanFrontBack(ctx, appearance, facing === 'up', stride, isMoving, anim, outline);
  }

  ctx.restore();
  ctx.restore();

  // Name / Status tag above head
  if (label && !isHidden) {
    ctx.save();
    ctx.font = appearance.isChaser ? '800 11px system-ui, sans-serif' : '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const tagY = y - (appearance.isChaser ? 40 : 34);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(11, 14, 20, 0.94)';
    const displayLabel = isSafeOnColor ? `${label} SAFE` : label;
    ctx.strokeText(displayLabel, x, tagY);
    ctx.fillStyle = isSafeOnColor
      ? '#34d399'
      : appearance.isChaser
      ? '#fca5a5'
      : isPlayer
      ? '#7dd3fc'
      : '#e2e8f0';
    ctx.fillText(displayLabel, x, tagY);
    ctx.restore();
  }
}

function drawHumanSide(
  ctx: CanvasRenderingContext2D,
  app: HumanAppearance,
  stride: number,
  isMoving: boolean,
  anim: AnimState,
  outline: string
) {
  const legSwing = isMoving ? stride * 7.5 : 0;
  const armSwing = isMoving ? -stride * 7 : 0;
  const legLiftA = isMoving ? Math.max(0, -stride) * 2.5 : 0;
  const legLiftB = isMoving ? Math.max(0, stride) * 2.5 : 0;
  const crouchH = anim === 'hide' ? 4 : 0;
  const isHunter = app.topStyle === 'hunter_coat';

  // Hunter trailing cloak in side view
  if (isHunter) {
    ctx.fillStyle = '#7f1d1d';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-4, -14);
    ctx.lineTo(-14 - (isMoving ? 3 : 0), 4);
    ctx.lineTo(-3, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Back arm
  ctx.save();
  ctx.translate(1, -12 + crouchH * 0.4);
  ctx.rotate(armSwing * -0.06);
  ctx.fillStyle = isHunter ? '#44403c' : app.topAccent;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.6;
  drawRoundedRect(ctx, -3, 0, 5.5, 11, 2.5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = isHunter ? '#1c1917' : app.skin; // Leather glove for Hunter
  ctx.beginPath();
  ctx.arc(-0.2, 11.5, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Back leg
  ctx.save();
  ctx.translate(-1 + legSwing * -0.6, -2 - legLiftB + crouchH * 0.5);
  ctx.fillStyle = app.pantsColor;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.6;
  drawRoundedRect(ctx, -3, 0, 6, 11 - crouchH * 0.4, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = app.shoeColor;
  drawRoundedRect(ctx, -3, 8.5 - crouchH * 0.4, 8.5, 4.8, 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (app.accessory === 'backpack') {
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6;
    drawRoundedRect(ctx, -10.5, -14 + crouchH * 0.4, 6.5, 12, 2.5);
    ctx.fill();
    ctx.stroke();
  }

  // Front leg
  ctx.save();
  ctx.translate(1 + legSwing * 0.6, -2 - legLiftA + crouchH * 0.5);
  ctx.fillStyle = app.pantsColor;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.6;
  drawRoundedRect(ctx, -3, 0, 6.2, 11 - crouchH * 0.4, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = app.shoeColor;
  drawRoundedRect(ctx, -2.5, 8.5 - crouchH * 0.4, 8.8, 4.8, 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Torso
  const torsoH = app.topStyle === 'trench' || isHunter ? 18 : 15;
  ctx.fillStyle = app.topColor;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, -6.5, -15 + crouchH * 0.4, 13, torsoH - crouchH * 0.3, 4);
  ctx.fill();
  ctx.stroke();

  if (isHunter) {
    // Crimson scarf collar + leather belt & shoulder pauldron
    ctx.fillStyle = '#dc2626';
    drawRoundedRect(ctx, -6, -15.5, 12, 4, 1.5);
    ctx.fill();
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-6, -3, 12, 3);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(2, -3, 2.5, 3);
  } else {
    ctx.fillStyle = app.topAccent;
    ctx.fillRect(1.5, -13 + crouchH * 0.4, 3, torsoH - 5 - crouchH * 0.3);
  }

  if (app.accessory === 'scarf') {
    ctx.fillStyle = '#f43f5e';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.4;
    drawRoundedRect(ctx, -6, -16 + crouchH * 0.4, 12, 4.5, 2);
    ctx.fill();
    ctx.stroke();
    drawRoundedRect(ctx, -11, -14 + crouchH * 0.4, 6, 3.5, 1.5);
    ctx.fill();
    ctx.stroke();
  }

  // Head
  ctx.save();
  ctx.translate(0.5, -22.5 + crouchH * 0.45);
  drawHeadSide(ctx, app, outline);
  ctx.restore();

  // Front arm
  ctx.save();
  ctx.translate(0, -12 + crouchH * 0.4);
  ctx.rotate(armSwing * 0.07);
  if (isHunter) {
    // Hunter shoulder pauldron
    ctx.fillStyle = '#7f1d1d';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, -4.5, -2, 8.5, 5, 2.2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = app.topColor;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.6;
  drawRoundedRect(ctx, -3, 0, 5.8, 11.5, 2.5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = isHunter ? '#1c1917' : app.skin;
  ctx.beginPath();
  ctx.arc(0, 12, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHumanFrontBack(
  ctx: CanvasRenderingContext2D,
  app: HumanAppearance,
  isBack: boolean,
  stride: number,
  isMoving: boolean,
  anim: AnimState,
  outline: string
) {
  const leftLegY = isMoving ? stride * 2.8 : 0;
  const rightLegY = isMoving ? -stride * 2.8 : 0;
  const leftArmY = isMoving ? -stride * 3.2 : 0;
  const rightArmY = isMoving ? stride * 3.2 : 0;
  const crouchH = anim === 'hide' ? 4 : 0;
  const isHunter = app.topStyle === 'hunter_coat';

  // Hunter back cloak behind legs/arms
  if (isHunter && isBack) {
    ctx.fillStyle = '#7f1d1d';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-9, -15);
    ctx.lineTo(9, -15);
    ctx.lineTo(12, 6);
    ctx.lineTo(-12, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.6;

  // Left Leg
  ctx.fillStyle = app.pantsColor;
  drawRoundedRect(ctx, -6.5, -2 + leftLegY + crouchH * 0.4, 5.5, 11 - crouchH * 0.3, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = app.shoeColor;
  drawRoundedRect(ctx, -7, 8 + leftLegY + crouchH * 0.2, 6.2, 4.4, 2);
  ctx.fill();
  ctx.stroke();

  // Right Leg
  ctx.fillStyle = app.pantsColor;
  drawRoundedRect(ctx, 1, -2 + rightLegY + crouchH * 0.4, 5.5, 11 - crouchH * 0.3, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = app.shoeColor;
  drawRoundedRect(ctx, 0.8, 8 + rightLegY + crouchH * 0.2, 6.2, 4.4, 2);
  ctx.fill();
  ctx.stroke();

  // Arms
  const drawArm = (ax: number, ayOffset: number) => {
    ctx.fillStyle = app.topColor;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6;
    drawRoundedRect(ctx, ax, -14 + ayOffset + crouchH * 0.4, 4.8, 11, 2.2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isHunter ? '#1c1917' : app.skin;
    ctx.beginPath();
    ctx.arc(ax + 2.4, -2 + ayOffset + crouchH * 0.4, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  drawArm(-11.4, leftArmY);
  drawArm(6.6, rightArmY);

  // Torso
  const torsoH = app.topStyle === 'trench' || isHunter ? 18 : 15;
  ctx.fillStyle = app.topColor;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.8;
  drawRoundedRect(ctx, -7.8, -15 + crouchH * 0.4, 15.6, torsoH - crouchH * 0.3, 4);
  ctx.fill();
  ctx.stroke();

  if (isHunter) {
    // Broad crimson hunter pauldrons
    ctx.fillStyle = '#7f1d1d';
    drawRoundedRect(ctx, -11.5, -16, 6.5, 5.5, 2.2);
    ctx.fill();
    ctx.stroke();
    drawRoundedRect(ctx, 5, -16, 6.5, 5.5, 2.2);
    ctx.fill();
    ctx.stroke();

    if (!isBack) {
      // Crimson hunter collar + diagonal leather bandolier + belt buckle
      ctx.fillStyle = '#dc2626';
      drawRoundedRect(ctx, -6, -15.5, 12, 3.8, 1.5);
      ctx.fill();

      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-6.5, -13);
      ctx.lineTo(6.5, -1);
      ctx.stroke();

      ctx.fillStyle = '#78350f';
      ctx.fillRect(-7.5, -2.5, 15, 3);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(-2, -2.5, 4, 3);
    }
  } else if (!isBack) {
    ctx.fillStyle = app.topAccent;
    if (app.topStyle === 'hoodie' || app.topStyle === 'trench') {
      ctx.fillRect(-1.2, -14 + crouchH * 0.4, 2.4, torsoH - 4);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      drawRoundedRect(ctx, -4.5, -6 + crouchH * 0.3, 9, 4.5, 1.5);
      ctx.fill();
    } else if (app.topStyle === 'jacket') {
      ctx.fillRect(-2.5, -14 + crouchH * 0.4, 5, torsoH - 5);
    } else {
      ctx.fillRect(-4, -14 + crouchH * 0.4, 8, 3);
    }
  } else if (app.accessory === 'backpack') {
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6;
    drawRoundedRect(ctx, -6, -13 + crouchH * 0.4, 12, 11, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#475569';
    drawRoundedRect(ctx, -4.5, -7 + crouchH * 0.4, 9, 4, 1.5);
    ctx.fill();
  }

  if (app.accessory === 'scarf') {
    ctx.fillStyle = '#f43f5e';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.4;
    drawRoundedRect(ctx, -7, -16 + crouchH * 0.4, 14, 4.2, 2);
    ctx.fill();
    ctx.stroke();
  }

  // Head
  ctx.save();
  ctx.translate(0, -22.5 + crouchH * 0.45);
  drawHeadFrontBack(ctx, app, isBack, outline);
  ctx.restore();
}

function drawHeadFrontBack(
  ctx: CanvasRenderingContext2D,
  app: HumanAppearance,
  isBack: boolean,
  outline: string
) {
  ctx.fillStyle = app.skin;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, 8.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (app.hairStyle === 'hunter_hat') {
    // Hunter mask over lower face when facing front
    if (!isBack) {
      ctx.fillStyle = '#292524';
      drawRoundedRect(ctx, -7.2, 1.8, 14.4, 6.2, 3);
      ctx.fill();
    }

    // Wide-brimmed leather Hunter Hat
    ctx.fillStyle = '#1c1917';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.8;
    // Crown
    drawRoundedRect(ctx, -8.5, -11.5, 17, 9, 4);
    ctx.fill();
    ctx.stroke();
    // Crimson hat band
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-8.2, -5.5, 16.4, 2.5);
    // Wide brim
    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.ellipse(0, -3.5, 14.5, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glowing amber-red Hunter Goggles
    if (!isBack) {
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(-3.1, 0.2, 2.3, 0, Math.PI * 2);
      ctx.arc(3.1, 0.2, 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(-3.1, 0.2, 0.9, 0, Math.PI * 2);
      ctx.arc(3.1, 0.2, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (app.hairStyle === 'hood') {
    ctx.fillStyle = app.topColor;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, -0.5, 9.6, isBack ? 0 : Math.PI * 0.85, isBack ? Math.PI * 2 : Math.PI * 2.15);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = app.hairColor;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6;
    if (isBack) {
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, -1.5, 8.4, Math.PI * 0.92, Math.PI * 2.08);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    if (app.hairStyle === 'spiky') {
      ctx.beginPath();
      ctx.moveTo(-6, -6);
      ctx.lineTo(-3, -12);
      ctx.lineTo(0, -7);
      ctx.lineTo(4, -12.5);
      ctx.lineTo(6.5, -6);
      ctx.fill();
      ctx.stroke();
    } else if (app.hairStyle === 'ponytail') {
      if (isBack) {
        drawRoundedRect(ctx, -3, 2, 6, 10, 3);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(5, -6, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (app.hairStyle === 'bob') {
      drawRoundedRect(ctx, -8.8, -4, 3.2, 10, 1.5);
      ctx.fill();
      ctx.stroke();
      drawRoundedRect(ctx, 5.6, -4, 3.2, 10, 1.5);
      ctx.fill();
      ctx.stroke();
    } else if (app.hairStyle === 'cap') {
      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.arc(0, -2, 8.7, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!isBack) {
        drawRoundedRect(ctx, -6, -3.5, 12, 3.2, 1.5);
        ctx.fill();
        ctx.stroke();
      }
    } else if (app.hairStyle === 'beanie') {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(0, -2.5, 8.7, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawRoundedRect(ctx, -8.8, -4.5, 17.6, 3.2, 1.4);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (app.accessory === 'headphones') {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, -0.5, 9.5, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-10.2, -2.5, 3, 5.5);
    ctx.fillRect(7.2, -2.5, 3, 5.5);
  }

  if (!isBack) {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-2.8, 1.2, 1.35, 0, Math.PI * 2);
    ctx.arc(2.8, 1.2, 1.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeadSide(ctx: CanvasRenderingContext2D, app: HumanAppearance, outline: string) {
  ctx.fillStyle = app.skin;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (app.hairStyle === 'hunter_hat') {
    // Lower face mask
    ctx.fillStyle = '#292524';
    drawRoundedRect(ctx, -4, 1.8, 11.5, 6, 3);
    ctx.fill();

    // Hunter hat crown & wide brim
    ctx.fillStyle = '#1c1917';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.7;
    drawRoundedRect(ctx, -8, -11.5, 15.5, 9, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-7.5, -5.5, 14.5, 2.4);
    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.ellipse(0.5, -3.5, 13.5, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Glowing Hunter Goggle on side
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(4.2, 0.2, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(4.4, 0.2, 0.85, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (app.hairStyle === 'hood') {
    ctx.fillStyle = app.topColor;
    ctx.beginPath();
    ctx.arc(-1, -0.5, 9.2, Math.PI * 0.45, Math.PI * 1.88);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = app.hairColor;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(-1, -1.2, 8.2, Math.PI * 0.65, Math.PI * 1.95);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (app.hairStyle === 'ponytail') {
      drawRoundedRect(ctx, -10.5, -2, 5, 9, 2.5);
      ctx.fill();
      ctx.stroke();
    } else if (app.hairStyle === 'spiky') {
      ctx.beginPath();
      ctx.moveTo(-4, -7);
      ctx.lineTo(0, -12.5);
      ctx.lineTo(4, -7);
      ctx.fill();
      ctx.stroke();
    } else if (app.hairStyle === 'cap') {
      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.arc(-0.5, -2, 8.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawRoundedRect(ctx, 2, -4, 9.5, 3, 1.5);
      ctx.fill();
      ctx.stroke();
    } else if (app.hairStyle === 'beanie') {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(-0.5, -2.5, 8.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawRoundedRect(ctx, -8.5, -4.5, 16.5, 3, 1.4);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (app.accessory === 'headphones') {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, -1, 8.8, Math.PI * 1.15, Math.PI * 1.75);
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-1.5, 0.5, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(4.2, 0.8, 1.35, 0, Math.PI * 2);
  ctx.fill();
}
