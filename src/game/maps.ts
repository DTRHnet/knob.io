import { ArenaMap, GameMode, MapPlatform, SurfaceMaterial } from './types';

export const ARENA_WIDTH = 1280;
export const ARENA_HEIGHT = 720;

export const BUILTIN_MAPS: ArenaMap[] = [
  {
    id: 'glacier-spire',
    name: 'Glacier Spire',
    author: 'KnobCore',
    version: '1.2.0',
    changelog: 'Added side updraft wind columns and central bouncy recovery core.',
    pool: 'ranked',
    supportedModes: ['classic', 'koth', 'arcade'],
    recommendedMode: 'classic',
    advancedPhysics: false,
    bounds: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    bgStyle: 'glacier',
    platforms: [
      { id: 'gs-main', x: 640, y: 540, w: 540, h: 34, angle: 0, material: 'ice', active: true, tag: 'center' },
      { id: 'gs-bounce', x: 640, y: 468, w: 110, h: 20, angle: 0, material: 'bouncy', bounciness: 1.55, active: true, tag: 'spring' },
      { id: 'gs-left', x: 280, y: 410, w: 210, h: 24, angle: -0.14, material: 'standard', active: true },
      { id: 'gs-right', x: 1000, y: 410, w: 210, h: 24, angle: 0.14, material: 'standard', active: true },
      { id: 'gs-top', x: 640, y: 245, w: 260, h: 22, angle: 0, material: 'ice', active: true, moveAxis: 'x', moveRange: 95, moveSpeed: 1.1 },
    ],
    zones: [
      { id: 'gs-wind-l', type: 'wind', x: 140, y: 360, w: 130, h: 360, fx: 0, fy: -980, strength: 1, active: true, tag: 'updraft-l' },
      { id: 'gs-wind-r', type: 'wind', x: 1140, y: 360, w: 130, h: 360, fx: 0, fy: -980, strength: 1, active: true, tag: 'updraft-r' },
    ],
    joints: [],
    bumpers: [
      { id: 'gs-bmp-1', x: 640, y: 345, radius: 22, impulse: 640, explosive: false, cooldown: 0.45 },
    ],
    triggers: [],
    spawns: [
      { id: 's1', x: 470, y: 470, team: 1 },
      { id: 's2', x: 810, y: 470, team: 2 },
      { id: 's3', x: 280, y: 330, team: 1 },
      { id: 's4', x: 1000, y: 330, team: 2 },
    ],
    objectives: [
      { type: 'koth_hill', x: 640, y: 200, radius: 90 },
    ],
  },
  {
    id: 'factory-belts',
    name: 'Factory Belts',
    author: 'KnobCore',
    version: '1.1.0',
    changelog: 'Added breakable upper bridge and sticky safety pillars.',
    pool: 'ranked',
    supportedModes: ['classic', 'ctf', 'koth', 'arcade'],
    recommendedMode: 'classic',
    advancedPhysics: false,
    bounds: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    bgStyle: 'forge',
    platforms: [
      { id: 'fb-belt-l', x: 370, y: 515, w: 280, h: 28, angle: 0, material: 'conveyor', conveyorSpeed: 230, active: true },
      { id: 'fb-belt-r', x: 910, y: 515, w: 280, h: 28, angle: 0, material: 'conveyor', conveyorSpeed: -230, active: true },
      { id: 'fb-bridge', x: 640, y: 420, w: 220, h: 22, angle: 0, material: 'breakable', breakableHp: 90, active: true, tag: 'mid-bridge' },
      { id: 'fb-wall-l', x: 210, y: 330, w: 26, h: 170, angle: 0, material: 'sticky', active: true },
      { id: 'fb-wall-r', x: 1070, y: 330, w: 26, h: 170, angle: 0, material: 'sticky', active: true },
      { id: 'fb-upper', x: 640, y: 245, w: 340, h: 24, angle: 0, material: 'standard', active: true },
    ],
    zones: [
      { id: 'fb-grav', type: 'gravity', x: 640, y: 260, w: 280, h: 140, fx: 0, fy: 0.45, strength: 0.45, active: true, tag: 'low-g-bay' },
    ],
    joints: [],
    bumpers: [],
    triggers: [
      {
        id: 'fb-trig-1',
        name: 'Bridge Shatter Surge',
        event: 'on_break',
        sourceTag: 'mid-bridge',
        action: 'pulse_gravity',
        targetTag: 'low-g-bay',
        cooldownSec: 4,
      },
    ],
    spawns: [
      { id: 's1', x: 320, y: 450, team: 1 },
      { id: 's2', x: 960, y: 450, team: 2 },
      { id: 's3', x: 560, y: 185, team: 1 },
      { id: 's4', x: 720, y: 185, team: 2 },
    ],
    objectives: [
      { type: 'koth_hill', x: 640, y: 195, radius: 85 },
      { type: 'ctf_flag', x: 640, y: 375, radius: 22 },
      { type: 'ctf_goal_a', x: 280, y: 470, radius: 42 },
      { type: 'ctf_goal_b', x: 1000, y: 470, radius: 42 },
    ],
  },
  {
    id: 'magnet-orbit',
    name: 'Magnet Orbit',
    author: 'KnobCore',
    version: '1.0.4',
    changelog: 'Balanced radial magnet pull and added soft trampoline spans.',
    pool: 'ranked',
    supportedModes: ['classic', 'koth', 'arcade'],
    recommendedMode: 'koth',
    advancedPhysics: false,
    bounds: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    bgStyle: 'reactor',
    platforms: [
      { id: 'mo-soft-l', x: 370, y: 500, w: 230, h: 24, angle: 0.08, material: 'soft', active: true },
      { id: 'mo-soft-r', x: 910, y: 500, w: 230, h: 24, angle: -0.08, material: 'soft', active: true },
      { id: 'mo-core-plat', x: 640, y: 575, w: 220, h: 26, angle: 0, material: 'bouncy', bounciness: 1.45, active: true },
      { id: 'mo-sky-l', x: 340, y: 265, w: 180, h: 22, angle: 0, material: 'standard', active: true },
      { id: 'mo-sky-r', x: 940, y: 265, w: 180, h: 22, angle: 0, material: 'standard', active: true },
      { id: 'mo-crown', x: 640, y: 185, w: 190, h: 20, angle: 0, material: 'ice', active: true },
    ],
    zones: [
      { id: 'mo-mag', type: 'magnet', x: 640, y: 360, w: 420, h: 420, radius: 215, fx: 0, fy: 0, strength: 620, active: true, tag: 'core-magnet' },
    ],
    joints: [],
    bumpers: [
      { id: 'mo-b1', x: 640, y: 360, radius: 26, impulse: 700, explosive: false, cooldown: 0.35 },
    ],
    triggers: [],
    spawns: [
      { id: 's1', x: 340, y: 210, team: 1 },
      { id: 's2', x: 940, y: 210, team: 2 },
      { id: 's3', x: 370, y: 440, team: 1 },
      { id: 's4', x: 910, y: 440, team: 2 },
    ],
    objectives: [
      { type: 'koth_hill', x: 640, y: 360, radius: 95 },
    ],
  },
  {
    id: 'pendulum-forge',
    name: 'Pendulum Forge',
    author: 'KnobCore',
    version: '2.0.0',
    changelog: 'Motorized twin hammer joints, chain-reaction bumper mines, and scripted gate.',
    pool: 'casual',
    supportedModes: ['classic', 'arcade', 'koth'],
    recommendedMode: 'arcade',
    advancedPhysics: true,
    bounds: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    bgStyle: 'forge',
    platforms: [
      { id: 'pf-floor', x: 640, y: 560, w: 660, h: 32, angle: 0, material: 'standard', active: true },
      { id: 'pf-gate', x: 640, y: 365, w: 240, h: 22, angle: 0, material: 'bouncy', active: true, tag: 'forge-gate' },
      { id: 'pf-l', x: 250, y: 390, w: 180, h: 24, angle: 0, material: 'conveyor', conveyorSpeed: 190, active: true },
      { id: 'pf-r', x: 1030, y: 390, w: 180, h: 24, angle: 0, material: 'conveyor', conveyorSpeed: -190, active: true },
      { id: 'pf-brk-1', x: 430, y: 250, w: 150, h: 22, angle: 0, material: 'breakable', breakableHp: 75, active: true },
      { id: 'pf-brk-2', x: 850, y: 250, w: 150, h: 22, angle: 0, material: 'breakable', breakableHp: 75, active: true },
    ],
    zones: [
      { id: 'pf-switch', type: 'wind', x: 640, y: 500, w: 140, h: 90, fx: 0, fy: -420, strength: 1, active: true, tag: 'gate-switch' },
    ],
    joints: [
      { id: 'pf-j1', x: 460, y: 390, length: 145, thickness: 18, angularSpeed: 1.55, angle: 0, material: 'standard' },
      { id: 'pf-j2', x: 820, y: 390, length: 145, thickness: 18, angularSpeed: -1.55, angle: Math.PI / 2, material: 'standard' },
    ],
    bumpers: [
      { id: 'pf-mine-1', x: 640, y: 230, radius: 22, impulse: 780, explosive: true, cooldown: 3.5 },
      { id: 'pf-mine-2', x: 560, y: 280, radius: 18, impulse: 720, explosive: true, cooldown: 3.5 },
      { id: 'pf-mine-3', x: 720, y: 280, radius: 18, impulse: 720, explosive: true, cooldown: 3.5 },
    ],
    triggers: [
      {
        id: 'pf-trig-gate',
        name: 'Switch Toggles Center Bridge',
        event: 'enter_zone',
        sourceTag: 'gate-switch',
        action: 'toggle_platform',
        targetTag: 'forge-gate',
        cooldownSec: 2.5,
      },
    ],
    spawns: [
      { id: 's1', x: 380, y: 495, team: 1 },
      { id: 's2', x: 900, y: 495, team: 2 },
      { id: 's3', x: 250, y: 330, team: 1 },
      { id: 's4', x: 1030, y: 330, team: 2 },
    ],
    objectives: [
      { type: 'koth_hill', x: 640, y: 320, radius: 85 },
    ],
  },
  {
    id: 'acid-caldera',
    name: 'Acid Caldera',
    author: 'KnobCore',
    version: '1.0.2',
    changelog: 'Designed for Survival shrinking zones and rising caldera hazards.',
    pool: 'casual',
    supportedModes: ['survival', 'classic', 'arcade'],
    recommendedMode: 'survival',
    advancedPhysics: false,
    bounds: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    bgStyle: 'slate_grid',
    platforms: [
      { id: 'ac-base-l', x: 370, y: 530, w: 220, h: 24, angle: 0, material: 'breakable', breakableHp: 110, active: true },
      { id: 'ac-base-r', x: 910, y: 530, w: 220, h: 24, angle: 0, material: 'breakable', breakableHp: 110, active: true },
      { id: 'ac-mid', x: 640, y: 430, w: 280, h: 26, angle: 0, material: 'standard', active: true },
      { id: 'ac-stk-l', x: 300, y: 310, w: 26, h: 150, angle: 0, material: 'sticky', active: true },
      { id: 'ac-stk-r', x: 980, y: 310, w: 26, h: 150, angle: 0, material: 'sticky', active: true },
      { id: 'ac-peak', x: 640, y: 225, w: 240, h: 22, angle: 0, material: 'soft', active: true },
    ],
    zones: [],
    joints: [],
    bumpers: [
      { id: 'ac-b1', x: 640, y: 335, radius: 20, impulse: 640, explosive: false, cooldown: 0.4 },
    ],
    triggers: [],
    spawns: [
      { id: 's1', x: 540, y: 365, team: 1 },
      { id: 's2', x: 740, y: 365, team: 2 },
      { id: 's3', x: 370, y: 465, team: 1 },
      { id: 's4', x: 910, y: 465, team: 2 },
    ],
    objectives: [
      { type: 'koth_hill', x: 640, y: 175, radius: 80 },
    ],
  },
  {
    id: 'prism-relay',
    name: 'Prism Relay',
    author: 'KnobCore',
    version: '1.1.0',
    changelog: 'Dual-base CTF arena with soft mid-bridges and ice side lanes.',
    pool: 'ranked',
    supportedModes: ['ctf', 'classic', 'koth'],
    recommendedMode: 'ctf',
    advancedPhysics: false,
    bounds: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    bgStyle: 'reactor',
    platforms: [
      { id: 'pr-base-a', x: 240, y: 490, w: 260, h: 28, angle: 0, material: 'standard', active: true },
      { id: 'pr-base-b', x: 1040, y: 490, w: 260, h: 28, angle: 0, material: 'standard', active: true },
      { id: 'pr-mid-soft', x: 640, y: 465, w: 280, h: 24, angle: 0, material: 'soft', active: true },
      { id: 'pr-lane-a', x: 410, y: 325, w: 200, h: 22, angle: -0.1, material: 'ice', active: true },
      { id: 'pr-lane-b', x: 870, y: 325, w: 200, h: 22, angle: 0.1, material: 'ice', active: true },
      { id: 'pr-top-bounce', x: 640, y: 230, w: 160, h: 20, angle: 0, material: 'bouncy', bounciness: 1.4, active: true },
    ],
    zones: [
      { id: 'pr-wind', type: 'wind', x: 640, y: 340, w: 220, h: 160, fx: 0, fy: -520, strength: 1, active: true, tag: 'center-lift' },
    ],
    joints: [],
    bumpers: [],
    triggers: [],
    spawns: [
      { id: 's1', x: 185, y: 430, team: 1 },
      { id: 's2', x: 1095, y: 430, team: 2 },
      { id: 's3', x: 290, y: 430, team: 1 },
      { id: 's4', x: 990, y: 430, team: 2 },
    ],
    objectives: [
      { type: 'ctf_flag', x: 640, y: 415, radius: 22 },
      { type: 'ctf_goal_a', x: 170, y: 445, radius: 44 },
      { type: 'ctf_goal_b', x: 1110, y: 445, radius: 44 },
      { type: 'koth_hill', x: 640, y: 405, radius: 85 },
    ],
  },
];

// Deterministic PRNG (Mulberry32) for Daily / Weekly / Custom Seed Hybrid Maps
function hashSeed(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seedStr: string): () => number {
  let a = hashSeed(seedStr);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateProceduralMap(
  seed: string,
  pool: 'daily' | 'weekly' | 'community' = 'daily',
  mode: GameMode = 'classic',
  advancedPhysics = false
): ArenaMap {
  const rng = createRng(seed);
  const materials: SurfaceMaterial[] = [
    'standard',
    'ice',
    'bouncy',
    'sticky',
    'conveyor',
    'breakable',
    'soft',
  ];
  const bgStyles: ArenaMap['bgStyle'][] = ['slate_grid', 'glacier', 'forge', 'reactor'];
  const bgStyle = bgStyles[Math.floor(rng() * bgStyles.length)];

  const platforms: MapPlatform[] = [];
  const baseMat = materials[Math.floor(rng() * 3)]; // standard, ice, or bouncy/soft
  const centerW = 280 + Math.floor(rng() * 200);
  const centerY = 490 + Math.floor(rng() * 75);

  platforms.push({
    id: `proc-center`,
    x: 640,
    y: centerY,
    w: centerW,
    h: 28,
    angle: 0,
    material: baseMat === 'bouncy' ? 'soft' : baseMat,
    active: true,
    tag: 'proc-core',
  });

  // Symmetric wing platforms (hybrid curated-balance structure)
  const wingCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < wingCount; i++) {
    const offsetX = 210 + Math.floor(rng() * 230);
    const y = 240 + Math.floor(rng() * 250);
    const w = 140 + Math.floor(rng() * 110);
    const mat = materials[Math.floor(rng() * materials.length)];
    const tilt = (rng() - 0.5) * 0.24;
    const convSpeed = mat === 'conveyor' ? (rng() > 0.5 ? 200 : -200) : undefined;

    platforms.push({
      id: `proc-w-l-${i}`,
      x: 640 - offsetX,
      y,
      w,
      h: 22,
      angle: tilt,
      material: mat,
      conveyorSpeed: convSpeed,
      breakableHp: mat === 'breakable' ? 85 : undefined,
      bounciness: mat === 'bouncy' ? 1.48 : undefined,
      active: true,
    });
    platforms.push({
      id: `proc-w-r-${i}`,
      x: 640 + offsetX,
      y,
      w,
      h: 22,
      angle: -tilt,
      material: mat,
      conveyorSpeed: convSpeed !== undefined ? -convSpeed : undefined,
      breakableHp: mat === 'breakable' ? 85 : undefined,
      bounciness: mat === 'bouncy' ? 1.48 : undefined,
      active: true,
    });
  }

  // Optional top floating island
  if (rng() > 0.3) {
    platforms.push({
      id: 'proc-top',
      x: 640,
      y: 200 + Math.floor(rng() * 55),
      w: 190 + Math.floor(rng() * 80),
      h: 20,
      angle: 0,
      material: rng() > 0.5 ? 'ice' : 'bouncy',
      bounciness: 1.45,
      moveAxis: rng() > 0.45 ? 'x' : 'none',
      moveRange: 90,
      moveSpeed: 1.15,
      active: true,
    });
  }

  const zones: ArenaMap['zones'] = [];
  if (rng() > 0.35) {
    const isMagnet = rng() > 0.5;
    zones.push({
      id: 'proc-zone-1',
      type: isMagnet ? 'magnet' : 'wind',
      x: 640,
      y: 340,
      w: 240,
      h: 220,
      radius: 190,
      fx: isMagnet ? 0 : (rng() > 0.5 ? 360 : -360),
      fy: isMagnet ? 0 : -460,
      strength: isMagnet ? (rng() > 0.5 ? 540 : -480) : 1,
      active: true,
      tag: 'proc-field',
    });
  }

  const joints: ArenaMap['joints'] = advancedPhysics
    ? [
        {
          id: 'proc-joint-1',
          x: 640,
          y: 345,
          length: 155,
          thickness: 16,
          angularSpeed: rng() > 0.5 ? 1.4 : -1.4,
          angle: 0,
          material: 'standard',
        },
      ]
    : [];

  const bumpers: ArenaMap['bumpers'] = [
    {
      id: 'proc-bmp-1',
      x: 640,
      y: centerY - 125,
      radius: 20,
      impulse: 680,
      explosive: advancedPhysics,
      cooldown: advancedPhysics ? 3.2 : 0.4,
    },
  ];

  const label =
    pool === 'daily'
      ? `Daily Challenge (${seed})`
      : pool === 'weekly'
      ? `Weekly Seed (${seed})`
      : `Seed: ${seed}`;

  return {
    id: `proc-${pool}-${seed}`,
    name: label,
    author: 'Hybrid Generator',
    version: '1.0.0',
    changelog: `Procedural hybrid layout generated from seed "${seed}".`,
    pool,
    supportedModes: ['classic', 'koth', 'survival', 'ctf', 'arcade'],
    recommendedMode: mode,
    advancedPhysics,
    bounds: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    bgStyle,
    platforms,
    zones,
    joints,
    bumpers,
    triggers: [],
    spawns: [
      { id: 'ps1', x: 540, y: centerY - 60, team: 1 },
      { id: 'ps2', x: 740, y: centerY - 60, team: 2 },
      { id: 'ps3', x: 410, y: 200, team: 1 },
      { id: 'ps4', x: 870, y: 200, team: 2 },
    ],
    objectives: [
      { type: 'koth_hill', x: 640, y: 295, radius: 85 },
      { type: 'ctf_flag', x: 640, y: centerY - 50, radius: 22 },
      { type: 'ctf_goal_a', x: 250, y: 420, radius: 42 },
      { type: 'ctf_goal_b', x: 1030, y: 420, radius: 42 },
    ],
  };
}

export function getDailyChallengeMap(): ArenaMap {
  const today = new Date().toISOString().slice(0, 10);
  return generateProceduralMap(today, 'daily', 'classic', false);
}

export function getWeeklyRankedMap(): ArenaMap {
  const now = new Date();
  const startOfYear = new Date(now.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7);
  return generateProceduralMap(`${now.getUTCFullYear()}-W${week}`, 'weekly', 'koth', true);
}
