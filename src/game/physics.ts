import { ARENA_HEIGHT, ARENA_WIDTH } from './maps';
import {
  AIPolicy,
  ArenaMap,
  CosmeticLoadout,
  DEFAULT_PHYSICS_CVARS,
  MatchConfig,
  MatchState,
  PHYSICS_PRESETS,
  Particle,
  PhysicsCVars,
  PlayerInput,
  PlayerState,
  RankTier,
  RuntimeBumper,
  RuntimePlatform,
  RuntimeZone,
  ShockwaveRing,
  SurfaceMaterial,
} from './types';

export const FIXED_PHYSICS_DT = 1 / 120; // 120 Hz deterministic fixed timestep
export const BASE_GRAVITY = DEFAULT_PHYSICS_CVARS.sv_gravity;
export const CIRCLE_RADIUS = 22;
export const MAX_PARTICLES = 240;
export const MAX_SHOCKWAVES = 24;

export interface PlayerSeed {
  id: string;
  name: string;
  isHuman: boolean;
  aiPolicy: AIPolicy;
  team: 0 | 1 | 2;
  loadout: CosmeticLoadout;
}

export function resolvePhysicsCVars(map: ArenaMap, config: MatchConfig): PhysicsCVars {
  const base: PhysicsCVars = { ...DEFAULT_PHYSICS_CVARS };
  const mapPatch = map.physicsOverrides ?? {};
  const presetPatch =
    config.physicsPreset !== 'map_default' ? PHYSICS_PRESETS[config.physicsPreset] : {};
  const customPatch = config.customCVars ?? {};

  const merged: PhysicsCVars =
    config.physicsPreset === 'map_default'
      ? { ...base, ...mapPatch, ...customPatch }
      : { ...base, ...mapPatch, ...presetPatch, ...customPatch };

  if (config.arcadeModifier === 'low_g') {
    merged.sv_gravity = Math.round(merged.sv_gravity * 0.56);
  } else if (config.arcadeModifier === 'hyper_bounce') {
    merged.sv_bounce = Number((merged.sv_bounce * 1.24).toFixed(2));
  }

  return merged;
}

export function createDefaultParticlePool(): Particle[] {
  const pool: Particle[] = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    pool.push({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 3,
      color: '#ffffff',
      shape: 'circle',
    });
  }
  return pool;
}

export function createDefaultShockwavePool(): ShockwaveRing[] {
  const pool: ShockwaveRing[] = [];
  for (let i = 0; i < MAX_SHOCKWAVES; i++) {
    pool.push({
      active: false,
      x: 0,
      y: 0,
      radius: 4,
      maxRadius: 60,
      life: 0,
      maxLife: 0.35,
      color: '#ffffff',
    });
  }
  return pool;
}

export function spawnParticle(
  state: MatchState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  color: string,
  size = 4,
  maxLife = 0.45,
  shape: Particle['shape'] = 'circle'
): void {
  const p = state.particles[state.particleCursor];
  state.particleCursor = (state.particleCursor + 1) % state.particles.length;
  p.active = true;
  p.x = x;
  p.y = y;
  p.vx = vx;
  p.vy = vy;
  p.color = color;
  p.size = size;
  p.life = maxLife;
  p.maxLife = maxLife;
  p.shape = shape;
}

export function spawnBurst(
  state: MatchState,
  x: number,
  y: number,
  color: string,
  count: number,
  speed = 240,
  shape: Particle['shape'] = 'circle'
): void {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + ((i * 1.618) % 0.5);
    const mag = speed * (0.45 + ((i * 37) % 10) / 14);
    spawnParticle(
      state,
      x,
      y,
      Math.cos(a) * mag,
      Math.sin(a) * mag - 40,
      color,
      3 + (i % 4),
      0.32 + (i % 5) * 0.06,
      shape
    );
  }
}

export function spawnShockwave(
  state: MatchState,
  x: number,
  y: number,
  color: string,
  maxRadius = 72
): void {
  for (let i = 0; i < state.shockwaves.length; i++) {
    const sw = state.shockwaves[i];
    if (!sw.active) {
      sw.active = true;
      sw.x = x;
      sw.y = y;
      sw.radius = 12;
      sw.maxRadius = maxRadius;
      sw.life = 0.34;
      sw.maxLife = 0.34;
      sw.color = color;
      return;
    }
  }
}

export function createMatchState(
  map: ArenaMap,
  config: MatchConfig,
  seeds: PlayerSeed[]
): MatchState {
  const cvars = resolvePhysicsCVars(map, config);

  const platforms: RuntimePlatform[] = map.platforms.map((p) => ({
    ...p,
    baseX: p.x,
    baseY: p.y,
    vx: 0,
    vy: 0,
    hp: p.breakableHp ?? 90,
    maxHp: p.breakableHp ?? 90,
    respawnTimer: 0,
    softDeflection: 0,
    softVelocity: 0,
    currentActive: p.active !== false,
  }));

  const zones: RuntimeZone[] = map.zones.map((z) => ({
    ...z,
    currentActive: z.active !== false,
    currentFx: z.fx,
    currentFy: z.fy,
    pulseTimer: 0,
  }));

  const bumpers: RuntimeBumper[] = map.bumpers.map((b) => ({
    ...b,
    triggerTimer: 0,
    chainFlash: 0,
  }));

  if (config.arcadeModifier === 'bumper_chaos') {
    bumpers.push(
      {
        id: 'arc-b1',
        x: 460,
        y: 270,
        radius: 22,
        impulse: 760,
        explosive: config.advancedPhysics,
        cooldown: 0.4,
        triggerTimer: 0,
        chainFlash: 0,
      },
      {
        id: 'arc-b2',
        x: 820,
        y: 270,
        radius: 22,
        impulse: 760,
        explosive: config.advancedPhysics,
        cooldown: 0.4,
        triggerTimer: 0,
        chainFlash: 0,
      }
    );
  }

  const players: PlayerState[] = seeds.map((s, idx) => {
    const spawn = map.spawns[idx % map.spawns.length] ?? { x: 480 + idx * 110, y: 260, team: 0 };
    return {
      id: s.id,
      name: s.name,
      isHuman: s.isHuman,
      aiPolicy: s.aiPolicy,
      team: s.team,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      radius: CIRCLE_RADIUS,
      mass: 1.0,
      angle: 0,
      angVel: 0,
      isHeavy: false,
      grounded: false,
      onStickyWall: false,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      prevJumpHeld: false,
      lastSurfaceMaterial: 'standard',
      stocks: config.mode === 'survival' ? 1 : config.stocks,
      alive: true,
      respawnTimer: 0,
      invulnTimer: 1.2,
      hitFlashTimer: 0,
      squashX: 1,
      squashY: 1,
      knockouts: 0,
      deaths: 0,
      damageDealt: 0,
      objectiveScore: 0,
      lastHitBy: null,
      lastHitTimer: 0,
      loadout: s.loadout,
      trail: [],
      calloutText: null,
      calloutTimer: 0,
      emoteCooldown: 0,
      hasFlag: false,
      bounceChain: 0,
      lastImpactSpeed: 0,
      activeBoostFlash: 0,
    };
  });

  const kothObj = map.objectives.find((o) => o.type === 'koth_hill');
  const flagObj = map.objectives.find((o) => o.type === 'ctf_flag');

  return {
    map,
    config,
    cvars,
    timeElapsed: 0,
    timeRemaining: config.timeLimitSec,
    hitstopTimer: 0,
    trauma: 0,
    platforms,
    zones,
    joints: map.joints.map((j) => ({ ...j })),
    bumpers,
    triggerCooldowns: {},
    players,
    particles: createDefaultParticlePool(),
    particleCursor: 0,
    shockwaves: createDefaultShockwavePool(),
    survivalRadius: 680,
    hazardRiseY: ARENA_HEIGHT + 40,
    kothX: kothObj?.x ?? ARENA_WIDTH / 2,
    kothY: kothObj?.y ?? 260,
    kothRadius: kothObj?.radius ?? 85,
    kothOwnerId: null,
    flagX: flagObj?.x ?? ARENA_WIDTH / 2,
    flagY: flagObj?.y ?? 360,
    flagVx: 0,
    flagVy: 0,
    flagCarrierId: null,
    finished: false,
    winnerId: null,
    winnerName: null,
    winReason: null,
    wasBehindAtHalfway: {},
  };
}

interface MaterialProps {
  friction: number;
  restitution: number;
  accelScale: number;
  minBounceVy: number;
}

function getMaterialProps(
  mat: SurfaceMaterial,
  globalBounce: number,
  hyperBounce: boolean,
  platOverride?: { bounciness?: number; friction?: number }
): MaterialProps {
  const bounceMult = hyperBounce ? 1.24 : 1.0;
  let base: MaterialProps;
  switch (mat) {
    case 'ice':
      base = { friction: 0.02, restitution: globalBounce * 0.75 * bounceMult, accelScale: 0.45, minBounceVy: 0 };
      break;
    case 'bouncy':
      base = { friction: 0.16, restitution: 1.18 * bounceMult, accelScale: 1.0, minBounceVy: 360 * bounceMult };
      break;
    case 'super_bounce':
      base = {
        friction: 0.14,
        restitution: Math.max(1.22, globalBounce * 2.6) * bounceMult,
        accelScale: 1.05,
        minBounceVy: 460 * bounceMult,
      };
      break;
    case 'sticky':
      base = { friction: 0.92, restitution: 0.04, accelScale: 1.15, minBounceVy: 0 };
      break;
    case 'boost':
      base = { friction: 0.08, restitution: globalBounce * 0.85 * bounceMult, accelScale: 1.18, minBounceVy: 0 };
      break;
    case 'conveyor':
      base = { friction: 0.34, restitution: globalBounce * 0.65 * bounceMult, accelScale: 1.05, minBounceVy: 0 };
      break;
    case 'breakable':
      base = { friction: 0.24, restitution: globalBounce * 0.72 * bounceMult, accelScale: 1.0, minBounceVy: 0 };
      break;
    case 'soft':
      base = { friction: 0.28, restitution: 0.24 * bounceMult, accelScale: 0.92, minBounceVy: 0 };
      break;
    case 'standard':
    default:
      base = { friction: 0.22, restitution: globalBounce * bounceMult, accelScale: 1.0, minBounceVy: 0 };
      break;
  }

  if (platOverride?.bounciness !== undefined) {
    base.restitution = platOverride.bounciness * bounceMult;
  }
  if (platOverride?.friction !== undefined) {
    base.friction = platOverride.friction;
  }
  return base;
}

function respawnPlayer(state: MatchState, p: PlayerState, index: number): void {
  const spawn =
    state.map.spawns.find((s) => s.team === p.team) ??
    state.map.spawns[index % state.map.spawns.length] ?? { x: ARENA_WIDTH / 2, y: 240 };
  p.x = spawn.x;
  p.y = spawn.y - 24;
  p.vx = 0;
  p.vy = 0;
  p.alive = true;
  p.invulnTimer = 1.6;
  p.lastHitBy = null;
  p.lastHitTimer = 0;
  p.trail = [];
  p.squashX = 0.8;
  p.squashY = 1.25;
  p.bounceChain = 0;
  p.lastImpactSpeed = 0;
  p.activeBoostFlash = 0;
  spawnShockwave(state, p.x, p.y, p.loadout.color, 55);
}

function executeTriggerAction(
  state: MatchState,
  action: ArenaMap['triggers'][number]['action'],
  targetTag: string
): void {
  if (action === 'toggle_platform') {
    for (const plat of state.platforms) {
      if (plat.tag === targetTag || plat.id === targetTag) {
        plat.currentActive = !plat.currentActive;
        spawnBurst(state, plat.x, plat.y, '#38bdf8', 10, 180, 'square');
      }
    }
  } else if (action === 'reverse_wind') {
    for (const z of state.zones) {
      if (z.tag === targetTag || z.id === targetTag) {
        z.currentFx = -z.currentFx;
        z.currentFy = -z.currentFy;
        spawnShockwave(state, z.x, z.y, '#a78bfa', 80);
      }
    }
  } else if (action === 'pulse_gravity') {
    for (const z of state.zones) {
      if (z.tag === targetTag || z.id === targetTag) {
        z.pulseTimer = 2.5;
        spawnShockwave(state, z.x, z.y, '#22d3ee', 95);
      }
    }
  } else if (action === 'detonate_bumpers') {
    for (const b of state.bumpers) {
      if (b.id === targetTag || b.explosive) {
        b.chainFlash = 0.35;
        spawnShockwave(state, b.x, b.y, '#fb7185', 110);
      }
    }
  }
}

export interface StepEvents {
  koEvents: Array<{ victimId: string; killerId: string | null }>;
  collisions: Array<{ intensity: number; heavy: boolean }>;
  jumps: number;
  bounceBoosts: number;
  shatters: number;
  captures: number;
  triggersFired: number;
  emotesFired: number;
}

export function stepMatchFixed(
  state: MatchState,
  rawDt: number,
  inputs: Record<string, PlayerInput>,
  accumulatorRef: { current: number }
): StepEvents {
  const merged: StepEvents = {
    koEvents: [],
    collisions: [],
    jumps: 0,
    bounceBoosts: 0,
    shatters: 0,
    captures: 0,
    triggersFired: 0,
    emotesFired: 0,
  };

  const clampedDt = Math.min(Math.max(rawDt, 0), 0.05);
  accumulatorRef.current += clampedDt;

  let substeps = 0;
  while (accumulatorRef.current >= FIXED_PHYSICS_DT && substeps < 8) {
    const ev = stepMatch(state, FIXED_PHYSICS_DT, inputs);
    merged.koEvents.push(...ev.koEvents);
    merged.collisions.push(...ev.collisions);
    merged.jumps += ev.jumps;
    merged.bounceBoosts += ev.bounceBoosts;
    merged.shatters += ev.shatters;
    merged.captures += ev.captures;
    merged.triggersFired += ev.triggersFired;
    merged.emotesFired += ev.emotesFired;
    accumulatorRef.current -= FIXED_PHYSICS_DT;
    substeps++;
  }

  if (substeps >= 8 && accumulatorRef.current > FIXED_PHYSICS_DT * 2) {
    accumulatorRef.current = 0;
  }

  return merged;
}

export function stepMatch(
  state: MatchState,
  rawDt: number,
  inputs: Record<string, PlayerInput>
): StepEvents {
  const events: StepEvents = {
    koEvents: [],
    collisions: [],
    jumps: 0,
    bounceBoosts: 0,
    shatters: 0,
    captures: 0,
    triggersFired: 0,
    emotesFired: 0,
  };

  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  const cv = state.cvars;
  state.trauma = Math.max(0, state.trauma - dt * 1.9);

  // Decay shockwaves and pooled particles even during hitstop
  for (let i = 0; i < state.particles.length; i++) {
    const p = state.particles[i];
    if (!p.active) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 320 * dt;
    p.life -= dt;
    if (p.life <= 0) p.active = false;
  }

  for (let i = 0; i < state.shockwaves.length; i++) {
    const sw = state.shockwaves[i];
    if (!sw.active) continue;
    sw.life -= dt;
    const progress = 1 - Math.max(0, sw.life / sw.maxLife);
    sw.radius = 12 + (sw.maxRadius - 12) * progress;
    if (sw.life <= 0) sw.active = false;
  }

  if (state.finished) return events;

  if (state.hitstopTimer > 0) {
    state.hitstopTimer = Math.max(0, state.hitstopTimer - dt);
    return events;
  }

  state.timeElapsed += dt;
  state.timeRemaining = Math.max(0, state.timeRemaining - dt);

  // Track halfway comeback eligibility
  if (
    state.timeElapsed >= state.config.timeLimitSec * 0.45 &&
    Object.keys(state.wasBehindAtHalfway).length === 0
  ) {
    const maxStocks = Math.max(...state.players.map((pl) => pl.stocks));
    const maxObj = Math.max(...state.players.map((pl) => pl.objectiveScore));
    for (const pl of state.players) {
      state.wasBehindAtHalfway[pl.id] =
        state.config.mode === 'koth' || state.config.mode === 'ctf'
          ? pl.objectiveScore < maxObj
          : pl.stocks < maxStocks;
    }
  }

  // Update trigger cooldowns and timer triggers
  for (const trig of state.map.triggers) {
    const cd = state.triggerCooldowns[trig.id] ?? 0;
    if (cd > 0) {
      state.triggerCooldowns[trig.id] = Math.max(0, cd - dt);
    }
    if (trig.event === 'timer' && (state.triggerCooldowns[trig.id] ?? 0) <= 0) {
      executeTriggerAction(state, trig.action, trig.targetTag);
      state.triggerCooldowns[trig.id] = trig.intervalSec ?? Math.max(2, trig.cooldownSec);
      events.triggersFired++;
    }
  }

  // Update moving platforms (with instantaneous velocity tracking), soft-body rebound, breakables
  for (const plat of state.platforms) {
    const prevX = plat.x;
    const prevY = plat.y;
    if (plat.moveAxis === 'x' && plat.moveRange && plat.moveSpeed) {
      plat.x = plat.baseX + Math.sin(state.timeElapsed * plat.moveSpeed) * plat.moveRange;
    } else if (plat.moveAxis === 'y' && plat.moveRange && plat.moveSpeed) {
      plat.y = plat.baseY + Math.sin(state.timeElapsed * plat.moveSpeed) * plat.moveRange;
    }
    plat.vx = dt > 0 ? (plat.x - prevX) / dt : 0;
    plat.vy = dt > 0 ? (plat.y - prevY) / dt : 0;

    if (plat.material === 'soft') {
      const k = 115;
      const damp = 8.5;
      const accel = -k * plat.softDeflection - damp * plat.softVelocity;
      plat.softVelocity += accel * dt;
      plat.softDeflection += plat.softVelocity * dt;
    }

    if (plat.material === 'breakable' && !plat.currentActive && plat.respawnTimer > 0) {
      plat.respawnTimer -= dt;
      if (plat.respawnTimer <= 0 && state.config.mode !== 'survival') {
        plat.currentActive = true;
        plat.hp = plat.maxHp;
        spawnShockwave(state, plat.x, plat.y, '#f59e0b', 50);
      }
    }
  }

  // Update zones (pulse timers)
  for (const z of state.zones) {
    if (z.pulseTimer > 0) {
      z.pulseTimer = Math.max(0, z.pulseTimer - dt);
    }
  }

  // Update rotating motorized joints (Advanced Physics)
  if (state.config.advancedPhysics) {
    for (const joint of state.joints) {
      joint.angle += joint.angularSpeed * dt;
    }
  }

  // Update bumpers
  for (const b of state.bumpers) {
    if (b.triggerTimer > 0) b.triggerTimer = Math.max(0, b.triggerTimer - dt);
    if (b.chainFlash > 0) b.chainFlash = Math.max(0, b.chainFlash - dt);
  }

  // Mode-specific hazards
  if (state.config.mode === 'survival') {
    state.survivalRadius = Math.max(195, 680 - state.timeElapsed * 7.2);
    state.hazardRiseY = Math.max(480, ARENA_HEIGHT + 35 - state.timeElapsed * 4.5);
  }

  const heavyClashBoost = state.config.arcadeModifier === 'heavy_clash' ? 1.45 : 1.0;
  const hyperBounce = state.config.arcadeModifier === 'hyper_bounce';
  const jumpBufferSec = Math.max(0, cv.sv_jump_buffer / 1000);
  const coyoteSec = Math.max(0, cv.sv_coyote_time / 1000);

  // Step each player
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];

    // Smooth squash/stretch return to 1
    p.squashX += (1 - p.squashX) * Math.min(1, dt * 14);
    p.squashY += (1 - p.squashY) * Math.min(1, dt * 14);

    if (p.hitFlashTimer > 0) p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);
    if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    if (p.activeBoostFlash > 0) p.activeBoostFlash = Math.max(0, p.activeBoostFlash - dt);
    if (p.lastHitTimer > 0) {
      p.lastHitTimer = Math.max(0, p.lastHitTimer - dt);
      if (p.lastHitTimer <= 0) p.lastHitBy = null;
    }
    if (p.calloutTimer > 0) {
      p.calloutTimer = Math.max(0, p.calloutTimer - dt);
      if (p.calloutTimer <= 0) p.calloutText = null;
    }
    if (p.emoteCooldown > 0) p.emoteCooldown = Math.max(0, p.emoteCooldown - dt);

    if (!p.alive) {
      if (p.stocks > 0) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          respawnPlayer(state, p, i);
        }
      }
      continue;
    }

    const inp = inputs[p.id] ?? {
      left: false,
      right: false,
      up: false,
      down: false,
      heavy: false,
      emote: false,
    };

    if (inp.emote && p.emoteCooldown <= 0) {
      p.calloutText = p.loadout.emote;
      p.calloutTimer = 1.75;
      p.emoteCooldown = 2.2;
      events.emotesFired++;
    }

    // Heavy toggle
    p.isHeavy = inp.heavy;
    p.mass = p.isHeavy ? 2.75 : 1.0;

    // Input buffering & Coyote timers driven by CVars
    const jumpJustPressed = inp.up && !p.prevJumpHeld;
    p.prevJumpHeld = inp.up;

    if (jumpJustPressed) {
      p.jumpBufferTimer = jumpBufferSec;
    } else {
      p.jumpBufferTimer = Math.max(0, p.jumpBufferTimer - dt);
    }

    if (p.grounded || p.onStickyWall) {
      p.coyoteTimer = coyoteSec;
    } else {
      p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);
    }

    // Horizontal acceleration with air control & horizontal momentum preservation
    const dirX = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const surfProps = getMaterialProps(p.lastSurfaceMaterial, cv.sv_bounce, hyperBounce);
    const moveAccel = p.grounded
      ? cv.sv_horizontal_accel * surfProps.accelScale
      : cv.sv_horizontal_accel * cv.sv_air_control;
    const heavyMoveScale = p.isHeavy ? 0.62 : 1.0;

    if (dirX !== 0) {
      // Allow adding acceleration up to sv_max_speed without erasing overspeed momentum from boosts/bounces
      const sameDir = dirX * p.vx > 0;
      if (!sameDir || Math.abs(p.vx) < cv.sv_max_speed) {
        p.vx += dirX * moveAccel * heavyMoveScale * dt;
        if (sameDir && Math.abs(p.vx) > cv.sv_max_speed) {
          p.vx = dirX * cv.sv_max_speed;
        }
      }
    }

    // Environmental force zones (Wind, Gravity, Magnet)
    let localGravityScale = 1.0;
    for (const z of state.zones) {
      if (!z.currentActive) continue;
      if (z.type === 'magnet') {
        const dx = z.x - p.x;
        const dy = z.y - p.y;
        const dist = Math.hypot(dx, dy);
        const maxR = z.radius ?? 200;
        if (dist > 8 && dist <= maxR) {
          const falloff = 1 - dist / maxR;
          const magBoost = p.isHeavy ? 1.85 : 1.0;
          const force = z.strength * falloff * magBoost;
          p.vx += (dx / dist) * force * dt;
          p.vy += (dy / dist) * force * dt;
        }
      } else {
        const inBox =
          Math.abs(p.x - z.x) <= z.w * 0.5 + p.radius &&
          Math.abs(p.y - z.y) <= z.h * 0.5 + p.radius;
        if (inBox) {
          if (z.type === 'wind') {
            p.vx += (z.currentFx / p.mass) * dt;
            p.vy += (z.currentFy / p.mass) * dt;
          } else if (z.type === 'gravity') {
            const pulse = z.pulseTimer > 0 ? -0.75 : z.strength;
            localGravityScale *= pulse;
          }

          // Check 'enter_zone' visual script triggers
          for (const trig of state.map.triggers) {
            if (
              trig.event === 'enter_zone' &&
              (trig.sourceTag === z.tag || trig.sourceTag === z.id) &&
              (state.triggerCooldowns[trig.id] ?? 0) <= 0
            ) {
              executeTriggerAction(state, trig.action, trig.targetTag);
              state.triggerCooldowns[trig.id] = trig.cooldownSec;
              events.triggersFired++;
            }
          }
        }
      }
    }

    // Variable Gravity Multipliers + Directional Fast-Fall (a_y = g + D * g_boost)
    let stateGravMult = 1.0;
    if (inp.down && !p.grounded) {
      stateGravMult = cv.sv_fastfall_multiplier;
    } else if (p.vy < 0) {
      stateGravMult = inp.up ? 1.0 : cv.sv_early_release_gravity;
    } else {
      stateGravMult = cv.sv_fall_gravity;
    }

    const heavyGrav = p.isHeavy ? 1.42 : 1.0;
    const effectiveGravity = cv.sv_gravity * localGravityScale * stateGravMult * heavyGrav;
    p.vy += effectiveGravity * dt;

    // Execute buffered jump if within coyote window (preserving horizontal vx!)
    if (p.jumpBufferTimer > 0 && p.coyoteTimer > 0) {
      const jumpSpeed = cv.sv_jump_impulse * (p.isHeavy ? 0.82 : 1.0);
      p.vy = Math.min(p.vy, 0) - jumpSpeed;
      if (p.vy < -jumpSpeed * 1.35) p.vy = -jumpSpeed * 1.35;

      if (p.onStickyWall && !p.grounded) {
        // Wall kick impulse away from sticky wall
        p.vx += dirX !== 0 ? dirX * 180 : p.x < ARENA_WIDTH / 2 ? 240 : -240;
      }
      p.grounded = false;
      p.onStickyWall = false;
      p.coyoteTimer = 0;
      p.jumpBufferTimer = 0;
      p.squashX = 0.82;
      p.squashY = 1.22;
      events.jumps++;
      spawnBurst(state, p.x, p.y + p.radius, p.loadout.color, 5, 110);
    }

    // Drag & velocity caps (air preserves momentum via low sv_air_friction; ground applies surface friction when coasting)
    if (!p.grounded) {
      p.vx *= Math.max(0, 1 - cv.sv_air_friction * dt);
    } else if (dirX === 0) {
      const coastScale = p.lastSurfaceMaterial === 'ice' ? 0.025 : surfProps.friction * 0.45;
      p.vx *= Math.max(0, 1 - cv.sv_ground_friction * coastScale * dt);
    }

    const maxFall = cv.sv_max_fall_speed * (p.isHeavy ? 1.15 : 1.0);
    const maxSpeedCeil = Math.max(cv.sv_max_speed * 2.1, 880);
    p.vy = Math.max(-960, Math.min(maxFall, p.vy));
    p.vx = Math.max(-maxSpeedCeil, Math.min(maxSpeedCeil, p.vx));

    // Integrate position
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += (p.vx / p.radius) * dt * 0.55;

    // Update cosmetic trail
    p.trail.unshift({ x: p.x, y: p.y, age: 0, heavy: p.isHeavy });
    if (p.trail.length > 16) p.trail.pop();
    for (const tp of p.trail) tp.age += dt;

    // Reset ground contacts before platform solver
    p.grounded = false;
    p.onStickyWall = false;

    // Solve platform collisions (oriented bounding boxes)
    for (const plat of state.platforms) {
      if (!plat.currentActive) continue;
      const hit = solveCircleOBB(p, plat.x, plat.y, plat.w, plat.h, plat.angle);
      if (!hit) continue;

      const matProps = getMaterialProps(plat.material, cv.sv_bounce, hyperBounce, {
        bounciness: plat.bounciness,
        friction: plat.friction,
      });

      // Relative velocity against moving platform
      const relVx = p.vx - plat.vx;
      const relVy = p.vy - plat.vy;
      const impactSpeed = -(relVx * hit.nx + relVy * hit.ny);

      // Push out of overlap
      p.x += hit.nx * hit.penetration;
      p.y += hit.ny * hit.penetration;

      // Ground / wall classification
      const isTopSupport = hit.ny < -0.52;
      if (isTopSupport) {
        p.lastSurfaceMaterial = plat.material;
        if (impactSpeed > 180) {
          p.squashX = 1.22;
          p.squashY = 0.78;
        }
        // Moving platform displacement transfer
        if (plat.vx !== 0 || plat.vy !== 0) {
          p.x += plat.vx * dt;
          p.y += plat.vy * dt;
        }
      } else if (plat.material === 'sticky' && Math.abs(hit.nx) > 0.65) {
        p.onStickyWall = true;
        p.lastSurfaceMaterial = 'sticky';
        p.vy *= 0.65;
      }

      // Soft-body platform deflection
      if (plat.material === 'soft' && hit.ny < -0.4 && impactSpeed > 30) {
        plat.softDeflection = Math.min(26, plat.softDeflection + impactSpeed * 0.032 * p.mass);
        plat.softVelocity += impactSpeed * 0.14;
      }

      // Breakable platform damage accumulation
      if (plat.material === 'breakable' && impactSpeed > 120) {
        const dmg = impactSpeed * 0.16 * (p.isHeavy ? 2.1 : 1.0);
        plat.hp -= dmg;
        if (plat.hp <= 0) {
          plat.currentActive = false;
          plat.respawnTimer = 6.5;
          events.shatters++;
          spawnBurst(state, plat.x, plat.y, '#fb923c', 16, 260, 'square');
          for (const trig of state.map.triggers) {
            if (
              trig.event === 'on_break' &&
              (trig.sourceTag === plat.tag || trig.sourceTag === plat.id) &&
              (state.triggerCooldowns[trig.id] ?? 0) <= 0
            ) {
              executeTriggerAction(state, trig.action, trig.targetTag);
              state.triggerCooldowns[trig.id] = trig.cooldownSec;
              events.triggersFired++;
            }
          }
          continue;
        }
      }

      // Impact-Based Bounce + Active Bounce Boosting + Clean Resting Settle
      if (impactSpeed > 0) {
        let rest = matProps.restitution;
        if (p.isHeavy && plat.material !== 'bouncy' && plat.material !== 'super_bounce') {
          rest *= 0.35;
        }

        const isAlwaysBounceMat = plat.material === 'bouncy' || plat.material === 'super_bounce';
        const settleThreshold = Math.min(115, Math.max(70, cv.sv_jump_impulse * 0.3));
        const canActiveBounceBoost =
          impactSpeed > settleThreshold && hit.ny < -0.35 && p.jumpBufferTimer > 0 && plat.material !== 'sticky';

        if (canActiveBounceBoost) {
          // Active Bounce Boost: v_new = e * |v_impact| + J
          const boostJ = cv.sv_jump_impulse * 0.68 * (p.isHeavy ? 0.7 : 1.0);
          const reboundSpeed = Math.max(rest * impactSpeed + boostJ, matProps.minBounceVy);
          p.vx += hit.nx * (impactSpeed + reboundSpeed);
          p.vy += hit.ny * (impactSpeed + reboundSpeed);

          // Inherit moving platform horizontal velocity on active bounce takeoff
          if (isTopSupport && plat.vx !== 0) {
            p.vx += plat.vx * 0.55;
          }

          p.grounded = false;
          p.coyoteTimer = 0;
          p.jumpBufferTimer = 0;
          p.bounceChain += 1;
          p.lastImpactSpeed = Math.round(impactSpeed);
          p.activeBoostFlash = 0.3;
          p.squashX = 0.72;
          p.squashY = 1.32;
          events.jumps += 1;
          events.bounceBoosts += 1;
          events.collisions.push({ intensity: reboundSpeed, heavy: false });
          spawnShockwave(state, p.x, p.y + p.radius, '#34d399', 54);
          spawnBurst(state, p.x, p.y + p.radius, '#a7f3d0', 10, 210, 'spark');
        } else if (impactSpeed > settleThreshold || isAlwaysBounceMat) {
          // Passive Impact Restitution Bounce: v_after = -e * v_before
          const reboundSpeed = Math.max(rest * impactSpeed, matProps.minBounceVy);
          p.vx += hit.nx * (impactSpeed + reboundSpeed);
          p.vy += hit.ny * (impactSpeed + reboundSpeed);
          p.lastImpactSpeed = Math.round(impactSpeed);

          if (isAlwaysBounceMat && hit.ny < -0.35) {
            p.grounded = false;
            p.bounceChain += 1;
            p.squashX = 0.76;
            p.squashY = 1.28;
            const burstColor = plat.material === 'super_bounce' ? '#c084fc' : '#fb923c';
            spawnBurst(state, p.x, p.y + p.radius, burstColor, 7, 160);
          } else if (reboundSpeed > settleThreshold && hit.ny < -0.35) {
            // Genuine momentum rebound off standard/ice surfaces
            p.grounded = false;
            p.squashX = 1.15;
            p.squashY = 0.85;
            events.collisions.push({ intensity: impactSpeed, heavy: p.isHeavy });
          } else if (isTopSupport) {
            p.grounded = true;
            p.bounceChain = 0;
          }
        } else {
          // Below bounce settle threshold: cancel normal penetration and stand cleanly
          p.vx += hit.nx * impactSpeed;
          p.vy += hit.ny * impactSpeed;
          if (isTopSupport) {
            p.grounded = true;
            p.bounceChain = 0;
            // Gently transfer moving platform horizontal velocity when standing on it
            if (plat.vx !== 0 && dirX === 0) {
              p.vx += (plat.vx - p.vx) * Math.min(1, dt * 12);
            }
          }
        }
      } else if (isTopSupport) {
        p.grounded = true;
      }

      // Tangential friction, Conveyor belt velocity, and Boost pad impulse
      const tx = -hit.ny;
      const ty = hit.nx;
      const vTangRel = (p.vx - plat.vx) * tx + (p.vy - plat.vy) * ty;
      if (plat.material === 'conveyor' && plat.conveyorSpeed) {
        const delta = (plat.conveyorSpeed - vTangRel) * Math.min(1, dt * 11);
        p.vx += tx * delta;
        p.vy += ty * delta;
      } else if (plat.material === 'boost') {
        const targetImpulse = plat.boostImpulse ?? 320;
        const boostDir = targetImpulse >= 0 ? 1 : -1;
        if (vTangRel * boostDir < Math.abs(targetImpulse)) {
          const boostDelta = targetImpulse - vTangRel;
          p.vx += tx * boostDelta * Math.min(1, dt * 14);
          p.vy += ty * boostDelta * Math.min(1, dt * 14);
          p.activeBoostFlash = Math.max(p.activeBoostFlash, 0.16);
          if (Math.abs(boostDelta) > 90) {
            spawnBurst(state, p.x, p.y + p.radius, '#34d399', 4, 120, 'spark');
          }
        }
      } else if (dirX === 0) {
        const frictionScale = matProps.friction;
        const damp = Math.min(1, frictionScale * cv.sv_ground_friction * dt * 1.4);
        p.vx -= tx * vTangRel * damp;
        p.vy -= ty * vTangRel * damp;
      }
    }

    // Solve rotating joints (Advanced Physics)
    if (state.config.advancedPhysics) {
      for (const joint of state.joints) {
        const hit = solveCircleOBB(p, joint.x, joint.y, joint.length * 2, joint.thickness, joint.angle);
        if (hit) {
          p.x += hit.nx * hit.penetration;
          p.y += hit.ny * hit.penetration;
          const rx = p.x - joint.x;
          const ry = p.y - joint.y;
          const armVx = -joint.angularSpeed * ry;
          const armVy = joint.angularSpeed * rx;
          const relVx = p.vx - armVx;
          const relVy = p.vy - armVy;
          const vn = relVx * hit.nx + relVy * hit.ny;
          if (vn < 0) {
            p.vx -= hit.nx * vn * 1.45;
            p.vy -= hit.ny * vn * 1.45;
            p.vx += armVx * 0.55;
            p.vy += armVy * 0.55;
            p.hitFlashTimer = 0.05;
            events.collisions.push({ intensity: Math.abs(vn), heavy: p.isHeavy });
          }
        }
      }
    }

    // Solve Bumper & Chain Reaction Mine collisions
    for (const b of state.bumpers) {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const dist = Math.hypot(dx, dy);
      const minDist = p.radius + b.radius;
      if (dist < minDist && dist > 0.001) {
        const nx = dx / dist;
        const ny = dy / dist;
        p.x = b.x + nx * minDist;
        p.y = b.y + ny * minDist;
        if (b.triggerTimer <= 0) {
          const launch = b.impulse * (p.isHeavy ? 0.65 : 1.0);
          p.vx = nx * launch;
          p.vy = ny * launch - 90;
          b.triggerTimer = b.cooldown;
          b.chainFlash = 0.25;
          p.hitFlashTimer = 0.06;
          events.collisions.push({ intensity: launch, heavy: true });
          spawnShockwave(state, b.x, b.y, b.explosive ? '#fb7185' : '#fbbf24', b.explosive ? 130 : 65);
          spawnBurst(state, b.x, b.y, b.explosive ? '#fb7185' : '#fbbf24', 12, 290);

          // Chain reaction to nearby explosive bumpers when Advanced Physics is on
          if (b.explosive && state.config.advancedPhysics) {
            state.trauma = Math.min(1, state.trauma + 0.45);
            state.hitstopTimer = Math.max(state.hitstopTimer, 0.04);
            for (const other of state.bumpers) {
              if (other.id !== b.id && other.explosive && other.triggerTimer <= 0) {
                const od = Math.hypot(other.x - b.x, other.y - b.y);
                if (od < 165) {
                  other.triggerTimer = other.cooldown;
                  other.chainFlash = 0.35;
                  spawnShockwave(state, other.x, other.y, '#f43f5e', 120);
                  for (const pl of state.players) {
                    if (!pl.alive) continue;
                    const pdx = pl.x - other.x;
                    const pdy = pl.y - other.y;
                    const pdist = Math.hypot(pdx, pdy);
                    if (pdist < 140 && pdist > 1) {
                      const blast = (1 - pdist / 140) * 680;
                      pl.vx += (pdx / pdist) * blast;
                      pl.vy += (pdy / pdist) * blast - 80;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Circle-vs-Circle Elastic & Mass-Weighted Knockback Collisions
  for (let i = 0; i < state.players.length; i++) {
    const a = state.players[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < state.players.length; j++) {
      const b = state.players[j];
      if (!b.alive) continue;
      const sameTeam = a.team !== 0 && a.team === b.team;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = a.radius + b.radius;
      if (dist >= minDist || dist === 0) continue;

      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      const totalMass = a.mass + b.mass;

      a.x -= nx * overlap * (b.mass / totalMass);
      a.y -= ny * overlap * (b.mass / totalMass);
      b.x += nx * overlap * (a.mass / totalMass);
      b.y += ny * overlap * (a.mass / totalMass);

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const velAlongNormal = rvx * nx + rvy * ny;
      if (velAlongNormal > 0) continue;

      const restitution = sameTeam ? 0.45 : (a.isHeavy || b.isHeavy ? 1.12 : 0.96) * heavyClashBoost;
      const jImpulse = (-(1 + restitution) * velAlongNormal) / (1 / a.mass + 1 / b.mass);

      const ix = jImpulse * nx;
      const iy = jImpulse * ny;
      a.vx -= ix / a.mass;
      a.vy -= iy / a.mass;
      b.vx += ix / b.mass;
      b.vy += iy / b.mass;

      const impactIntensity = Math.abs(velAlongNormal);
      if (!sameTeam && impactIntensity > 190) {
        a.lastHitBy = b.id;
        a.lastHitTimer = 4.0;
        b.lastHitBy = a.id;
        b.lastHitTimer = 4.0;

        a.damageDealt += Math.round(impactIntensity * 0.08 * a.mass);
        b.damageDealt += Math.round(impactIntensity * 0.08 * b.mass);

        const cx = (a.x + b.x) * 0.5;
        const cy = (a.y + b.y) * 0.5;
        const isBigHit = impactIntensity > 390 || (a.isHeavy !== b.isHeavy && impactIntensity > 260);
        events.collisions.push({ intensity: impactIntensity, heavy: isBigHit });

        if (isBigHit) {
          a.hitFlashTimer = 0.055;
          b.hitFlashTimer = 0.055;
          state.hitstopTimer = Math.max(state.hitstopTimer, 0.042);
          state.trauma = Math.min(1, state.trauma + 0.38);
          spawnShockwave(state, cx, cy, '#ffffff', 68);
          spawnBurst(state, cx, cy, '#fbbf24', 14, 300, 'spark');

          if (state.config.mode === 'ctf') {
            if (a.hasFlag) {
              a.hasFlag = false;
              state.flagCarrierId = null;
              state.flagVx = -nx * 240;
              state.flagVy = -260;
            } else if (b.hasFlag) {
              b.hasFlag = false;
              state.flagCarrierId = null;
              state.flagVx = nx * 240;
              state.flagVy = -260;
            }
          }
        } else {
          spawnBurst(state, cx, cy, '#e2e8f0', 5, 160);
        }
      }
    }
  }

  // Objective logic (KOTH & CTF)
  if (state.config.mode === 'koth') {
    const inside = state.players.filter(
      (p) => p.alive && Math.hypot(p.x - state.kothX, p.y - state.kothY) <= state.kothRadius
    );
    if (inside.length === 1) {
      const cap = inside[0];
      state.kothOwnerId = cap.id;
      cap.objectiveScore = Math.min(100, cap.objectiveScore + dt * 11.5);
      if (cap.objectiveScore >= 100) {
        state.finished = true;
        state.winnerId = cap.id;
        state.winnerName = cap.name;
        state.winReason = 'Hill Captured (100%)';
      }
    } else if (inside.length > 1) {
      state.kothOwnerId = null;
    } else {
      state.kothOwnerId = null;
    }
  } else if (state.config.mode === 'ctf') {
    if (state.flagCarrierId) {
      const carrier = state.players.find((p) => p.id === state.flagCarrierId && p.alive);
      if (carrier) {
        state.flagX = carrier.x;
        state.flagY = carrier.y - carrier.radius - 12;
        const goalType = carrier.team === 2 ? 'ctf_goal_b' : 'ctf_goal_a';
        const goal = state.map.objectives.find((o) => o.type === goalType);
        if (goal && Math.hypot(carrier.x - goal.x, carrier.y - goal.y) <= goal.radius + carrier.radius) {
          carrier.objectiveScore += 1;
          carrier.hasFlag = false;
          state.flagCarrierId = null;
          events.captures++;
          spawnShockwave(state, goal.x, goal.y, carrier.loadout.color, 110);
          spawnBurst(state, goal.x, goal.y, carrier.loadout.color, 20, 320, 'spark');
          const origFlag = state.map.objectives.find((o) => o.type === 'ctf_flag');
          state.flagX = origFlag?.x ?? ARENA_WIDTH / 2;
          state.flagY = origFlag?.y ?? 360;
          state.flagVx = 0;
          state.flagVy = 0;
          carrier.calloutText = 'CAPTURED!';
          carrier.calloutTimer = 1.8;
          if (carrier.objectiveScore >= 3) {
            state.finished = true;
            state.winnerId = carrier.id;
            state.winnerName = carrier.name;
            state.winReason = '3 Flag Captures';
          }
        }
      } else {
        state.flagCarrierId = null;
      }
    } else {
      state.flagVy += cv.sv_gravity * 0.55 * dt;
      state.flagX += state.flagVx * dt;
      state.flagY += state.flagVy * dt;
      state.flagVx *= Math.max(0, 1 - 2.5 * dt);
      for (const plat of state.platforms) {
        if (!plat.currentActive) continue;
        if (
          Math.abs(state.flagX - plat.x) <= plat.w * 0.5 &&
          Math.abs(state.flagY - (plat.y - plat.h * 0.5 - 12)) < 18 &&
          state.flagVy >= 0
        ) {
          state.flagY = plat.y - plat.h * 0.5 - 12;
          state.flagVy = 0;
          state.flagVx *= 0.8;
        }
      }
      if (state.flagY > ARENA_HEIGHT + 80) {
        const origFlag = state.map.objectives.find((o) => o.type === 'ctf_flag');
        state.flagX = origFlag?.x ?? ARENA_WIDTH / 2;
        state.flagY = origFlag?.y ?? 360;
        state.flagVx = 0;
        state.flagVy = 0;
      }
      for (const p of state.players) {
        if (!p.alive || p.invulnTimer > 0.8) continue;
        if (Math.hypot(p.x - state.flagX, p.y - state.flagY) <= p.radius + 22) {
          p.hasFlag = true;
          state.flagCarrierId = p.id;
          spawnShockwave(state, state.flagX, state.flagY, p.loadout.color, 65);
          break;
        }
      }
    }
  }

  // Check KO / Out-of-Bounds / Survival Zone
  const margin = 95;
  for (const p of state.players) {
    if (!p.alive) continue;
    const outOfArena =
      p.x < -margin ||
      p.x > ARENA_WIDTH + margin ||
      p.y < -margin - 90 ||
      p.y > ARENA_HEIGHT + margin;
    const outOfSurvival =
      state.config.mode === 'survival' &&
      (Math.hypot(p.x - ARENA_WIDTH / 2, p.y - ARENA_HEIGHT / 2) > state.survivalRadius ||
        p.y > state.hazardRiseY);

    if (outOfArena || outOfSurvival) {
      p.alive = false;
      p.deaths += 1;
      p.stocks = Math.max(0, p.stocks - 1);
      p.respawnTimer = 1.45;
      p.bounceChain = 0;
      if (p.hasFlag) {
        p.hasFlag = false;
        state.flagCarrierId = null;
        const origFlag = state.map.objectives.find((o) => o.type === 'ctf_flag');
        state.flagX = origFlag?.x ?? ARENA_WIDTH / 2;
        state.flagY = origFlag?.y ?? 360;
      }
      if (p.lastHitBy && p.lastHitBy !== p.id) {
        const killer = state.players.find((k) => k.id === p.lastHitBy);
        if (killer) {
          killer.knockouts += 1;
          killer.calloutText = killer.knockouts >= 2 ? 'MULTI-KO!' : 'BONK!';
          killer.calloutTimer = 1.5;
        }
      }
      events.koEvents.push({ victimId: p.id, killerId: p.lastHitBy });
      state.trauma = Math.min(1, state.trauma + 0.52);
      state.hitstopTimer = Math.max(state.hitstopTimer, 0.05);
      const clampX = Math.max(24, Math.min(ARENA_WIDTH - 24, p.x));
      const clampY = Math.max(24, Math.min(ARENA_HEIGHT - 24, p.y));
      spawnShockwave(state, clampX, clampY, p.loadout.color, 98);
      spawnBurst(
        state,
        clampX,
        clampY,
        p.loadout.color,
        20,
        360,
        p.loadout.deathFx === 'pixel' ? 'square' : 'circle'
      );
    }
  }

  // Evaluate victory / match end conditions
  if (!state.finished) {
    const aliveOrWithStocks = state.players.filter((p) => p.stocks > 0 || p.alive);
    if (
      (state.config.mode === 'classic' ||
        state.config.mode === 'survival' ||
        state.config.mode === 'arcade') &&
      aliveOrWithStocks.length <= 1 &&
      state.players.length > 1
    ) {
      const winner = aliveOrWithStocks[0] ?? state.players[0];
      state.finished = true;
      state.winnerId = winner.id;
      state.winnerName = winner.name;
      state.winReason = state.config.mode === 'survival' ? 'Last Circle Standing' : 'Knockout Victory';
    } else if (state.timeRemaining <= 0) {
      const sorted = [...state.players].sort((a, b) => {
        if (state.config.mode === 'koth' || state.config.mode === 'ctf') {
          if (b.objectiveScore !== a.objectiveScore) return b.objectiveScore - a.objectiveScore;
        }
        if (b.stocks !== a.stocks) return b.stocks - a.stocks;
        return b.knockouts - a.knockouts;
      });
      const winner = sorted[0];
      state.finished = true;
      state.winnerId = winner.id;
      state.winnerName = winner.name;
      state.winReason = 'Time Expired';
    }
  }

  return events;
}

function solveCircleOBB(
  p: PlayerState,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  angle: number
): { nx: number; ny: number; penetration: number } | null {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const dx = p.x - rx;
  const dy = p.y - ry;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const halfW = rw * 0.5;
  const halfH = rh * 0.5;
  const closestX = Math.max(-halfW, Math.min(halfW, localX));
  const closestY = Math.max(-halfH, Math.min(halfH, localY));

  const distX = localX - closestX;
  const distY = localY - closestY;
  const distSq = distX * distX + distY * distY;

  if (distSq >= p.radius * p.radius) return null;

  let lnx = 0;
  let lny = -1;
  let penetration = 0;

  if (distSq > 0.0001) {
    const dist = Math.sqrt(distSq);
    lnx = distX / dist;
    lny = distY / dist;
    penetration = p.radius - dist;
  } else {
    const penLeft = localX + halfW;
    const penRight = halfW - localX;
    const penTop = localY + halfH;
    const penBot = halfH - localY;
    const minPen = Math.min(penLeft, penRight, penTop, penBot);
    if (minPen === penTop) {
      lnx = 0;
      lny = -1;
      penetration = penTop + p.radius;
    } else if (minPen === penBot) {
      lnx = 0;
      lny = 1;
      penetration = penBot + p.radius;
    } else if (minPen === penLeft) {
      lnx = -1;
      lny = 0;
      penetration = penLeft + p.radius;
    } else {
      lnx = 1;
      lny = 0;
      penetration = penRight + p.radius;
    }
  }

  const wCos = Math.cos(angle);
  const wSin = Math.sin(angle);
  return {
    nx: lnx * wCos - lny * wSin,
    ny: lnx * wSin + lny * wCos,
    penetration,
  };
}

export function computeRankTier(mmr: number): RankTier {
  if (mmr >= 2100) return 'Grand Knob';
  if (mmr >= 1750) return 'Diamond';
  if (mmr >= 1450) return 'Platinum';
  if (mmr >= 1200) return 'Gold';
  if (mmr >= 950) return 'Silver';
  return 'Bronze';
}

export function updateMmr(currentMmr: number, won: boolean, knockouts: number): number {
  const delta = won ? 26 + Math.min(12, knockouts * 3) : -18 + Math.min(8, knockouts * 2);
  return Math.max(600, currentMmr + delta);
}

const BLOCKED_WORDS = ['badword', 'toxic', 'noobtrash', 'cheat', 'hack', 'slur'];

export function filterProfanity(text: string): { clean: string; flagged: boolean } {
  let flagged = false;
  let clean = text.trim().slice(0, 140);
  for (const word of BLOCKED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(clean)) {
      flagged = true;
      clean = clean.replace(regex, '***');
    }
  }
  return { clean, flagged };
}
