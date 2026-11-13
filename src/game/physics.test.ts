import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRankTier,
  createMatchState,
  filterProfanity,
  FIXED_PHYSICS_DT,
  stepMatch,
  stepMatchFixed,
  updateMmr,
} from './physics';
import { BUILTIN_MAPS, generateProceduralMap } from './maps';
import { computeAiInput } from './ai';
import { ArenaMap, CosmeticLoadout, MatchConfig, PlayerInput } from './types';

const DEFAULT_LOADOUT: CosmeticLoadout = {
  color: '#F59E0B',
  skin: 'ring',
  trail: 'ribbon',
  impactFx: 'shockwave',
  deathFx: 'pixel',
  emote: 'BONK!',
};

const EMPTY_INPUT: PlayerInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  heavy: false,
  emote: false,
};

function makeTestMap(overrides: Partial<ArenaMap> = {}): ArenaMap {
  return {
    id: 'test-map',
    name: 'Test Arena',
    author: 'Tester',
    version: '1.0.0',
    changelog: 'init',
    pool: 'casual',
    supportedModes: ['classic', 'koth', 'survival', 'ctf', 'arcade'],
    recommendedMode: 'classic',
    advancedPhysics: false,
    bounds: { width: 1280, height: 720 },
    bgStyle: 'slate_grid',
    platforms: [
      { id: 'floor', x: 640, y: 500, w: 600, h: 30, angle: 0, material: 'standard', active: true },
    ],
    zones: [],
    joints: [],
    bumpers: [],
    triggers: [],
    spawns: [
      { id: 's1', x: 540, y: 440, team: 1 },
      { id: 's2', x: 740, y: 440, team: 2 },
    ],
    objectives: [
      { type: 'koth_hill', x: 640, y: 440, radius: 90 },
      { type: 'ctf_flag', x: 640, y: 455, radius: 22 },
      { type: 'ctf_goal_a', x: 420, y: 455, radius: 40 },
      { type: 'ctf_goal_b', x: 860, y: 455, radius: 40 },
    ],
    ...overrides,
  };
}

const BASE_CONFIG: MatchConfig = {
  mode: 'classic',
  advancedPhysics: false,
  arcadeModifier: 'none',
  physicsPreset: 'map_default',
  ranked: false,
  stocks: 3,
  timeLimitSec: 120,
  region: 'NA-West',
};

test('coyote time allows jump shortly after walking off ledge', () => {
  const map = makeTestMap({
    platforms: [{ id: 'ledge', x: 500, y: 500, w: 120, h: 24, angle: 0, material: 'standard', active: true }],
  });
  const state = createMatchState(map, BASE_CONFIG, [
    { id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p2', name: 'P2', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  state.players[0].x = 578;
  state.players[0].vx = 220;
  state.players[0].y = 466;
  state.players[0].grounded = true;
  state.players[0].coyoteTimer = 0.1;

  // Walk past ledge (edge at 560 + radius 22 = 582) for 4 frames (0.064s < 0.10s coyote time)
  for (let i = 0; i < 4; i++) {
    stepMatch(state, 0.016, { p1: { ...EMPTY_INPUT, right: true }, p2: EMPTY_INPUT });
  }
  assert.equal(state.players[0].grounded, false);
  assert.ok(state.players[0].coyoteTimer > 0);

  // Now press jump while airborne inside coyote window
  const ev = stepMatch(state, 0.016, { p1: { ...EMPTY_INPUT, up: true }, p2: EMPTY_INPUT });
  assert.equal(ev.jumps, 1);
  assert.ok(state.players[0].vy < -250);
});

test('input buffering executes jump on first landing frame', () => {
  const map = makeTestMap();
  const state = createMatchState(map, BASE_CONFIG, [
    { id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p2', name: 'P2', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  // Position p1 just above floor falling downward with air jump already spent (testing landing input buffer)
  state.players[0].x = 540;
  state.players[0].y = 452;
  state.players[0].vy = 280;
  state.players[0].grounded = false;
  state.players[0].coyoteTimer = 0;
  state.players[0].airJumpsRemaining = 0;

  // Press jump slightly early (while airborne) -> buffers jump, then lands next frame
  stepMatch(state, 0.016, { p1: { ...EMPTY_INPUT, up: true }, p2: EMPTY_INPUT });
  let totalJumps = 0;
  for (let i = 0; i < 6; i++) {
    const ev = stepMatch(state, 0.016, { p1: EMPTY_INPUT, p2: EMPTY_INPUT });
    totalJumps += ev.jumps;
  }
  assert.equal(totalJumps, 1);
  assert.ok(state.players[0].vy < -250);
});

test('ice material glides significantly further than sticky material', () => {
  const runSlide = (material: 'ice' | 'sticky') => {
    const map = makeTestMap({
      platforms: [{ id: 'floor', x: 640, y: 500, w: 1100, h: 30, angle: 0, material, active: true }],
    });
    const state = createMatchState(map, BASE_CONFIG, [
      { id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
      { id: 'p2', name: 'P2', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
    ]);
    state.players[0].x = 300;
    state.players[0].y = 463;
    state.players[0].vx = 350;
    state.players[0].grounded = true;
    state.players[0].lastSurfaceMaterial = material;

    for (let i = 0; i < 30; i++) {
      stepMatch(state, 0.016, { p1: EMPTY_INPUT, p2: EMPTY_INPUT });
    }
    return state.players[0].vx;
  };

  const iceSpeed = runSlide('ice');
  const stickySpeed = runSlide('sticky');
  assert.ok(iceSpeed > 250, `Expected ice glide speed > 250, got ${iceSpeed}`);
  assert.ok(stickySpeed < 60, `Expected sticky stop speed < 60, got ${stickySpeed}`);
});

test('bouncy, conveyor, breakable, and soft platforms alter physics distinctly', () => {
  // Bouncy launch
  const bouncyMap = makeTestMap({
    platforms: [{ id: 'b', x: 540, y: 500, w: 300, h: 24, angle: 0, material: 'bouncy', bounciness: 1.5, active: true }],
  });
  const bState = createMatchState(bouncyMap, BASE_CONFIG, [
    { id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p2', name: 'P2', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  bState.players[0].x = 540;
  bState.players[0].y = 464;
  bState.players[0].vy = 220;
  stepMatch(bState, 0.016, { p1: EMPTY_INPUT, p2: EMPTY_INPUT });
  stepMatch(bState, 0.016, { p1: EMPTY_INPUT, p2: EMPTY_INPUT });
  assert.ok(bState.players[0].vy < -310);

  // Conveyor belt pushes resting circle
  const convMap = makeTestMap({
    platforms: [{ id: 'c', x: 540, y: 500, w: 400, h: 24, angle: 0, material: 'conveyor', conveyorSpeed: 240, active: true }],
  });
  const cState = createMatchState(convMap, BASE_CONFIG, [
    { id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p2', name: 'P2', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  cState.players[0].x = 540;
  cState.players[0].y = 466;
  cState.players[0].vy = 40;
  for (let i = 0; i < 15; i++) stepMatch(cState, 0.016, { p1: EMPTY_INPUT, p2: EMPTY_INPUT });
  assert.ok(cState.players[0].vx > 120);

  // Breakable platform shatters after heavy slam
  const brkMap = makeTestMap({
    platforms: [{ id: 'brk', x: 540, y: 500, w: 200, h: 24, angle: 0, material: 'breakable', breakableHp: 40, active: true }],
  });
  const brkState = createMatchState(brkMap, BASE_CONFIG, [
    { id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p2', name: 'P2', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  brkState.players[0].x = 540;
  brkState.players[0].y = 460;
  brkState.players[0].vy = 480;
  const ev = stepMatch(brkState, 0.016, { p1: { ...EMPTY_INPUT, heavy: true }, p2: EMPTY_INPUT });
  assert.equal(ev.shatters, 1);
  assert.equal(brkState.platforms[0].currentActive, false);

  // Soft platform deflects under weight
  const softMap = makeTestMap({
    platforms: [{ id: 's', x: 540, y: 500, w: 240, h: 24, angle: 0, material: 'soft', active: true }],
  });
  const sState = createMatchState(softMap, BASE_CONFIG, [
    { id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p2', name: 'P2', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  sState.players[0].x = 540;
  sState.players[0].y = 462;
  sState.players[0].vy = 260;
  stepMatch(sState, 0.016, { p1: EMPTY_INPUT, p2: EMPTY_INPUT });
  assert.ok(sState.platforms[0].softDeflection > 0);
});

test('visual script enter_zone trigger toggles target platform', () => {
  const map = makeTestMap({
    platforms: [
      { id: 'floor', x: 640, y: 500, w: 600, h: 30, angle: 0, material: 'standard', active: true },
      { id: 'gate', x: 640, y: 360, w: 180, h: 20, angle: 0, material: 'standard', active: true, tag: 'gate-1' },
    ],
    zones: [
      { id: 'switch-z', type: 'wind', x: 540, y: 450, w: 100, h: 100, fx: 0, fy: 0, strength: 1, active: true, tag: 'switch-1' },
    ],
    triggers: [
      {
        id: 't1',
        name: 'Toggle Gate',
        event: 'enter_zone',
        sourceTag: 'switch-1',
        action: 'toggle_platform',
        targetTag: 'gate-1',
        cooldownSec: 2,
      },
    ],
  });

  const state = createMatchState(map, BASE_CONFIG, [
    { id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p2', name: 'P2', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  state.players[0].x = 540;
  state.players[0].y = 450;

  const ev = stepMatch(state, 0.016, { p1: EMPTY_INPUT, p2: EMPTY_INPUT });
  assert.equal(ev.triggersFired, 1);
  assert.equal(state.platforms[1].currentActive, false);
});

test('KOTH win condition triggers at 100% objective control', () => {
  const map = makeTestMap();
  const state = createMatchState(
    map,
    { ...BASE_CONFIG, mode: 'koth' },
    [
      { id: 'p1', name: 'Alpha', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
      { id: 'p2', name: 'Beta', isHuman: false, aiPolicy: 'tactician', team: 0, loadout: DEFAULT_LOADOUT },
    ]
  );
  state.players[0].x = state.kothX;
  state.players[0].y = state.kothY;
  state.players[0].objectiveScore = 99.6;
  state.players[1].x = 100;
  state.players[1].y = 100;

  stepMatch(state, 0.05, { p1: EMPTY_INPUT, p2: EMPTY_INPUT });
  assert.equal(state.finished, true);
  assert.equal(state.winnerId, 'p1');
});

test('procedural map generator is deterministic and built-in maps are valid', () => {
  const a = generateProceduralMap('2026-11-12', 'daily', 'classic', true);
  const b = generateProceduralMap('2026-11-12', 'daily', 'classic', true);
  assert.deepEqual(a.platforms, b.platforms);
  assert.equal(BUILTIN_MAPS.length >= 6, true);
});

test('AI policies produce valid non-crashing inputs and profanity filter masks blocked terms', () => {
  const state = createMatchState(BUILTIN_MAPS[0], BASE_CONFIG, [
    { id: 'p1', name: 'B1', isHuman: false, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p2', name: 'A1', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p3', name: 'T1', isHuman: false, aiPolicy: 'tactician', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  const i1 = computeAiInput(state, state.players[0]);
  const i2 = computeAiInput(state, state.players[1]);
  const i3 = computeAiInput(state, state.players[2]);
  assert.equal(typeof i1.left, 'boolean');
  assert.equal(typeof i2.up, 'boolean');
  assert.equal(typeof i3.heavy, 'boolean');

  const mod = filterProfanity('you are toxic');
  assert.equal(mod.flagged, true);
  assert.equal(mod.clean, 'you are ***');
  assert.equal(computeRankTier(updateMmr(1440, true, 3)), 'Platinum');
});

test('variable gravity applies higher multiplier on early jump release and fast-fall, capped at sv_max_fall_speed', () => {
  const map = makeTestMap();
  const makeSolo = () =>
    createMatchState(map, BASE_CONFIG, [
      { id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    ]);

  // Early release vs held jump ascent
  const heldState = makeSolo();
  const earlyState = makeSolo();
  heldState.players[0].y = 260;
  heldState.players[0].vy = -420;
  heldState.players[0].prevJumpHeld = true;
  earlyState.players[0].y = 260;
  earlyState.players[0].vy = -420;
  earlyState.players[0].prevJumpHeld = true;

  for (let i = 0; i < 24; i++) {
    stepMatch(heldState, FIXED_PHYSICS_DT, { p1: { ...EMPTY_INPUT, up: true } });
    stepMatch(earlyState, FIXED_PHYSICS_DT, { p1: EMPTY_INPUT });
  }
  assert.ok(
    earlyState.players[0].vy > heldState.players[0].vy + 40,
    `Expected early release downward delta (${earlyState.players[0].vy}) > held (${heldState.players[0].vy})`
  );

  // Fast-fall accelerates faster and caps at sv_max_fall_speed
  const normalFall = makeSolo();
  const fastFall = makeSolo();
  normalFall.players[0].y = 120;
  fastFall.players[0].y = 120;
  for (let i = 0; i < 20; i++) {
    stepMatch(normalFall, FIXED_PHYSICS_DT, { p1: EMPTY_INPUT });
    stepMatch(fastFall, FIXED_PHYSICS_DT, { p1: { ...EMPTY_INPUT, down: true } });
  }
  assert.ok(fastFall.players[0].vy > normalFall.players[0].vy * 1.6);

  // Terminal cap check
  fastFall.players[0].y = -500;
  for (let i = 0; i < 240; i++) {
    stepMatch(fastFall, FIXED_PHYSICS_DT, { p1: { ...EMPTY_INPUT, down: true } });
  }
  assert.ok(fastFall.players[0].vy <= fastFall.cvars.sv_max_fall_speed + 0.01);
});

test('horizontal momentum is preserved across jump takeoff and landing', () => {
  const map = makeTestMap({
    platforms: [{ id: 'floor', x: 640, y: 500, w: 1000, h: 30, angle: 0, material: 'standard', active: true }],
  });
  const state = createMatchState(map, BASE_CONFIG, [
    { id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  state.players[0].x = 400;
  state.players[0].y = 463;
  state.players[0].vx = 520;
  state.players[0].grounded = true;
  state.players[0].coyoteTimer = 0.1;

  // Jump while moving fast horizontally: vx must not drop to zero
  const ev = stepMatch(state, FIXED_PHYSICS_DT, { p1: { ...EMPTY_INPUT, up: true } });
  assert.equal(ev.jumps, 1);
  assert.ok(state.players[0].vx > 500, `Expected preserved vx > 500 on jump, got ${state.players[0].vx}`);
});

test('impact-based bounce obeys restitution and super_bounce amplifies energy', () => {
  const map = makeTestMap({
    platforms: [
      { id: 'std', x: 400, y: 500, w: 220, h: 24, angle: 0, material: 'standard', active: true },
      { id: 'hyp', x: 840, y: 500, w: 220, h: 24, angle: 0, material: 'super_bounce', active: true },
    ],
  });
  const state = createMatchState(map, BASE_CONFIG, [
    { id: 'p1', name: 'Std', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p2', name: 'Hyp', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  state.players[0].x = 400;
  state.players[0].y = 464;
  state.players[0].vy = 450;
  state.players[1].x = 840;
  state.players[1].y = 464;
  state.players[1].vy = 450;

  for (let i = 0; i < 4; i++) {
    stepMatch(state, FIXED_PHYSICS_DT, { p1: EMPTY_INPUT, p2: EMPTY_INPUT });
  }
  // Standard should rebound upward (~0.68 * 450 = ~306)
  assert.ok(state.players[0].vy < -230 && state.players[0].vy > -360, `Got std vy=${state.players[0].vy}`);
  // Super bounce (e > 1) should amplify upward velocity above incoming speed
  assert.ok(state.players[1].vy < -480, `Expected super_bounce vy < -480, got ${state.players[1].vy}`);
});

test('active bounce boosting adds jump impulse onto impact rebound and increments bounceChain', () => {
  const map = makeTestMap();
  const makePair = () =>
    createMatchState(map, BASE_CONFIG, [
      { id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    ]);

  const passive = makePair();
  const active = makePair();
  passive.players[0].x = 640;
  passive.players[0].y = 460;
  passive.players[0].vy = 420;
  active.players[0].x = 640;
  active.players[0].y = 460;
  active.players[0].vy = 420;
  active.players[0].airJumpsRemaining = 0;

  // Press jump just before landing on active bounce instance
  let activeBoostEvents = 0;
  for (let i = 0; i < 5; i++) {
    stepMatch(passive, FIXED_PHYSICS_DT, { p1: EMPTY_INPUT });
    const ev = stepMatch(active, FIXED_PHYSICS_DT, {
      p1: i === 0 ? { ...EMPTY_INPUT, up: true } : EMPTY_INPUT,
    });
    activeBoostEvents += ev.bounceBoosts;
  }

  assert.equal(activeBoostEvents, 1);
  assert.equal(active.players[0].bounceChain, 1);
  assert.ok(
    active.players[0].vy < passive.players[0].vy - 180,
    `Active bounce boost vy (${active.players[0].vy}) should exceed passive (${passive.players[0].vy})`
  );
});

test('boost surface impulse, moving platform velocity transfer, map physicsOverrides, and fixed timestep work cleanly', () => {
  const map = makeTestMap({
    physicsOverrides: { sv_gravity: 500, sv_max_speed: 1200 },
    platforms: [
      { id: 'boost-pad', x: 400, y: 500, w: 300, h: 24, angle: 0, material: 'boost', boostImpulse: 680, active: true },
      { id: 'mover', x: 840, y: 500, w: 240, h: 24, angle: 0, material: 'standard', moveAxis: 'x', moveRange: 100, moveSpeed: 2.0, active: true },
    ],
  });

  const state = createMatchState(map, BASE_CONFIG, [
    { id: 'p1', name: 'Booster', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p2', name: 'Rider', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  assert.equal(state.cvars.sv_gravity, 500);
  assert.equal(state.cvars.sv_max_speed, 1200);

  state.players[0].x = 400;
  state.players[0].y = 466;
  state.players[0].vy = 40;
  state.players[1].x = 840;
  state.players[1].y = 466;
  state.players[1].vy = 40;

  const acc = { current: 0 };
  for (let i = 0; i < 12; i++) {
    stepMatchFixed(state, 1 / 60, { p1: EMPTY_INPUT, p2: EMPTY_INPUT }, acc);
  }
  assert.ok(state.players[0].vx > 450, `Expected boost pad vx > 450, got ${state.players[0].vx}`);
  assert.ok(Math.abs(state.platforms[1].vx) > 50, 'Moving platform should track non-zero vx');
  assert.ok(state.players[1].vx > 50, `Expected rider to inherit moving platform vx, got ${state.players[1].vx}`);
});

test('double jump works once after first jump, blocks a third jump in air, and refreshes on landing', () => {
  const map = makeTestMap();
  const state = createMatchState(map, BASE_CONFIG, [
    { id: 'p1', name: 'Jumper', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  const p = state.players[0];
  p.x = 640;
  p.y = 463;
  p.grounded = true;
  p.coyoteTimer = 0.1;

  // 1st jump from ground
  const ev1 = stepMatch(state, FIXED_PHYSICS_DT, { p1: { ...EMPTY_INPUT, up: true } });
  assert.equal(ev1.jumps, 1);
  assert.equal(p.airJumpsRemaining, 1);

  // Release up for a few frames while airborne and descending slightly
  for (let i = 0; i < 20; i++) {
    stepMatch(state, FIXED_PHYSICS_DT, { p1: EMPTY_INPUT });
  }
  const vyBeforeDouble = p.vy;

  // 2nd jump (double jump) in air
  const ev2 = stepMatch(state, FIXED_PHYSICS_DT, { p1: { ...EMPTY_INPUT, up: true } });
  assert.equal(ev2.jumps, 1);
  assert.equal(p.airJumpsRemaining, 0);
  assert.ok(p.vy < vyBeforeDouble - 120, `Double jump should boost upward: before=${vyBeforeDouble}, after=${p.vy}`);

  // Release up and attempt a 3rd jump in midair -> must NOT jump
  stepMatch(state, FIXED_PHYSICS_DT, { p1: EMPTY_INPUT });
  const ev3 = stepMatch(state, FIXED_PHYSICS_DT, { p1: { ...EMPTY_INPUT, up: true } });
  assert.equal(ev3.jumps, 0);
  assert.equal(p.airJumpsRemaining, 0);

  // Drop and land back on platform (allowing passive e=0.68 bounces to settle) -> refreshes double jump
  for (let i = 0; i < 420; i++) {
    stepMatch(state, FIXED_PHYSICS_DT, { p1: EMPTY_INPUT });
  }
  assert.equal(p.grounded, true);
  assert.equal(p.airJumpsRemaining, 1);
});

test('bouncing builds weight (mass) and acceleration across consecutive bounces while passive drop settles cleanly', () => {
  const map = makeTestMap({
    platforms: [
      { id: 'bouncy-floor', x: 640, y: 500, w: 900, h: 24, angle: 0, material: 'bouncy', active: true },
    ],
  });
  const state = createMatchState(map, BASE_CONFIG, [
    { id: 'p1', name: 'Bouncer', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p2', name: 'Baseline', isHuman: false, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  const bouncer = state.players[0];
  const baseline = state.players[1];
  bouncer.x = 500;
  bouncer.y = 440;
  bouncer.vy = 240;
  baseline.x = 900;
  baseline.y = 200;
  baseline.vy = 0;

  // Perform 2 bouncy hits while holding right + fast-fall on descent
  let bouncesSeen = 0;
  let lastVy = bouncer.vy;
  for (let i = 0; i < 180; i++) {
    stepMatch(state, FIXED_PHYSICS_DT, {
      p1: { ...EMPTY_INPUT, right: true, down: bouncer.vy > 0 },
      p2: EMPTY_INPUT,
    });
    if (lastVy > 0 && bouncer.vy < -100) bouncesSeen++;
    lastVy = bouncer.vy;
    if (bouncesSeen >= 2) break;
  }

  assert.ok(bouncesSeen >= 2, `Expected >=2 bounces, got ${bouncesSeen}`);
  assert.ok(bouncer.bounceChain >= 2, `Expected bounceChain >= 2, got ${bouncer.bounceChain}`);
  assert.ok(bouncer.mass > 1.25, `Expected gained weight mass > 1.25, got ${bouncer.mass}`);

  // Compare acceleration with bounceChain vs 0 bounceChain
  const testMap = makeTestMap();
  const accelState = createMatchState(testMap, BASE_CONFIG, [
    { id: 'chained', name: 'Chained', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'fresh', name: 'Fresh', isHuman: false, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  accelState.players[0].x = 400;
  accelState.players[0].y = 350;
  accelState.players[0].bounceChain = 3;
  accelState.players[1].x = 800;
  accelState.players[1].y = 350;
  accelState.players[1].bounceChain = 0;

  for (let i = 0; i < 20; i++) {
    stepMatch(accelState, FIXED_PHYSICS_DT, {
      chained: { ...EMPTY_INPUT, right: true },
      fresh: { ...EMPTY_INPUT, right: true },
    });
  }
  assert.ok(
    accelState.players[0].vx > accelState.players[1].vx * 1.25,
    `Expected chained vx (${accelState.players[0].vx}) > 1.25x fresh vx (${accelState.players[1].vx})`
  );

  // Passive drop on standard floor with e=0.68 must decay and settle cleanly
  const settleState = createMatchState(testMap, BASE_CONFIG, [
    { id: 'p1', name: 'Dropper', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  settleState.players[0].x = 640;
  settleState.players[0].y = 340;
  for (let i = 0; i < 360; i++) {
    stepMatch(settleState, FIXED_PHYSICS_DT, { p1: EMPTY_INPUT });
  }
  assert.equal(settleState.players[0].grounded, true);
  assert.equal(settleState.players[0].bounceChain, 0);
  assert.equal(settleState.players[0].mass, 1.0);
});

test('heavy mode adds +50% mass and halves acceleration, while new CVars and presets apply cleanly', () => {
  const map = makeTestMap();
  const state = createMatchState(map, BASE_CONFIG, [
    { id: 'heavy', name: 'Heavy', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'light', name: 'Light', isHuman: false, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  state.players[0].x = 400;
  state.players[0].y = 463;
  state.players[0].grounded = true;
  state.players[1].x = 800;
  state.players[1].y = 463;
  state.players[1].grounded = true;

  for (let i = 0; i < 20; i++) {
    stepMatch(state, FIXED_PHYSICS_DT, {
      heavy: { ...EMPTY_INPUT, heavy: true, right: true },
      light: { ...EMPTY_INPUT, heavy: false, right: true },
    });
  }

  assert.equal(state.players[0].mass, 1.5);
  assert.equal(state.players[1].mass, 1.0);
  assert.ok(
    Math.abs(state.players[0].vx - state.players[1].vx * 0.5) < 8,
    `Expected heavy vx (${state.players[0].vx}) ≈ 0.5 * light vx (${state.players[1].vx})`
  );

  // Verify presets resolve distinct CVars
  const moon = createMatchState(map, { ...BASE_CONFIG, physicsPreset: 'moon' }, []);
  const bouncy = createMatchState(map, { ...BASE_CONFIG, physicsPreset: 'bouncy' }, []);
  const heavyPreset = createMatchState(map, { ...BASE_CONFIG, physicsPreset: 'heavy' }, []);
  const hyper = createMatchState(map, { ...BASE_CONFIG, physicsPreset: 'high_momentum' }, []);
  assert.ok(moon.cvars.sv_gravity < 250);
  assert.ok(bouncy.cvars.sv_bounce > 0.9);
  assert.ok(heavyPreset.cvars.sv_gravity > 700 && heavyPreset.cvars.sv_bounce < 0.5);
  assert.ok(hyper.cvars.sv_max_speed > 600);

  // Verify sv_air_gravity_mult & sv_linear_damping take effect
  const dampState = createMatchState(
    makeTestMap({ physicsOverrides: { sv_gravity: 0, sv_air_friction: 0, sv_linear_damping: 0.5 } }),
    BASE_CONFIG,
    [{ id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT }]
  );
  dampState.players[0].x = 640;
  dampState.players[0].y = 300;
  dampState.players[0].vx = 300;
  for (let i = 0; i < 120; i++) stepMatch(dampState, FIXED_PHYSICS_DT, { p1: EMPTY_INPUT });
  assert.ok(dampState.players[0].vx < 200, `Expected linear damping to slow vx from 300, got ${dampState.players[0].vx}`);

  // 10-second Glacier Spire 4-bot rally pacing check (no <3s instant wipeouts)
  const rally = createMatchState(BUILTIN_MAPS[0], BASE_CONFIG, [
    { id: 'b1', name: 'B1', isHuman: false, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'b2', name: 'B2', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'b3', name: 'B3', isHuman: false, aiPolicy: 'tactician', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'b4', name: 'B4', isHuman: false, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  const acc = { current: 0 };
  for (let tick = 0; tick < 60 * 10; tick++) {
    const botInputs: Record<string, PlayerInput> = {};
    for (const pl of rally.players) botInputs[pl.id] = computeAiInput(rally, pl);
    stepMatchFixed(rally, 1 / 60, botInputs, acc);
    if (tick === 180) {
      assert.equal(rally.finished, false, 'Match should still be active past 3 seconds');
    }
  }
  assert.ok(rally.players.some((pl) => pl.alive), 'At least one circle should remain active in rally');
});

test('directional knob aligns with velocity passively and rotates independently via spinLeft/spinRight and aimAngle', () => {
  const zeroGravMap = makeTestMap({ physicsOverrides: { sv_gravity: 0, sv_air_friction: 0, sv_linear_damping: 0 } });
  const state = createMatchState(zeroGravMap, BASE_CONFIG, [
    { id: 'auto', name: 'Auto', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'manual', name: 'Manual', isHuman: false, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'aimed', name: 'Aimed', isHuman: false, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
  ]);

  // Passive velocity alignment: moving down-right rotates knob toward ~pi/4
  const autoP = state.players[0];
  autoP.x = 300;
  autoP.y = 300;
  autoP.vx = 180;
  autoP.vy = 180;
  autoP.knobAngle = Math.PI;

  // Manual spin while moving right: spinLeft should rotate CCW independently of velocity
  const manualP = state.players[1];
  manualP.x = 640;
  manualP.y = 300;
  manualP.vx = 140;
  manualP.vy = 0;
  manualP.knobAngle = 0;

  // Direct aimAngle pointing straight up (-pi/2) while moving right
  const aimedP = state.players[2];
  aimedP.x = 960;
  aimedP.y = 300;
  aimedP.vx = 140;
  aimedP.vy = 0;
  aimedP.knobAngle = Math.PI;

  for (let i = 0; i < 60; i++) {
    stepMatch(state, FIXED_PHYSICS_DT, {
      auto: EMPTY_INPUT,
      manual: { ...EMPTY_INPUT, spinLeft: true },
      aimed: { ...EMPTY_INPUT, aimAngle: -Math.PI / 2 },
    });
  }

  const autoErr = Math.abs(Math.atan2(Math.sin(autoP.knobAngle - Math.PI / 4), Math.cos(autoP.knobAngle - Math.PI / 4)));
  assert.ok(autoErr < 0.25, `Expected auto knob to align near pi/4, got ${autoP.knobAngle}`);
  assert.ok(manualP.knobAngVel < -5, `Expected manual spinLeft angular velocity < -5, got ${manualP.knobAngVel}`);
  assert.ok(manualP.knobManualTimer > 0.4, 'Expected manual timer to hold against velocity auto-align');
  const aimedErr = Math.abs(Math.atan2(Math.sin(aimedP.knobAngle + Math.PI / 2), Math.cos(aimedP.knobAngle + Math.PI / 2)));
  assert.ok(aimedErr < 0.2, `Expected aimed knob near -pi/2, got ${aimedP.knobAngle}`);
});

test('directional knob combat: one-way knob strike outperforms body-body hit, spin-and-hit launches adjacent foes, and knob-vs-knob parries', () => {
  const zeroGravMap = makeTestMap({ physicsOverrides: { sv_gravity: 0, sv_air_friction: 0, sv_linear_damping: 0 } });

  // 1. Compare A hitting B's non-knob side with A's knob vs symmetric body-to-body hit
  const knobHitState = createMatchState(zeroGravMap, BASE_CONFIG, [
    { id: 'a', name: 'Striker', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'b', name: 'Target', isHuman: false, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  knobHitState.players[0].x = 500;
  knobHitState.players[0].y = 300;
  knobHitState.players[0].vx = 260;
  knobHitState.players[0].knobAngle = 0; // A's knob points right toward B
  knobHitState.players[1].x = 562; // Within A's external knob reach + B's body radius
  knobHitState.players[1].y = 300;
  knobHitState.players[1].vx = 0;
  knobHitState.players[1].knobAngle = 0; // B's knob faces away (right), exposing left non-knob side

  const bodyHitState = createMatchState(zeroGravMap, BASE_CONFIG, [
    { id: 'a', name: 'Striker', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'b', name: 'Target', isHuman: false, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  bodyHitState.players[0].x = 500;
  bodyHitState.players[0].y = 300;
  bodyHitState.players[0].vx = 260;
  bodyHitState.players[0].knobAngle = Math.PI; // A's knob faces away (left)
  bodyHitState.players[1].x = 538; // Overlapping body-to-body
  bodyHitState.players[1].y = 300;
  bodyHitState.players[1].vx = 0;
  bodyHitState.players[1].knobAngle = 0; // B's knob faces away (right)

  stepMatch(knobHitState, FIXED_PHYSICS_DT, {
    a: { ...EMPTY_INPUT, aimAngle: 0 },
    b: { ...EMPTY_INPUT, aimAngle: 0 },
  });
  stepMatch(bodyHitState, FIXED_PHYSICS_DT, {
    a: { ...EMPTY_INPUT, aimAngle: Math.PI },
    b: { ...EMPTY_INPUT, aimAngle: 0 },
  });

  assert.ok(
    knobHitState.players[1].vx > bodyHitState.players[1].vx * 1.15,
    `Expected one-way knob strike target vx (${knobHitState.players[1].vx}) > 1.15x body hit (${bodyHitState.players[1].vx})`
  );
  assert.ok(
    knobHitState.players[0].vx > bodyHitState.players[0].vx,
    `Expected one-way knob striker to retain more forward momentum (${knobHitState.players[0].vx} vs ${bodyHitState.players[0].vx})`
  );
  assert.ok(knobHitState.players[0].knobFlashTimer > 0, 'Expected striker knob flash timer on hit');

  // 2. Spin-and-hit: stationary A spins CW (spinRight) while B sits below-right within knob sweep
  const spinState = createMatchState(zeroGravMap, BASE_CONFIG, [
    { id: 'a', name: 'Spinner', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'b', name: 'Victim', isHuman: false, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  spinState.players[0].x = 500;
  spinState.players[0].y = 300;
  spinState.players[0].vx = 0;
  spinState.players[0].vy = 0;
  spinState.players[0].knobAngle = -0.25; // Just above horizontal; CW spin sweeps down through 0 into B
  spinState.players[1].x = 556;
  spinState.players[1].y = 310;
  spinState.players[1].vx = 0;
  spinState.players[1].vy = 0;
  spinState.players[1].knobAngle = 0;

  for (let i = 0; i < 6; i++) {
    stepMatch(spinState, FIXED_PHYSICS_DT, {
      a: { ...EMPTY_INPUT, spinRight: true },
      b: { ...EMPTY_INPUT, aimAngle: 0 },
    });
  }
  const victimSpeed = Math.hypot(spinState.players[1].vx, spinState.players[1].vy);
  assert.ok(victimSpeed > 120, `Expected spin-and-hit to launch stationary victim, got speed ${victimSpeed}`);

  // 3. Knob-vs-knob parry clash when two knobs point directly at each other
  const parryState = createMatchState(zeroGravMap, BASE_CONFIG, [
    { id: 'a', name: 'KnightA', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'b', name: 'KnightB', isHuman: false, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  parryState.players[0].x = 500;
  parryState.players[0].y = 300;
  parryState.players[0].vx = 220;
  parryState.players[0].knobAngle = 0;
  parryState.players[1].x = 582; // Knob tips overlap while bodies stay separated
  parryState.players[1].y = 300;
  parryState.players[1].vx = -220;
  parryState.players[1].knobAngle = Math.PI;

  stepMatch(parryState, FIXED_PHYSICS_DT, {
    a: { ...EMPTY_INPUT, aimAngle: 0 },
    b: { ...EMPTY_INPUT, aimAngle: Math.PI },
  });
  assert.ok(parryState.players[0].vx < 0 && parryState.players[1].vx > 0, 'Expected knob parry to bounce both players apart');
  assert.ok(
    parryState.players[0].knobFlashTimer > 0 && parryState.players[1].knobFlashTimer > 0,
    'Expected parry clash to flash both knobs'
  );
});


