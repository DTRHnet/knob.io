import { ARENA_HEIGHT, ARENA_WIDTH } from './maps';
import { MatchState, PlayerState, ReplayFrame, RuntimePlatform, SkinStyle } from './types';

export interface CameraView {
  x: number;
  y: number;
  zoom: number;
}

const MATERIAL_STYLE: Record<
  RuntimePlatform['material'],
  { fill: string; stroke: string; accent: string; label: string }
> = {
  standard: { fill: '#243047', stroke: '#475569', accent: '#64748b', label: '' },
  ice: { fill: '#0c4a6e', stroke: '#38bdf8', accent: '#bae6fd', label: 'ICE' },
  bouncy: { fill: '#7c2d12', stroke: '#fb923c', accent: '#fed7aa', label: 'SPRING' },
  super_bounce: { fill: '#4c1d95', stroke: '#c084fc', accent: '#f3e8ff', label: 'HYPER' },
  sticky: { fill: '#064e3b', stroke: '#10b981', accent: '#a7f3d0', label: 'STICKY' },
  boost: { fill: '#064e3b', stroke: '#34d399', accent: '#a7f3d0', label: 'BOOST' },
  conveyor: { fill: '#312e81', stroke: '#818cf8', accent: '#c7d2fe', label: 'BELT' },
  breakable: { fill: '#78350f', stroke: '#f59e0b', accent: '#fde68a', label: 'FRAGILE' },
  soft: { fill: '#134e4a', stroke: '#2dd4bf', accent: '#99f6e4', label: 'GEL' },
};

let cachedBgCanvas: HTMLCanvasElement | null = null;
let cachedBgKey = '';

function getBackgroundLayer(
  width: number,
  height: number,
  bgStyle: MatchState['map']['bgStyle']
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${width}x${height}:${bgStyle}`;
  if (cachedBgCanvas && cachedBgKey === key) return cachedBgCanvas;

  if (!cachedBgCanvas) {
    cachedBgCanvas = document.createElement('canvas');
  }
  cachedBgCanvas.width = Math.max(1, Math.floor(width));
  cachedBgCanvas.height = Math.max(1, Math.floor(height));
  cachedBgKey = key;

  const bctx = cachedBgCanvas.getContext('2d');
  if (!bctx) return null;

  bctx.fillStyle = '#0E121B';
  bctx.fillRect(0, 0, width, height);

  const bgGrad = bctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    60,
    width * 0.5,
    height * 0.5,
    width * 0.72
  );
  if (bgStyle === 'glacier') {
    bgGrad.addColorStop(0, '#12263a');
    bgGrad.addColorStop(1, '#0b1019');
  } else if (bgStyle === 'forge') {
    bgGrad.addColorStop(0, '#271717');
    bgGrad.addColorStop(1, '#0d1018');
  } else if (bgStyle === 'reactor') {
    bgGrad.addColorStop(0, '#132238');
    bgGrad.addColorStop(1, '#0a0f18');
  } else {
    bgGrad.addColorStop(0, '#161e2e');
    bgGrad.addColorStop(1, '#0c1018');
  }
  bctx.fillStyle = bgGrad;
  bctx.fillRect(0, 0, width, height);
  return cachedBgCanvas;
}

export function renderMatchCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: MatchState,
  cam: CameraView = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, zoom: 1 }
): void {
  ctx.save();
  const bgLayer = getBackgroundLayer(width, height, state.map.bgStyle);
  if (bgLayer) {
    ctx.drawImage(bgLayer, 0, 0, width, height);
  } else {
    ctx.fillStyle = '#0E121B';
    ctx.fillRect(0, 0, width, height);
  }

  // Fit 1280x720 arena inside viewport preserving aspect ratio + trauma shake
  const baseScale = Math.min(width / ARENA_WIDTH, height / ARENA_HEIGHT);
  const scale = baseScale * cam.zoom;
  const shakeMag = state.trauma * state.trauma * 14;
  const shakeX = shakeMag * Math.sin(state.timeElapsed * 53);
  const shakeY = shakeMag * Math.cos(state.timeElapsed * 47);

  ctx.translate(width * 0.5 + shakeX, height * 0.5 + shakeY);
  ctx.scale(scale, scale);
  ctx.translate(-cam.x, -cam.y);

  // Architectural arena grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
  ctx.lineWidth = 1;
  const gridStep = 64;
  for (let gx = 0; gx <= ARENA_WIDTH; gx += gridStep) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, ARENA_HEIGHT);
    ctx.stroke();
  }
  for (let gy = 0; gy <= ARENA_HEIGHT; gy += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(ARENA_WIDTH, gy);
    ctx.stroke();
  }

  // Arena knockout boundary frame
  ctx.strokeStyle = 'rgba(255, 77, 61, 0.25)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.strokeRect(-45, -45, ARENA_WIDTH + 90, ARENA_HEIGHT + 90);
  ctx.setLineDash([]);

  // Survival Shrinking Safe Ring & Rising Acid Caldera
  if (state.config.mode === 'survival') {
    ctx.save();
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.arc(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, state.survivalRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (state.hazardRiseY < ARENA_HEIGHT + 30) {
      ctx.fillStyle = 'rgba(244, 63, 94, 0.26)';
      ctx.fillRect(-100, state.hazardRiseY, ARENA_WIDTH + 200, ARENA_HEIGHT + 200);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-100, state.hazardRiseY);
      ctx.lineTo(ARENA_WIDTH + 100, state.hazardRiseY);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Force Zones (Wind, Gravity, Magnet)
  for (const z of state.zones) {
    if (!z.currentActive) continue;
    ctx.save();
    if (z.type === 'magnet') {
      const r = z.radius ?? 200;
      const pulse = 0.85 + 0.15 * Math.sin(state.timeElapsed * 4);
      const grad = ctx.createRadialGradient(z.x, z.y, 10, z.x, z.y, r);
      grad.addColorStop(0, z.strength >= 0 ? 'rgba(56, 189, 248, 0.22)' : 'rgba(244, 63, 94, 0.22)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(z.x, z.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = z.strength >= 0 ? 'rgba(56, 189, 248, 0.45)' : 'rgba(244, 63, 94, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(z.x, z.y, r * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (z.type === 'wind') {
      ctx.fillStyle = 'rgba(167, 139, 250, 0.08)';
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.25)';
      ctx.lineWidth = 1;
      ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
      ctx.strokeRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);

      // Flowing wind streaks
      const mag = Math.hypot(z.currentFx, z.currentFy) || 1;
      const dx = z.currentFx / mag;
      const dy = z.currentFy / mag;
      ctx.strokeStyle = 'rgba(196, 181, 253, 0.42)';
      ctx.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        const offset = ((state.timeElapsed * 140 + k * 55) % Math.max(z.w, z.h)) - Math.max(z.w, z.h) * 0.5;
        const sx = z.x + dx * offset + (k - 2) * 20 * -dy;
        const sy = z.y + dy * offset + (k - 2) * 20 * dx;
        ctx.beginPath();
        ctx.moveTo(sx - dx * 14, sy - dy * 14);
        ctx.lineTo(sx + dx * 14, sy + dy * 14);
        ctx.stroke();
      }
    } else if (z.type === 'gravity') {
      const inverted = z.pulseTimer > 0;
      ctx.fillStyle = inverted ? 'rgba(251, 146, 60, 0.14)' : 'rgba(34, 211, 238, 0.1)';
      ctx.strokeStyle = inverted ? 'rgba(251, 146, 60, 0.45)' : 'rgba(34, 211, 238, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
      ctx.strokeRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
    }
    ctx.restore();
  }

  // Mode Objectives (KOTH Hill / CTF Goals & Flag)
  if (state.config.mode === 'koth') {
    ctx.save();
    const owner = state.players.find((p) => p.id === state.kothOwnerId);
    const col = owner ? owner.loadout.color : '#fbbf24';
    ctx.fillStyle = `${col}1f`;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(state.kothX, state.kothY, state.kothRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HILL', state.kothX, state.kothY - state.kothRadius - 8);
    ctx.restore();
  } else if (state.config.mode === 'ctf') {
    for (const obj of state.map.objectives) {
      if (obj.type === 'ctf_goal_a' || obj.type === 'ctf_goal_b') {
        const isA = obj.type === 'ctf_goal_a';
        ctx.save();
        ctx.fillStyle = isA ? 'rgba(245, 158, 11, 0.16)' : 'rgba(6, 182, 212, 0.16)';
        ctx.strokeStyle = isA ? '#f59e0b' : '#06b6d4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isA ? '#fde68a' : '#a5f3fc';
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(isA ? 'GOAL A' : 'GOAL B', obj.x, obj.y + 4);
        ctx.restore();
      }
    }
    // Render Flag Core
    ctx.save();
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(state.flagX, state.flagY - 14);
    ctx.lineTo(state.flagX + 12, state.flagY);
    ctx.lineTo(state.flagX, state.flagY + 14);
    ctx.lineTo(state.flagX - 12, state.flagY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Platforms with material-distinct rendering
  for (const plat of state.platforms) {
    if (!plat.currentActive) continue;
    const style = MATERIAL_STYLE[plat.material];
    ctx.save();
    ctx.translate(plat.x, plat.y + (plat.material === 'soft' ? plat.softDeflection * 0.45 : 0));
    ctx.rotate(plat.angle);

    const hw = plat.w / 2;
    const hh = plat.h / 2;

    if (plat.material === 'soft') {
      // Curved deformable trampoline gel bridge
      ctx.fillStyle = style.fill;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-hw, -hh);
      ctx.quadraticCurveTo(0, -hh + plat.softDeflection, hw, -hh);
      ctx.lineTo(hw, hh);
      ctx.quadraticCurveTo(0, hh + plat.softDeflection * 0.65, -hw, hh);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = style.fill;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-hw, -hh, plat.w, plat.h, 5);
      ctx.fill();
      ctx.stroke();

      // Surface material texture details
      if (plat.material === 'ice') {
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-hw + 8, -hh + 4);
        ctx.lineTo(hw - 8, -hh + 4);
        ctx.stroke();
      } else if (plat.material === 'bouncy') {
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 2;
        for (let sx = -hw + 14; sx < hw - 10; sx += 22) {
          ctx.beginPath();
          ctx.moveTo(sx, hh - 4);
          ctx.lineTo(sx + 6, -hh + 4);
          ctx.lineTo(sx + 12, hh - 4);
          ctx.stroke();
        }
      } else if (plat.material === 'super_bounce') {
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 2.2;
        for (let sx = -hw + 12; sx < hw - 12; sx += 24) {
          ctx.beginPath();
          ctx.moveTo(sx, 3);
          ctx.lineTo(sx + 6, -hh + 3);
          ctx.lineTo(sx + 12, 3);
          ctx.moveTo(sx, hh - 3);
          ctx.lineTo(sx + 6, -1);
          ctx.lineTo(sx + 12, hh - 3);
          ctx.stroke();
        }
      } else if (plat.material === 'boost') {
        const dir = (plat.boostImpulse ?? 560) >= 0 ? 1 : -1;
        const shift = ((state.timeElapsed * 260 * dir) % 24 + 24) % 24;
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 2.2;
        for (let cx = -hw + shift; cx < hw - 10; cx += 24) {
          ctx.beginPath();
          ctx.moveTo(cx - 5 * dir, -5);
          ctx.lineTo(cx + 3 * dir, 0);
          ctx.lineTo(cx - 5 * dir, 5);
          ctx.moveTo(cx + 1 * dir, -5);
          ctx.lineTo(cx + 9 * dir, 0);
          ctx.lineTo(cx + 1 * dir, 5);
          ctx.stroke();
        }
      } else if (plat.material === 'conveyor') {
        const dir = (plat.conveyorSpeed ?? 150) >= 0 ? 1 : -1;
        const shift = ((state.timeElapsed * (plat.conveyorSpeed ?? 150)) % 24 + 24) % 24;
        ctx.strokeStyle = style.accent;
        ctx.lineWidth = 2;
        for (let cx = -hw + shift; cx < hw - 8; cx += 24) {
          ctx.beginPath();
          ctx.moveTo(cx - 5 * dir, -4);
          ctx.lineTo(cx + 3 * dir, 0);
          ctx.lineTo(cx - 5 * dir, 4);
          ctx.stroke();
        }
      } else if (plat.material === 'sticky') {
        ctx.fillStyle = style.accent;
        for (let bx = -hw + 10; bx < hw - 6; bx += 18) {
          ctx.beginPath();
          ctx.arc(bx, -hh + 3, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (plat.material === 'breakable') {
        const dmgRatio = 1 - plat.hp / Math.max(1, plat.maxHp);
        if (dmgRatio > 0.15) {
          ctx.strokeStyle = '#fef3c7';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-hw * 0.35, -hh);
          ctx.lineTo(-hw * 0.1, 0);
          ctx.lineTo(-hw * 0.22, hh);
          if (dmgRatio > 0.45) {
            ctx.moveTo(hw * 0.2, -hh);
            ctx.lineTo(hw * 0.05, 2);
            ctx.lineTo(hw * 0.32, hh);
          }
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  // Rotating Motorized Joints (Advanced Physics)
  if (state.config.advancedPhysics) {
    for (const joint of state.joints) {
      ctx.save();
      ctx.translate(joint.x, joint.y);
      ctx.rotate(joint.angle);
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-joint.length, -joint.thickness / 2, joint.length * 2, joint.thickness, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Bumpers & Chain-Reaction Mines
  for (const b of state.bumpers) {
    ctx.save();
    const hot = b.chainFlash > 0 || b.triggerTimer > 0;
    ctx.fillStyle = b.explosive ? (hot ? '#fda4af' : '#be123c') : hot ? '#fde68a' : '#d97706';
    ctx.strokeStyle = b.explosive ? '#fb7185' : '#fbbf24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius + (hot ? 3 : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius * 0.48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Shockwaves
  for (const sw of state.shockwaves) {
    if (!sw.active) continue;
    const alpha = Math.max(0, sw.life / sw.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Pooled Particles
  for (const pt of state.particles) {
    if (!pt.active) continue;
    ctx.save();
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    if (pt.shape === 'square') {
      ctx.fillRect(pt.x - pt.size * 0.5, pt.y - pt.size * 0.5, pt.size, pt.size);
    } else {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Players (Trails + Circle Bodies + Skins + Heavy Rim + Callouts)
  for (const p of state.players) {
    if (!p.alive) continue;
    drawPlayerTrail(ctx, p);
    drawPlayerCircle(ctx, p, state.timeElapsed);
  }

  ctx.restore();
}

function drawPlayerTrail(ctx: CanvasRenderingContext2D, p: PlayerState): void {
  if (p.trail.length < 2) return;
  ctx.save();
  for (let i = 1; i < p.trail.length; i++) {
    const prev = p.trail[i - 1];
    const curr = p.trail[i];
    const alpha = Math.max(0, 1 - i / p.trail.length) * (p.loadout.trail === 'plasma' ? 0.55 : 0.35);
    ctx.strokeStyle = p.loadout.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(2, p.radius * 1.15 * (1 - i / p.trail.length));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSkinOverlay(ctx: CanvasRenderingContext2D, skin: SkinStyle, r: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 2;
  if (skin === 'ring') {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.54, 0, Math.PI * 2);
    ctx.stroke();
  } else if (skin === 'prism') {
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.62);
    ctx.lineTo(r * 0.54, r * 0.42);
    ctx.lineTo(-r * 0.54, r * 0.42);
    ctx.closePath();
    ctx.stroke();
  } else if (skin === 'target') {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  } else if (skin === 'crescent') {
    ctx.beginPath();
    ctx.arc(-2, 0, r * 0.52, -Math.PI * 0.65, Math.PI * 0.65);
    ctx.stroke();
  } else if (skin === 'checker') {
    ctx.fillRect(-r * 0.4, -r * 0.4, r * 0.4, r * 0.4);
    ctx.fillRect(0, 0, r * 0.4, r * 0.4);
  } else if (skin === 'crown') {
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, r * 0.2);
    ctx.lineTo(-r * 0.45, -r * 0.3);
    ctx.lineTo(-r * 0.15, -r * 0.05);
    ctx.lineTo(0, -r * 0.42);
    ctx.lineTo(r * 0.15, -r * 0.05);
    ctx.lineTo(r * 0.45, -r * 0.3);
    ctx.lineTo(r * 0.45, r * 0.2);
    ctx.closePath();
    ctx.stroke();
  }
}

function drawPlayerCircle(ctx: CanvasRenderingContext2D, p: PlayerState, time: number): void {
  ctx.save();
  ctx.translate(p.x, p.y);

  // Blink gently if invulnerable
  if (p.invulnTimer > 0 && Math.floor(time * 16) % 2 === 0) {
    ctx.globalAlpha = 0.6;
  }

  // Active Bounce Boost / Chain kinetic aura ring
  if (p.activeBoostFlash > 0 || p.bounceChain >= 1) {
    ctx.save();
    ctx.strokeStyle = p.activeBoostFlash > 0 ? '#34d399' : '#c084fc';
    ctx.globalAlpha = p.activeBoostFlash > 0 ? 0.85 : 0.45;
    ctx.lineWidth = p.activeBoostFlash > 0 ? 3.5 : 2;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius + 7 + (p.activeBoostFlash > 0 ? 3 : 0), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Heavy mode outer iron armor ring
  if (p.isHeavy) {
    ctx.save();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.scale(p.squashX, p.squashY);
  ctx.rotate(p.angle);

  ctx.fillStyle = p.hitFlashTimer > 0 ? '#ffffff' : p.loadout.color;
  ctx.strokeStyle = p.isHeavy ? '#0f172a' : '#f8fafc';
  ctx.lineWidth = p.isHeavy ? 4 : 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  drawSkinOverlay(ctx, p.loadout.skin, p.radius);

  // Subtle directional eye dots for instant readable orientation
  const lookX = Math.max(-1, Math.min(1, p.vx / 260)) * 4;
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(lookX - 5, -3, 2.6, 0, Math.PI * 2);
  ctx.arc(lookX + 5, -3, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Player name tag with dark outline for contrast over bright platforms
  ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(11, 15, 24, 0.88)';
  ctx.strokeText(p.name, 0, -p.radius - 11);
  ctx.fillStyle = '#f1f5f9';
  ctx.fillText(p.name, 0, -p.radius - 11);

  // Reactive Emote / Callout Bubble
  if (p.calloutText && p.calloutTimer > 0) {
    ctx.save();
    ctx.font = '700 11px "JetBrains Mono", monospace';
    const textW = ctx.measureText(p.calloutText).width + 14;
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-textW / 2, -p.radius - 42, textW, 20, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.fillText(p.calloutText, 0, -p.radius - 28);
    ctx.restore();
  }

  ctx.restore();
}

export function applyReplayFrame(state: MatchState, frame: ReplayFrame): void {
  state.timeElapsed = frame.time;
  state.survivalRadius = frame.survivalRadius;
  state.hazardRiseY = frame.hazardLevel;
  state.flagX = frame.flagX;
  state.flagY = frame.flagY;
  for (const fp of frame.players) {
    const p = state.players.find((pl) => pl.id === fp.id);
    if (!p) continue;
    p.x = fp.x;
    p.y = fp.y;
    p.vx = fp.vx;
    p.vy = fp.vy;
    p.isHeavy = fp.isHeavy;
    p.alive = fp.alive;
    p.stocks = fp.stocks;
    p.angle = fp.angle;
    p.objectiveScore = fp.objectiveScore;
    p.hasFlag = fp.hasFlag;
    p.calloutText = fp.calloutText;
    p.calloutTimer = fp.calloutText ? 0.5 : 0;
  }
}
