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
    const initialKnobAngle = Math.atan2(ARENA_HEIGHT * 0.5 - spawn.y, ARENA_WIDTH * 0.5 - spawn.x);
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
      knobAngle: Number.isFinite(initialKnobAngle) ? initialKnobAngle : 0,
      knobAngVel: 0,
      knobManualTimer: 0,
      knobFlashTimer: 0,
      isHeavy: false,
      grounded: false,
      onStickyWall: false,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      prevJumpHeld: false,
      airJumpsRemaining: cvars.sv_air_jumps,
      maxAirJumps: cvars.sv_air_jumps,
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
      bounceGraceTimer: 0,
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
  p.mass = 1.0;
  p.knobAngle = Math.atan2(ARENA_HEIGHT * 0.5 - p.y, ARENA_WIDTH * 0.5 - p.x);
  p.knobAngVel = 0;
  p.knobManualTimer = 0;
  p.knobFlashTimer = 0;
  p.alive = true;
  p.invulnTimer = 1.6;
  p.lastHitBy = null;
  p.lastHitTimer = 0;
  p.trail = [];
  p.squashX = 0.8;
  p.squashY = 1.25;
  p.airJumpsRemaining = p.maxAirJumps;
  p.bounceChain = 0;
  p.bounceGraceTimer = 0;
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

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function computeEffectiveMass(p: PlayerState, cv: PhysicsCVars): number {
  const heavyBase = p.isHeavy ? cv.sv_heavy_mass_mult : 1.0;
  const chainStacks = Math.min(8, Math.max(0, p.bounceChain));
  const bounceWeightMult = 1 + chainStacks * cv.sv_bounce_weight_gain;
  return Number((heavyBase * bounceWeightMult).toFixed(3));
}

// Stage 1: Process Player Input (heavy state, bounce weight, knob rotation/aim, jump buffering, coyote time, emotes)
export function processPlayerInput(
  state: MatchState,
  dt: number,
  inputs: Record<string, PlayerInput>,
  events: StepEvents
): void {
  const cv = state.cvars;
  const jumpBufferSec = Math.max(0, cv.sv_jump_buffer / 1000);
  const coyoteSec = Math.max(0, cv.sv_coyote_time / 1000);

  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];

    p.squashX += (1 - p.squashX) * Math.min(1, dt * 14);
    p.squashY += (1 - p.squashY) * Math.min(1, dt * 14);

    if (p.hitFlashTimer > 0) p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);
    if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    if (p.activeBoostFlash > 0) p.activeBoostFlash = Math.max(0, p.activeBoostFlash - dt);
    if (p.bounceGraceTimer > 0) p.bounceGraceTimer = Math.max(0, p.bounceGraceTimer - dt);
    if (p.knobManualTimer > 0) p.knobManualTimer = Math.max(0, p.knobManualTimer - dt);
    if (p.knobFlashTimer > 0) p.knobFlashTimer = Math.max(0, p.knobFlashTimer - dt);
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

    // Heavy toggle (+50% base mass by default) stacked with gained bounce-chain weight
    p.isHeavy = inp.heavy;
    p.mass = computeEffectiveMass(p, cv);

    // Directional Knob rotation: independent manual spin / pointer aim OR smooth velocity alignment
    const spinDir = (inp.spinRight ? 1 : 0) - (inp.spinLeft ? 1 : 0);
    if (spinDir !== 0) {
      p.knobAngVel = spinDir * cv.sv_knob_spin_speed * (p.isHeavy ? 0.78 : 1.0);
      p.knobManualTimer = 0.6;
    } else if (inp.aimAngle !== undefined && inp.aimAngle !== null && Number.isFinite(inp.aimAngle)) {
      const diff = normalizeAngle(inp.aimAngle - p.knobAngle);
      const maxTurn = cv.sv_knob_spin_speed * 1.4;
      p.knobAngVel = Math.max(-maxTurn, Math.min(maxTurn, diff * 14));
      p.knobManualTimer = 0.55;
    } else if (p.knobManualTimer <= 0) {
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 38) {
        const targetAngle = Math.atan2(p.vy, p.vx);
        const diff = normalizeAngle(targetAngle - p.knobAngle);
        p.knobAngVel = Math.max(-9.0, Math.min(9.0, diff * 10.5));
      } else {
        p.knobAngVel *= Math.max(0, 1 - dt * 12);
      }
    } else {
      p.knobAngVel *= Math.max(0, 1 - dt * 9);
    }

    // Edge-triggered jump buffering + coyote window + air jump refresh on support
    const jumpJustPressed = inp.up && !p.prevJumpHeld;
    p.prevJumpHeld = inp.up;

    if (jumpJustPressed) {
      p.jumpBufferTimer = jumpBufferSec;
    } else {
      p.jumpBufferTimer = Math.max(0, p.jumpBufferTimer - dt);
    }

    if (p.grounded || p.onStickyWall) {
      p.coyoteTimer = coyoteSec;
      p.airJumpsRemaining = p.maxAirJumps;
    } else {
      p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);
    }
  }
}

// Stage 2: Apply Forces and Acceleration (directional accel, bounce momentum scaling, zones, variable gravity, jumps, drag)
export function applyForcesAndAcceleration(
  state: MatchState,
  dt: number,
  inputs: Record<string, PlayerInput>,
  events: StepEvents
): void {
  const cv = state.cvars;
  const hyperBounce = state.config.arcadeModifier === 'hyper_bounce';

  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    if (!p.alive) continue;

    const inp = inputs[p.id] ?? {
      left: false,
      right: false,
      up: false,
      down: false,
      heavy: false,
      emote: false,
    };

    const dirX = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const surfProps = getMaterialProps(p.lastSurfaceMaterial, cv.sv_bounce, hyperBounce);

    // Bounce-chain acceleration compounding: consecutive bounces sharpen acceleration and raise speed cap
    const chainStacks = Math.min(8, Math.max(0, p.bounceChain));
    const chainAccelBonus = 1 + chainStacks * cv.sv_bounce_accel_gain;
    const effectiveMaxSpeed = cv.sv_max_speed * (1 + chainStacks * cv.sv_bounce_accel_gain * 0.75);

    const moveAccel =
      (p.grounded
        ? cv.sv_horizontal_accel * surfProps.accelScale
        : cv.sv_horizontal_accel * cv.sv_air_control) * chainAccelBonus;
    const heavyMoveScale = p.isHeavy ? cv.sv_heavy_accel_mult : 1.0;

    if (dirX !== 0) {
      const sameDir = dirX * p.vx > 0;
      if (!sameDir || Math.abs(p.vx) < effectiveMaxSpeed) {
        p.vx += dirX * moveAccel * heavyMoveScale * dt;
        if (sameDir && Math.abs(p.vx) > effectiveMaxSpeed) {
          p.vx = dirX * effectiveMaxSpeed;
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

    // Variable gravity multipliers (ascent, early release, fall, fast-fall, air gravity mult, heavy/bounce weight pull)
    let stateGravMult = 1.0;
    if (inp.down && !p.grounded) {
      stateGravMult = cv.sv_fastfall_multiplier;
    } else if (p.vy < 0) {
      stateGravMult = inp.up ? 1.0 : cv.sv_early_release_gravity;
    } else {
      stateGravMult = cv.sv_fall_gravity;
    }

    const airGravityScale = p.grounded ? 1.0 : cv.sv_air_gravity_mult;
    const heavyGrav = p.isHeavy ? 1.12 : 1.0;
    // Slight gravity pull per bounce weight stack so heavier bounces dive harder into the next rebound
    const bounceWeightPull = 1 + chainStacks * 0.035;
    const effectiveGravity =
      cv.sv_gravity * localGravityScale * stateGravMult * airGravityScale * heavyGrav * bounceWeightPull;
    p.vy += effectiveGravity * dt;

    // Ground / Coyote / Sticky Wall Jump (preserves horizontal momentum & keeps airJumpsRemaining ready)
    if (p.jumpBufferTimer > 0 && p.coyoteTimer > 0) {
      const jumpSpeed = cv.sv_jump_impulse * (p.isHeavy ? 0.82 : 1.0);
      p.vy = Math.min(p.vy, 0) - jumpSpeed;
      if (p.vy < -jumpSpeed * 1.35) p.vy = -jumpSpeed * 1.35;

      if (p.onStickyWall && !p.grounded) {
        p.vx += dirX !== 0 ? dirX * 180 : p.x < ARENA_WIDTH / 2 ? 240 : -240;
      }
      p.grounded = false;
      p.onStickyWall = false;
      p.coyoteTimer = 0;
      p.jumpBufferTimer = 0;
      p.airJumpsRemaining = p.maxAirJumps;
      p.squashX = 0.82;
      p.squashY = 1.22;
      events.jumps++;
      spawnBurst(state, p.x, p.y + p.radius, p.loadout.color, 5, 110);
    } else if (p.jumpBufferTimer > 0 && p.airJumpsRemaining > 0 && !p.grounded && !p.onStickyWall) {
      // Double Jump: available once in air after first jump (refreshes on landing or bouncing off a platform)
      const doubleJumpImpulse = cv.sv_jump_impulse * 0.92 * (p.isHeavy ? 0.8 : 1.0);
      if (p.vy > 0) {
        p.vy = -doubleJumpImpulse;
      } else {
        p.vy = Math.max(-doubleJumpImpulse * 1.45, Math.min(p.vy - doubleJumpImpulse * 0.55, -doubleJumpImpulse));
      }
      if (dirX !== 0) {
        p.vx += dirX * 48 * heavyMoveScale * chainAccelBonus;
      }
      p.airJumpsRemaining -= 1;
      p.jumpBufferTimer = 0;
      p.squashX = 0.84;
      p.squashY = 1.2;
      events.jumps++;
      spawnShockwave(state, p.x, p.y + p.radius * 0.65, '#38bdf8', 46);
      spawnBurst(state, p.x, p.y + p.radius * 0.7, '#bae6fd', 6, 135, 'spark');
    }

    // Air friction, coasting surface friction, and global linear damping
    if (!p.grounded) {
      p.vx *= Math.max(0, 1 - cv.sv_air_friction * dt);
    } else if (dirX === 0) {
      const coastScale = p.lastSurfaceMaterial === 'ice' ? 0.025 : surfProps.friction * 0.45;
      p.vx *= Math.max(0, 1 - cv.sv_ground_friction * coastScale * dt);
    }

    const linDamp = Math.max(0, 1 - cv.sv_linear_damping * dt);
    p.vx *= linDamp;
    p.vy *= linDamp;

    const maxFall = cv.sv_max_fall_speed * (p.isHeavy ? 1.15 : 1.0) * (1 + chainStacks * 0.04);
    const maxSpeedCeil = Math.max(effectiveMaxSpeed * 2.1, 880);
    p.vy = Math.max(-960, Math.min(maxFall, p.vy));
    p.vx = Math.max(-maxSpeedCeil, Math.min(maxSpeedCeil, p.vx));
  }
}

// Stage 3: Integrate Velocities and Positions (world kinematics + player displacement)
export function integrateVelocitiesAndPositions(
  state: MatchState,
  dt: number,
  events: StepEvents
): void {
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

  for (const z of state.zones) {
    if (z.pulseTimer > 0) {
      z.pulseTimer = Math.max(0, z.pulseTimer - dt);
    }
  }

  if (state.config.advancedPhysics) {
    for (const joint of state.joints) {
      joint.angle += joint.angularSpeed * dt;
    }
  }

  for (const b of state.bumpers) {
    if (b.triggerTimer > 0) b.triggerTimer = Math.max(0, b.triggerTimer - dt);
    if (b.chainFlash > 0) b.chainFlash = Math.max(0, b.chainFlash - dt);
  }

  if (state.config.mode === 'survival') {
    state.survivalRadius = Math.max(195, 680 - state.timeElapsed * 7.2);
    state.hazardRiseY = Math.max(480, ARENA_HEIGHT + 35 - state.timeElapsed * 4.5);
  }

  for (const p of state.players) {
    if (!p.alive) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += (p.vx / p.radius) * dt * 0.55;
    p.knobAngle = normalizeAngle(p.knobAngle + p.knobAngVel * dt);

    p.trail.unshift({ x: p.x, y: p.y, age: 0, heavy: p.isHeavy });
    if (p.trail.length > 16) p.trail.pop();
    for (const tp of p.trail) tp.age += dt;

    p.grounded = false;
    p.onStickyWall = false;
  }
}

// Stage 4: Resolve World and Player Collisions (platforms, bounce chains & weight gain, joints, bumpers, player-vs-player)
export function resolveWorldAndPlayerCollisions(
  state: MatchState,
  dt: number,
  inputs: Record<string, PlayerInput>,
  events: StepEvents
): void {
  const cv = state.cvars;
  const heavyClashBoost = state.config.arcadeModifier === 'heavy_clash' ? 1.45 : 1.0;
  const hyperBounce = state.config.arcadeModifier === 'hyper_bounce';

  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    if (!p.alive) continue;

    const inp = inputs[p.id] ?? {
      left: false,
      right: false,
      up: false,
      down: false,
      heavy: false,
      emote: false,
    };
    const dirX = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);

    for (const plat of state.platforms) {
      if (!plat.currentActive) continue;
      const hit = solveCircleOBB(p, plat.x, plat.y, plat.w, plat.h, plat.angle);
      if (!hit) continue;

      const matProps = getMaterialProps(plat.material, cv.sv_bounce, hyperBounce, {
        bounciness: plat.bounciness,
        friction: plat.friction,
      });

      const relVx = p.vx - plat.vx;
      const relVy = p.vy - plat.vy;
      const impactSpeed = -(relVx * hit.nx + relVy * hit.ny);

      p.x += hit.nx * hit.penetration;
      p.y += hit.ny * hit.penetration;

      const isTopSupport = hit.ny < -0.52;
      if (isTopSupport) {
        p.lastSurfaceMaterial = plat.material;
        p.airJumpsRemaining = p.maxAirJumps;
        if (impactSpeed > 180) {
          p.squashX = 1.22;
          p.squashY = 0.78;
        }
        if (plat.vx !== 0 || plat.vy !== 0) {
          p.x += plat.vx * dt;
          p.y += plat.vy * dt;
        }
      } else if (plat.material === 'sticky' && Math.abs(hit.nx) > 0.65) {
        p.onStickyWall = true;
        p.airJumpsRemaining = p.maxAirJumps;
        p.lastSurfaceMaterial = 'sticky';
        p.vy *= 0.65;
      }

      if (plat.material === 'soft' && hit.ny < -0.4 && impactSpeed > 30) {
        plat.softDeflection = Math.min(26, plat.softDeflection + impactSpeed * 0.032 * p.mass);
        plat.softVelocity += impactSpeed * 0.14;
      }

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
          // Active Bounce Boost: v_new = e * |v_impact| + J, plus bounce weight/accel compounding
          const boostJ = cv.sv_jump_impulse * 0.68 * (p.isHeavy ? 0.7 : 1.0);
          const reboundSpeed = Math.max(rest * impactSpeed + boostJ, matProps.minBounceVy);
          p.vx += hit.nx * (impactSpeed + reboundSpeed);
          p.vy += hit.ny * (impactSpeed + reboundSpeed);

          if (isTopSupport && plat.vx !== 0) {
            p.vx += plat.vx * 0.55;
          }
          if (dirX !== 0) {
            p.vx += dirX * (45 + p.bounceChain * 18) * (p.isHeavy ? cv.sv_heavy_accel_mult : 1.0);
          }

          p.grounded = false;
          p.coyoteTimer = 0;
          p.jumpBufferTimer = 0;
          p.bounceChain = Math.min(8, p.bounceChain + 1);
          p.bounceGraceTimer = 0.22;
          p.mass = computeEffectiveMass(p, cv);
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
            p.bounceChain = Math.min(8, p.bounceChain + 1);
            p.bounceGraceTimer = 0.22;
            p.mass = computeEffectiveMass(p, cv);
            if (dirX !== 0) {
              p.vx += dirX * (28 + p.bounceChain * 12) * (p.isHeavy ? cv.sv_heavy_accel_mult : 1.0);
            }
            p.squashX = 0.76;
            p.squashY = 1.28;
            const burstColor = plat.material === 'super_bounce' ? '#c084fc' : '#fb923c';
            spawnBurst(state, p.x, p.y + p.radius, burstColor, 7, 160);
          } else if (reboundSpeed > settleThreshold && hit.ny < -0.35) {
            p.grounded = false;
            // Gain bounce weight & slingshot acceleration on genuine fast-fall / kinetic rebounds
            if (inp.down || impactSpeed > settleThreshold * 1.45) {
              p.bounceChain = Math.min(8, p.bounceChain + 1);
              p.bounceGraceTimer = 0.22;
              p.mass = computeEffectiveMass(p, cv);
              if (dirX !== 0) {
                p.vx += dirX * (24 + p.bounceChain * 10) * (p.isHeavy ? cv.sv_heavy_accel_mult : 1.0);
              }
            }
            p.squashX = 1.15;
            p.squashY = 0.85;
            events.collisions.push({ intensity: impactSpeed, heavy: p.isHeavy });
          } else if (isTopSupport) {
            p.grounded = true;
            if (p.bounceGraceTimer <= 0) {
              p.bounceChain = 0;
              p.mass = computeEffectiveMass(p, cv);
            }
          }
        } else {
          p.vx += hit.nx * impactSpeed;
          p.vy += hit.ny * impactSpeed;
          if (isTopSupport) {
            p.grounded = true;
            if (p.bounceGraceTimer <= 0) {
              p.bounceChain = 0;
              p.mass = computeEffectiveMass(p, cv);
            }
            if (plat.vx !== 0 && dirX === 0) {
              p.vx += (plat.vx - p.vx) * Math.min(1, dt * 12);
            }
          }
        }
      } else if (isTopSupport) {
        p.grounded = true;
        if (p.bounceGraceTimer <= 0) {
          p.bounceChain = 0;
          p.mass = computeEffectiveMass(p, cv);
        }
      }

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
          p.airJumpsRemaining = p.maxAirJumps;
          p.bounceChain = Math.min(8, p.bounceChain + 1);
          p.bounceGraceTimer = 0.22;
          p.mass = computeEffectiveMass(p, cv);
          b.triggerTimer = b.cooldown;
          b.chainFlash = 0.25;
          p.hitFlashTimer = 0.06;
          events.collisions.push({ intensity: launch, heavy: true });
          spawnShockwave(state, b.x, b.y, b.explosive ? '#fb7185' : '#fbbf24', b.explosive ? 130 : 65);
          spawnBurst(state, b.x, b.y, b.explosive ? '#fb7185' : '#fbbf24', 12, 290);

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

  // Directional Knob + Circle-vs-Circle Collisions (one-way knob strikes, spin hits, parries, non-knob hits)
  interface SubSphere {
    x: number;
    y: number;
    rx: number;
    ry: number;
    r: number;
  }
  const getKnobSpheres = (pl: PlayerState): [SubSphere, SubSphere] => {
    const len = Math.max(0.25, cv.sv_knob_length);
    const kx = Math.cos(pl.knobAngle);
    const ky = Math.sin(pl.knobAngle);
    const stemOff = pl.radius * (0.86 * len);
    const tipOff = pl.radius * (1.0 + 0.72 * len);
    return [
      { x: pl.x + kx * stemOff, y: pl.y + ky * stemOff, rx: kx * stemOff, ry: ky * stemOff, r: pl.radius * 0.28 },
      { x: pl.x + kx * tipOff, y: pl.y + ky * tipOff, rx: kx * tipOff, ry: ky * tipOff, r: pl.radius * 0.3 },
    ];
  };

  interface ContactHit {
    nx: number;
    ny: number;
    overlap: number;
    rxA: number;
    ryA: number;
    rxB: number;
    ryB: number;
    cx: number;
    cy: number;
  }
  const testSpherePair = (
    ax: number,
    ay: number,
    arx: number,
    ary: number,
    ar: number,
    bx: number,
    by: number,
    brx: number,
    bry: number,
    br: number
  ): ContactHit | null => {
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);
    const minDist = ar + br;
    if (dist >= minDist || dist === 0) return null;
    const nx = dx / dist;
    const ny = dy / dist;
    return {
      nx,
      ny,
      overlap: minDist - dist,
      rxA: arx,
      ryA: ary,
      rxB: brx,
      ryB: bry,
      cx: ax + nx * ar,
      cy: ay + ny * ar,
    };
  };

  for (let i = 0; i < state.players.length; i++) {
    const a = state.players[i];
    if (!a.alive) continue;
    const aKnobs = getKnobSpheres(a);

    for (let j = i + 1; j < state.players.length; j++) {
      const b = state.players[j];
      if (!b.alive) continue;
      const sameTeam = a.team !== 0 && a.team === b.team;
      const bKnobs = getKnobSpheres(b);

      // Evaluate Knob-vs-Knob, A.Knob-vs-B.Body, B.Knob-vs-A.Body, and Body-vs-Body
      let bestKnobKnob: ContactHit | null = null;
      for (const ak of aKnobs) {
        for (const bk of bKnobs) {
          const hit = testSpherePair(ak.x, ak.y, ak.rx, ak.ry, ak.r, bk.x, bk.y, bk.rx, bk.ry, bk.r);
          if (hit && (!bestKnobKnob || hit.overlap > bestKnobKnob.overlap)) bestKnobKnob = hit;
        }
      }

      let bestAKnobB: ContactHit | null = null;
      for (const ak of aKnobs) {
        const hit = testSpherePair(ak.x, ak.y, ak.rx, ak.ry, ak.r, b.x, b.y, 0, 0, b.radius);
        if (hit && (!bestAKnobB || hit.overlap > bestAKnobB.overlap)) bestAKnobB = hit;
      }

      let bestBKnobA: ContactHit | null = null;
      for (const bk of bKnobs) {
        const hit = testSpherePair(a.x, a.y, 0, 0, a.radius, bk.x, bk.y, bk.rx, bk.ry, bk.r);
        if (hit && (!bestBKnobA || hit.overlap > bestBKnobA.overlap)) bestBKnobA = hit;
      }

      const bodyHit = testSpherePair(a.x, a.y, 0, 0, a.radius, b.x, b.y, 0, 0, b.radius);

      let kind: 'knob_knob' | 'a_knob_b_body' | 'b_knob_a_body' | 'body_body' | null = null;
      let chosen: ContactHit | null = null;
      if (bestKnobKnob) {
        kind = 'knob_knob';
        chosen = bestKnobKnob;
      } else if (bestAKnobB && (!bestBKnobA || bestAKnobB.overlap >= bestBKnobA.overlap)) {
        kind = 'a_knob_b_body';
        chosen = bestAKnobB;
      } else if (bestBKnobA) {
        kind = 'b_knob_a_body';
        chosen = bestBKnobA;
      } else if (bodyHit) {
        kind = 'body_body';
        chosen = bodyHit;
      }

      if (!chosen || !kind) continue;

      const { nx, ny, overlap, rxA, ryA, rxB, ryB, cx, cy } = chosen;
      const totalMass = a.mass + b.mass;

      a.x -= nx * overlap * (b.mass / totalMass);
      a.y -= ny * overlap * (b.mass / totalMass);
      b.x += nx * overlap * (a.mass / totalMass);
      b.y += ny * overlap * (a.mass / totalMass);

      // Include rotational knob tip tangential velocity (v_tip = v + ω × r) for spin-and-hit mechanics
      const vAx = a.vx - (kind === 'a_knob_b_body' || kind === 'knob_knob' ? a.knobAngVel * ryA : 0);
      const vAy = a.vy + (kind === 'a_knob_b_body' || kind === 'knob_knob' ? a.knobAngVel * rxA : 0);
      const vBx = b.vx - (kind === 'b_knob_a_body' || kind === 'knob_knob' ? b.knobAngVel * ryB : 0);
      const vBy = b.vy + (kind === 'b_knob_a_body' || kind === 'knob_knob' ? b.knobAngVel * rxB : 0);

      const rvx = vBx - vAx;
      const rvy = vBy - vAy;
      const velAlongNormal = rvx * nx + rvy * ny;
      if (velAlongNormal > 0) continue;

      const baseRest = sameTeam ? 0.45 : a.isHeavy || b.isHeavy ? 1.12 : 0.96;
      const isOneWayKnob = !sameTeam && (kind === 'a_knob_b_body' || kind === 'b_knob_a_body');
      const isParry = !sameTeam && kind === 'knob_knob';
      const restitution =
        baseRest *
        heavyClashBoost *
        (isOneWayKnob ? cv.sv_knob_hit_mult : isParry ? 1.22 : 1.0);

      const jImpulse = (-(1 + restitution) * velAlongNormal) / (1 / a.mass + 1 / b.mass);
      const ix = jImpulse * nx;
      const iy = jImpulse * ny;

      if (kind === 'a_knob_b_body' && !sameTeam) {
        // One-way directional knob advantage: striker A absorbs less recoil, exposed non-knob B takes full strike
        a.vx -= (0.55 * ix) / a.mass;
        a.vy -= (0.55 * iy) / a.mass;
        b.vx += (1.18 * ix) / b.mass;
        b.vy += (1.18 * iy) / b.mass;
        if (Math.abs(a.knobAngVel) > 2.0) {
          const spinKick = Math.min(140, Math.abs(a.knobAngVel) * 10);
          b.vx += (nx * spinKick) / b.mass;
          b.vy += (ny * spinKick) / b.mass;
        }
        a.knobFlashTimer = 0.24;
      } else if (kind === 'b_knob_a_body' && !sameTeam) {
        // One-way directional knob advantage for B hitting A's non-knob side
        a.vx -= (1.18 * ix) / a.mass;
        a.vy -= (1.18 * iy) / a.mass;
        b.vx += (0.55 * ix) / b.mass;
        b.vy += (0.55 * iy) / b.mass;
        if (Math.abs(b.knobAngVel) > 2.0) {
          const spinKick = Math.min(140, Math.abs(b.knobAngVel) * 10);
          a.vx -= (nx * spinKick) / a.mass;
          a.vy -= (ny * spinKick) / a.mass;
        }
        b.knobFlashTimer = 0.24;
      } else {
        a.vx -= ix / a.mass;
        a.vy -= iy / a.mass;
        b.vx += ix / b.mass;
        b.vy += iy / b.mass;
        if (isParry) {
          a.knobFlashTimer = 0.25;
          b.knobFlashTimer = 0.25;
          a.knobAngVel *= -0.45;
          b.knobAngVel *= -0.45;
        }
      }

      const impactIntensity = Math.abs(velAlongNormal);
      if (!sameTeam && impactIntensity > 105) {
        a.lastHitBy = b.id;
        a.lastHitTimer = 4.0;
        b.lastHitBy = a.id;
        b.lastHitTimer = 4.0;

        const aBonus = kind === 'a_knob_b_body' ? 1.35 : 1.0;
        const bBonus = kind === 'b_knob_a_body' ? 1.35 : 1.0;
        a.damageDealt += Math.round(impactIntensity * 0.08 * a.mass * aBonus);
        b.damageDealt += Math.round(impactIntensity * 0.08 * b.mass * bBonus);

        const isBigHit =
          isParry ||
          (isOneWayKnob && impactIntensity > 165) ||
          impactIntensity > 260 ||
          (a.isHeavy !== b.isHeavy && impactIntensity > 175);
        events.collisions.push({ intensity: impactIntensity, heavy: isBigHit });

        if (isBigHit) {
          a.hitFlashTimer = 0.055;
          b.hitFlashTimer = 0.055;
          state.hitstopTimer = Math.max(state.hitstopTimer, isParry ? 0.048 : 0.04);
          state.trauma = Math.min(1, state.trauma + (isParry ? 0.42 : 0.34));
          spawnShockwave(state, cx, cy, isParry ? '#38bdf8' : '#ffffff', isParry ? 76 : 64);
          spawnBurst(state, cx, cy, isParry ? '#7dd3fc' : '#fbbf24', 14, 300, 'spark');

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
}

// Stage 5: Update Objectives, Elimination KOs, and Match Victory State
export function updateObjectivesAndMatchState(
  state: MatchState,
  dt: number,
  events: StepEvents
): void {
  const cv = state.cvars;

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
      p.bounceGraceTimer = 0;
      p.mass = 1.0;
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
  state.trauma = Math.max(0, state.trauma - dt * 1.9);

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

  processPlayerInput(state, dt, inputs, events);
  applyForcesAndAcceleration(state, dt, inputs, events);
  integrateVelocitiesAndPositions(state, dt, events);
  resolveWorldAndPlayerCollisions(state, dt, inputs, events);
  updateObjectivesAndMatchState(state, dt, events);

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
