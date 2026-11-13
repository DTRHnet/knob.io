export type SurfaceMaterial =
  | 'standard'
  | 'ice'
  | 'bouncy'
  | 'super_bounce'
  | 'sticky'
  | 'boost'
  | 'conveyor'
  | 'breakable'
  | 'soft';

export type PhysicsPresetId =
  | 'map_default'
  | 'standard'
  | 'moon'
  | 'bouncy'
  | 'heavy'
  | 'high_momentum';

export interface PhysicsCVars {
  sv_gravity: number;
  sv_air_gravity_mult: number;
  sv_jump_impulse: number;
  sv_air_jumps: number;
  sv_early_release_gravity: number;
  sv_fall_gravity: number;
  sv_fastfall_multiplier: number;
  sv_max_fall_speed: number;
  sv_bounce: number;
  sv_bounce_weight_gain: number;
  sv_bounce_accel_gain: number;
  sv_air_control: number;
  sv_ground_friction: number;
  sv_air_friction: number;
  sv_linear_damping: number;
  sv_horizontal_accel: number;
  sv_max_speed: number;
  sv_heavy_mass_mult: number;
  sv_heavy_accel_mult: number;
  sv_jump_buffer: number; // ms
  sv_coyote_time: number; // ms
  sv_knob_length: number;
  sv_knob_spin_speed: number;
  sv_knob_hit_mult: number;
}

export const DEFAULT_PHYSICS_CVARS: PhysicsCVars = {
  sv_gravity: 480,
  sv_air_gravity_mult: 1.0,
  sv_jump_impulse: 340,
  sv_air_jumps: 1,
  sv_early_release_gravity: 1.45,
  sv_fall_gravity: 1.0,
  sv_fastfall_multiplier: 1.9,
  sv_max_fall_speed: 680,
  sv_bounce: 0.68,
  sv_bounce_weight_gain: 0.16,
  sv_bounce_accel_gain: 0.14,
  sv_air_control: 0.56,
  sv_ground_friction: 4.5,
  sv_air_friction: 0.12,
  sv_linear_damping: 0.06,
  sv_horizontal_accel: 560,
  sv_max_speed: 410,
  sv_heavy_mass_mult: 1.5,
  sv_heavy_accel_mult: 0.5,
  sv_jump_buffer: 120,
  sv_coyote_time: 100,
  sv_knob_length: 1.0,
  sv_knob_spin_speed: 10.5,
  sv_knob_hit_mult: 1.45,
};

export const PHYSICS_PRESETS: Record<Exclude<PhysicsPresetId, 'map_default'>, Partial<PhysicsCVars>> = {
  standard: {
    sv_gravity: 480,
    sv_air_gravity_mult: 1.0,
    sv_jump_impulse: 340,
    sv_bounce: 0.68,
    sv_fastfall_multiplier: 1.9,
    sv_air_control: 0.56,
    sv_horizontal_accel: 560,
    sv_max_speed: 410,
    sv_max_fall_speed: 680,
  },
  moon: {
    sv_gravity: 190,
    sv_air_gravity_mult: 1.0,
    sv_jump_impulse: 255,
    sv_bounce: 0.68,
    sv_fastfall_multiplier: 2.2,
    sv_air_control: 0.72,
    sv_horizontal_accel: 460,
    sv_max_speed: 380,
    sv_max_fall_speed: 500,
  },
  bouncy: {
    sv_gravity: 480,
    sv_air_gravity_mult: 1.0,
    sv_jump_impulse: 330,
    sv_bounce: 0.94,
    sv_fastfall_multiplier: 2.0,
    sv_air_control: 0.65,
    sv_horizontal_accel: 540,
    sv_max_speed: 460,
    sv_max_fall_speed: 720,
  },
  heavy: {
    sv_gravity: 760,
    sv_air_gravity_mult: 1.08,
    sv_jump_impulse: 430,
    sv_bounce: 0.45,
    sv_fastfall_multiplier: 1.85,
    sv_air_control: 0.48,
    sv_horizontal_accel: 680,
    sv_max_speed: 450,
    sv_max_fall_speed: 820,
  },
  high_momentum: {
    sv_gravity: 720,
    sv_air_gravity_mult: 1.0,
    sv_jump_impulse: 440,
    sv_bounce: 0.76,
    sv_fastfall_multiplier: 2.25,
    sv_air_control: 0.75,
    sv_horizontal_accel: 860,
    sv_max_speed: 660,
    sv_max_fall_speed: 980,
  },
};

export type ZoneType = 'gravity' | 'wind' | 'magnet';

export type GameMode = 'classic' | 'survival' | 'koth' | 'ctf' | 'arcade';

export type ArcadeModifier =
  | 'none'
  | 'low_g'
  | 'bumper_chaos'
  | 'heavy_clash'
  | 'hyper_bounce';

export type AIPolicy = 'brawler' | 'acrobat' | 'tactician';

export type RankTier =
  | 'Bronze'
  | 'Silver'
  | 'Gold'
  | 'Platinum'
  | 'Diamond'
  | 'Grand Knob';

export type SkinStyle =
  | 'ring'
  | 'prism'
  | 'target'
  | 'crescent'
  | 'checker'
  | 'crown';

export type TrailStyle = 'ribbon' | 'sparks' | 'frost' | 'plasma';
export type ImpactFxStyle = 'shockwave' | 'shatter' | 'starburst';
export type DeathFxStyle = 'pixel' | 'implode' | 'confetti';

export interface CosmeticLoadout {
  color: string;
  skin: SkinStyle;
  trail: TrailStyle;
  impactFx: ImpactFxStyle;
  deathFx: DeathFxStyle;
  emote: string;
}

export interface MapLayerVisibility {
  background: boolean;
  zones: boolean;
  platforms: boolean;
  hazards: boolean;
  spawns: boolean;
}

export interface MapPlatform {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number; // radians
  material: SurfaceMaterial;
  conveyorSpeed?: number; // px/s along surface
  bounciness?: number; // optional restitution override
  friction?: number; // optional surface friction override
  boostImpulse?: number; // directional impulse for boost platforms
  breakableHp?: number;
  active?: boolean;
  tag?: string;
  moveAxis?: 'none' | 'x' | 'y';
  moveRange?: number;
  moveSpeed?: number;
}

export interface MapZone {
  id: string;
  type: ZoneType;
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number; // used for radial magnet
  fx: number; // wind force X or gravity scale X
  fy: number; // wind force Y or gravity scale Y
  strength: number; // magnet or multiplier
  active?: boolean;
  tag?: string;
}

export interface MapJoint {
  id: string;
  x: number;
  y: number;
  length: number;
  thickness: number;
  angularSpeed: number; // rad/s
  angle: number;
  material: SurfaceMaterial;
}

export interface MapBumper {
  id: string;
  x: number;
  y: number;
  radius: number;
  impulse: number;
  explosive: boolean; // chain reaction in advanced physics
  cooldown: number;
}

export type TriggerEventType = 'enter_zone' | 'timer' | 'on_break';
export type TriggerActionType =
  | 'toggle_platform'
  | 'reverse_wind'
  | 'pulse_gravity'
  | 'detonate_bumpers';

export interface MapTrigger {
  id: string;
  name: string;
  event: TriggerEventType;
  sourceTag: string; // zone id or platform tag
  intervalSec?: number; // for timer triggers
  action: TriggerActionType;
  targetTag: string;
  cooldownSec: number;
}

export interface MapSpawn {
  id: string;
  x: number;
  y: number;
  team: 0 | 1 | 2; // 0 = FFA, 1 = Team A, 2 = Team B
}

export interface MapObjective {
  type: 'koth_hill' | 'ctf_flag' | 'ctf_goal_a' | 'ctf_goal_b';
  x: number;
  y: number;
  radius: number;
}

export interface ArenaMap {
  id: string;
  name: string;
  author: string;
  version: string;
  changelog: string;
  pool: 'ranked' | 'casual' | 'daily' | 'weekly' | 'community';
  supportedModes: GameMode[];
  recommendedMode: GameMode;
  advancedPhysics: boolean;
  physicsOverrides?: Partial<PhysicsCVars>;
  bounds: { width: number; height: number };
  bgStyle: 'slate_grid' | 'glacier' | 'forge' | 'reactor';
  platforms: MapPlatform[];
  zones: MapZone[];
  joints: MapJoint[];
  bumpers: MapBumper[];
  triggers: MapTrigger[];
  spawns: MapSpawn[];
  objectives: MapObjective[];
}

export interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  heavy: boolean;
  emote: boolean;
  spinLeft?: boolean;
  spinRight?: boolean;
  aimAngle?: number | null;
}

export interface TrailPoint {
  x: number;
  y: number;
  age: number;
  heavy: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  isHuman: boolean;
  aiPolicy: AIPolicy;
  team: 0 | 1 | 2;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  angle: number;
  angVel: number;
  knobAngle: number;
  knobAngVel: number;
  knobManualTimer: number;
  knobFlashTimer: number;
  isHeavy: boolean;
  grounded: boolean;
  onStickyWall: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  prevJumpHeld: boolean;
  airJumpsRemaining: number;
  maxAirJumps: number;
  lastSurfaceMaterial: SurfaceMaterial;
  stocks: number;
  alive: boolean;
  respawnTimer: number;
  invulnTimer: number;
  hitFlashTimer: number;
  squashX: number;
  squashY: number;
  knockouts: number;
  deaths: number;
  damageDealt: number;
  objectiveScore: number; // KOTH % or CTF captures
  lastHitBy: string | null;
  lastHitTimer: number;
  loadout: CosmeticLoadout;
  trail: TrailPoint[];
  calloutText: string | null;
  calloutTimer: number;
  emoteCooldown: number;
  hasFlag: boolean;
  bounceChain: number;
  bounceGraceTimer: number;
  lastImpactSpeed: number;
  activeBoostFlash: number;
}

export interface RuntimePlatform extends MapPlatform {
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  respawnTimer: number;
  softDeflection: number; // vertical spring sag for 'soft' material
  softVelocity: number;
  currentActive: boolean;
}

export interface RuntimeZone extends MapZone {
  currentActive: boolean;
  currentFx: number;
  currentFy: number;
  pulseTimer: number;
}

export interface RuntimeBumper extends MapBumper {
  triggerTimer: number;
  chainFlash: number;
}

export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: 'circle' | 'square' | 'spark';
}

export interface ShockwaveRing {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface ReplayFrame {
  time: number;
  players: Array<{
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    isHeavy: boolean;
    alive: boolean;
    stocks: number;
    angle: number;
    knobAngle?: number;
    objectiveScore: number;
    hasFlag: boolean;
    calloutText: string | null;
  }>;
  hazardLevel: number;
  survivalRadius: number;
  flagX: number;
  flagY: number;
}

export interface ReplayClip {
  id: string;
  title: string;
  mapName: string;
  mode: GameMode;
  createdAt: string;
  durationSec: number;
  winnerName: string;
  playerMeta: Array<{
    id: string;
    name: string;
    loadout: CosmeticLoadout;
    team: 0 | 1 | 2;
  }>;
  frames: ReplayFrame[];
}

export interface MatchConfig {
  mode: GameMode;
  advancedPhysics: boolean;
  arcadeModifier: ArcadeModifier;
  physicsPreset: PhysicsPresetId;
  customCVars?: Partial<PhysicsCVars>;
  ranked: boolean;
  stocks: number;
  timeLimitSec: number;
  region: string;
}

export interface MatchState {
  map: ArenaMap;
  config: MatchConfig;
  cvars: PhysicsCVars;
  timeElapsed: number;
  timeRemaining: number;
  hitstopTimer: number;
  trauma: number;
  platforms: RuntimePlatform[];
  zones: RuntimeZone[];
  joints: MapJoint[];
  bumpers: RuntimeBumper[];
  triggerCooldowns: Record<string, number>;
  players: PlayerState[];
  particles: Particle[];
  particleCursor: number;
  shockwaves: ShockwaveRing[];
  survivalRadius: number;
  hazardRiseY: number;
  kothX: number;
  kothY: number;
  kothRadius: number;
  kothOwnerId: string | null;
  flagX: number;
  flagY: number;
  flagVx: number;
  flagVy: number;
  flagCarrierId: string | null;
  finished: boolean;
  winnerId: string | null;
  winnerName: string | null;
  winReason: string | null;
  wasBehindAtHalfway: Record<string, boolean>;
}

export interface MapStatRecord {
  played: number;
  wins: number;
  knockouts: number;
}

export interface PlayerProfile {
  id: string;
  handle: string;
  region: string;
  mmr: number;
  tier: RankTier;
  season: string;
  matchesPlayed: number;
  wins: number;
  totalKnockouts: number;
  comebackWins: number;
  trailblazes: number;
  rankedWins: number;
  casualWins: number;
  loadout: CosmeticLoadout;
  mapStats: Record<string, MapStatRecord>;
}

export interface LobbyRoomSummary {
  code: string;
  name: string;
  host: string;
  region: string;
  skillRange: string;
  mode: GameMode;
  mapId: string;
  mapName: string;
  advancedPhysics: boolean;
  ranked: boolean;
  playerCount: number;
  maxPlayers: number;
  isPrivate: boolean;
  players: Array<{ id: string; name: string; color: string; ready: boolean }>;
  chat: Array<{ id: string; sender: string; text: string; time: string }>;
}
