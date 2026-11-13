import { ARENA_HEIGHT, ARENA_WIDTH } from './maps';
import { MatchState, PlayerInput, PlayerState } from './types';

function findNearestOpponent(state: MatchState, self: PlayerState): PlayerState | null {
  let best: PlayerState | null = null;
  let bestDist = Infinity;
  for (const p of state.players) {
    if (p.id === self.id || !p.alive) continue;
    if (self.team !== 0 && p.team === self.team) continue;
    const d = Math.hypot(p.x - self.x, p.y - self.y);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

function hasGroundBelow(state: MatchState, x: number, y: number): boolean {
  for (const plat of state.platforms) {
    if (!plat.currentActive) continue;
    if (Math.abs(x - plat.x) <= plat.w * 0.55 && plat.y >= y - 10 && plat.y <= y + 360) {
      return true;
    }
  }
  return false;
}

export function computeAiInput(state: MatchState, bot: PlayerState): PlayerInput {
  const input: PlayerInput = {
    left: false,
    right: false,
    up: false,
    down: false,
    heavy: false,
    emote: false,
  };

  if (!bot.alive) return input;

  // 1. Survival / Edge Recovery instinct shared at danger boundaries
  const nearLeftEdge = bot.x < 175 || !hasGroundBelow(state, bot.x - 24, bot.y);
  const nearRightEdge = bot.x > ARENA_WIDTH - 175 || !hasGroundBelow(state, bot.x + 24, bot.y);
  const fallingDanger = bot.y > ARENA_HEIGHT - 165;

  if (fallingDanger || (bot.y > 540 && !bot.grounded)) {
    if (bot.x < ARENA_WIDTH * 0.5) input.right = true;
    else input.left = true;
    if (bot.grounded || bot.onStickyWall || bot.coyoteTimer > 0) {
      input.up = true;
    }
    return input;
  }

  if (state.config.mode === 'survival') {
    const distFromCenter = Math.hypot(bot.x - ARENA_WIDTH / 2, bot.y - ARENA_HEIGHT / 2);
    if (distFromCenter > state.survivalRadius * 0.72) {
      if (bot.x < ARENA_WIDTH / 2) input.right = true;
      else input.left = true;
      if (bot.y > ARENA_HEIGHT / 2 && (bot.grounded || bot.coyoteTimer > 0)) input.up = true;
      return input;
    }
  }

  const target = findNearestOpponent(state, bot);
  if (!target) {
    // Idle patrol near center
    if (bot.x < ARENA_WIDTH * 0.45) input.right = true;
    else if (bot.x > ARENA_WIDTH * 0.55) input.left = true;
    return input;
  }

  const dx = target.x - bot.x;
  const dy = target.y - bot.y;
  const dist = Math.hypot(dx, dy);

  // Policy 1: BRAWLER — Aggressive charger + Heavy slam right before collision
  if (bot.aiPolicy === 'brawler') {
    if (dx > 18 && !nearRightEdge) input.right = true;
    else if (dx < -18 && !nearLeftEdge) input.left = true;

    if (dy < -42 && (bot.grounded || bot.coyoteTimer > 0)) {
      input.up = true;
    }
    if (dist < 105 && Math.abs(bot.vx) > 95) {
      input.heavy = true;
    }
    if (dy > 55 && Math.abs(dx) < 65 && !bot.grounded) {
      input.heavy = true;
      input.down = true;
    }
    return input;
  }

  // Policy 2: ACROBAT — Evasive high-ground jumper, edge-guarder, bouncy-pad user
  if (bot.aiPolicy === 'acrobat') {
    // Prefer higher elevation and avoid direct heavy clashes
    const threatClose = dist < 110 && target.isHeavy;
    if (threatClose) {
      // Dodge away and jump over
      if (dx > 0 && !nearLeftEdge) input.left = true;
      else if (!nearRightEdge) input.right = true;
      if (bot.grounded || bot.coyoteTimer > 0) input.up = true;
    } else {
      // Seek upper platform or flank target
      if (bot.y > 320 && (bot.grounded || bot.coyoteTimer > 0)) {
        input.up = true;
      }
      if (Math.abs(dx) > 65) {
        if (dx > 0 && !nearRightEdge) input.right = true;
        else if (dx < 0 && !nearLeftEdge) input.left = true;
      } else if (dy > 20 && !bot.grounded) {
        // Aerial dive strike
        input.down = true;
        input.heavy = dist < 68;
      }
    }
    return input;
  }

  // Policy 3: TACTICIAN — Objective controller (KOTH hill, CTF flag/goal, zone user)
  let goalX = target.x;
  let goalY = target.y;

  if (state.config.mode === 'koth') {
    goalX = state.kothX;
    goalY = state.kothY;
  } else if (state.config.mode === 'ctf') {
    if (bot.hasFlag) {
      const goalObj = state.map.objectives.find(
        (o) => o.type === (bot.team === 2 ? 'ctf_goal_b' : 'ctf_goal_a')
      );
      if (goalObj) {
        goalX = goalObj.x;
        goalY = goalObj.y;
      }
    } else {
      goalX = state.flagX;
      goalY = state.flagY;
    }
  }

  const gdx = goalX - bot.x;
  const gdy = goalY - bot.y;

  if (gdx > 20 && !nearRightEdge) input.right = true;
  else if (gdx < -20 && !nearLeftEdge) input.left = true;

  if (gdy < -36 && (bot.grounded || bot.coyoteTimer > 0)) {
    input.up = true;
  }

  // Brace with heavy inside KOTH hill or when defending against close opponent
  if (
    (state.config.mode === 'koth' && Math.hypot(bot.x - state.kothX, bot.y - state.kothY) < state.kothRadius * 0.7 && dist < 130) ||
    (dist < 85 && bot.grounded)
  ) {
    input.heavy = true;
  }

  return input;
}
