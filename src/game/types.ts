export type SurfaceMaterial =
  | 'standard'
  | 'ice'
  | 'bouncy'
  | 'sticky'
  | 'conveyor'
  | 'breakable'
  | 'soft';

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
  bounciness?: number;
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
  isHeavy: boolean;
  grounded: boolean;
  onStickyWall: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  prevJumpHeld: boolean;
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
}

export interface RuntimePlatform extends MapPlatform {
  baseX: number;
  baseY: number;
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
  ranked: boolean;
  stocks: number;
  timeLimitSec: number;
  region: string;
}

export interface MatchState {
  map: ArenaMap;
  config: MatchConfig;
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
