import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRankTier,
  createMatchState,
  filterProfanity,
  stepMatch,
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
  assert.ok(state.players[0].vy < -400);
});

test('input buffering executes jump on first landing frame', () => {
  const map = makeTestMap();
  const state = createMatchState(map, BASE_CONFIG, [
    { id: 'p1', name: 'P1', isHuman: true, aiPolicy: 'brawler', team: 0, loadout: DEFAULT_LOADOUT },
    { id: 'p2', name: 'P2', isHuman: false, aiPolicy: 'acrobat', team: 0, loadout: DEFAULT_LOADOUT },
  ]);
  // Position p1 just above floor falling downward
  state.players[0].x = 540;
  state.players[0].y = 452;
  state.players[0].vy = 280;
  state.players[0].grounded = false;
  state.players[0].coyoteTimer = 0;

  // Press jump slightly early (while airborne) -> buffers jump, then lands next frame
  stepMatch(state, 0.016, { p1: { ...EMPTY_INPUT, up: true }, p2: EMPTY_INPUT });
  let totalJumps = 0;
  for (let i = 0; i < 6; i++) {
    const ev = stepMatch(state, 0.016, { p1: EMPTY_INPUT, p2: EMPTY_INPUT });
    totalJumps += ev.jumps;
  }
  assert.equal(totalJumps, 1);
  assert.ok(state.players[0].vy < -300);
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
  assert.ok(bState.players[0].vy < -500);

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
