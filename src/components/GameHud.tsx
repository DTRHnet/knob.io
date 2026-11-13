import React from 'react';
import { ArcadeModifier, GameMode, PlayerState } from '../game/types';

export interface HudSnapshot {
  timeRemaining: number;
  mode: GameMode;
  mapName: string;
  arcadeModifier: ArcadeModifier;
  advancedPhysics: boolean;
  players: Array<{
    id: string;
    name: string;
    color: string;
    stocks: number;
    alive: boolean;
    knockouts: number;
    objectiveScore: number;
    isHuman: boolean;
    hasFlag: boolean;
  }>;
  humanAlive: boolean;
}

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  spectatorMode: boolean;
  touchControlsEnabled: boolean;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onRestart: () => void;
  onToggleSpectatorCam: () => void;
  onToggleTouchControls: () => void;
  onTouchInput: (key: 'left' | 'right' | 'up' | 'down' | 'heavy' | 'emote', pressed: boolean) => void;
}

const MODIFIER_NAME: Record<ArcadeModifier, string> = {
  none: '',
  low_g: 'Low Gravity',
  bumper_chaos: 'Bumper Mania',
  heavy_clash: 'Heavy Clash',
  hyper_bounce: 'Hyper Bounce',
};

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  muted,
  spectatorMode,
  touchControlsEnabled,
  onToggleMute,
  onTogglePause,
  onRestart,
  onToggleSpectatorCam,
  onToggleTouchControls,
  onTouchInput,
}) => {
  const mins = Math.floor(hud.timeRemaining / 60);
  const secs = Math.floor(hud.timeRemaining % 60)
    .toString()
    .padStart(2, '0');

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5 select-none">
      {/* Top Perimeter Row: Left Info Cluster + Right Utility Controls */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        {/* Top-Left Compact Match Readout */}
        <div
          className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg border border-white/10 min-w-0"
          style={{ background: 'rgba(14, 18, 27, 0.86)' }}
        >
          <div className="flex items-baseline gap-2 sm:gap-3 min-w-0">
            <span
              className="text-lg sm:text-3xl font-bold tabular-nums text-white leading-none shrink-0"
              style={{ fontFamily: 'var(--font-mono)', paintOrder: 'stroke fill' }}
            >
              {mins}:{secs}
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-300 font-medium min-w-0">
              <span className="uppercase tracking-wider text-slate-400 shrink-0">{hud.mode}</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="text-slate-100 truncate max-w-[85px] sm:max-w-none hidden sm:inline">{hud.mapName}</span>
              {hud.arcadeModifier !== 'none' && (
                <>
                  <span aria-hidden="true" className="hidden md:inline">·</span>
                  <span className="text-amber-400 hidden md:inline">{MODIFIER_NAME[hud.arcadeModifier]}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Top-Right Compact Utility Icon Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0">
          <button
            type="button"
            tabIndex={-1}
            aria-label={touchControlsEnabled ? 'Hide Touch Pad' : 'Show Touch Pad'}
            title="Toggle Touch Controls"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleTouchControls();
            }}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-white/15 text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
            style={{ background: 'rgba(14, 18, 27, 0.86)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="6" width="20" height="12" rx="3" />
              <path d="M6 12h4M8 10v4M15 11h.01M18 13h.01" strokeLinecap="round" />
            </svg>
          </button>

          {(!hud.humanAlive || spectatorMode) && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Toggle Spectator Camera"
              title="Spectator Camera (V)"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleSpectatorCam();
              }}
              className="px-2.5 h-8 sm:h-9 flex items-center justify-center rounded-lg border border-cyan-400/40 text-cyan-200 text-xs font-semibold hover:bg-cyan-500/20 transition-colors cursor-pointer whitespace-nowrap"
              style={{ background: 'rgba(14, 18, 27, 0.88)' }}
            >
              {spectatorMode ? 'Free Cam' : 'Spectate'}
            </button>
          )}

          <button
            type="button"
            tabIndex={-1}
            aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
            title="Mute (M)"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-white/15 text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
            style={{ background: 'rgba(14, 18, 27, 0.86)' }}
          >
            {muted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M23 9l-6 6M17 9l6 6" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z" />
                <path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" strokeLinecap="round" />
              </svg>
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Restart Match"
            title="Restart (R)"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-white/15 text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
            style={{ background: 'rgba(14, 18, 27, 0.86)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" strokeLinecap="round" />
              <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause Game"
            title="Pause (Esc / P)"
            onClick={(e) => {
              e.currentTarget.blur();
              onTogglePause();
            }}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-white/15 text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
            style={{ background: 'rgba(14, 18, 27, 0.86)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom Perimeter Row: Player Stock & Objective Strip + Optional Touch Controls */}
      <div className="flex flex-col gap-3">
        {touchControlsEnabled && (
          <div className="flex items-end justify-between gap-4 pointer-events-auto pb-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Move Left"
                onPointerDown={() => onTouchInput('left', true)}
                onPointerUp={() => onTouchInput('left', false)}
                onPointerLeave={() => onTouchInput('left', false)}
                className="w-12 h-12 rounded-xl border border-white/20 text-white font-bold text-lg active:bg-white/20"
                style={{ background: 'rgba(14, 18, 27, 0.85)' }}
              >
                ◀
              </button>
              <button
                type="button"
                aria-label="Move Right"
                onPointerDown={() => onTouchInput('right', true)}
                onPointerUp={() => onTouchInput('right', false)}
                onPointerLeave={() => onTouchInput('right', false)}
                className="w-12 h-12 rounded-xl border border-white/20 text-white font-bold text-lg active:bg-white/20"
                style={{ background: 'rgba(14, 18, 27, 0.85)' }}
              >
                ▶
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Emote"
                onPointerDown={() => onTouchInput('emote', true)}
                onPointerUp={() => onTouchInput('emote', false)}
                className="px-3 h-12 rounded-xl border border-white/20 text-slate-200 font-semibold text-xs active:bg-white/20"
                style={{ background: 'rgba(14, 18, 27, 0.85)' }}
              >
                Emote
              </button>
              <button
                type="button"
                aria-label="Heavy Mode"
                onPointerDown={() => onTouchInput('heavy', true)}
                onPointerUp={() => onTouchInput('heavy', false)}
                onPointerLeave={() => onTouchInput('heavy', false)}
                className="px-4 h-12 rounded-xl border border-amber-400/40 text-amber-200 font-bold text-xs active:bg-amber-500/30"
                style={{ background: 'rgba(14, 18, 27, 0.85)' }}
              >
                HEAVY
              </button>
              <button
                type="button"
                aria-label="Jump"
                onPointerDown={() => onTouchInput('up', true)}
                onPointerUp={() => onTouchInput('up', false)}
                onPointerLeave={() => onTouchInput('up', false)}
                className="w-14 h-12 rounded-xl bg-[#FF4D3D] text-white font-bold text-xs active:scale-95"
              >
                JUMP
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {hud.players.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-white/10"
              style={{
                background: p.isHuman ? 'rgba(24, 33, 52, 0.92)' : 'rgba(14, 18, 27, 0.84)',
                opacity: p.stocks > 0 || p.alive ? 1 : 0.45,
              }}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-white/50"
                style={{ backgroundColor: p.color }}
              />
              <span className="text-xs font-semibold text-slate-100 whitespace-nowrap">
                {p.name}
              </span>

              {/* Stock Pips */}
              <div className="flex items-center gap-1" aria-label={`${p.stocks} stocks`}>
                {[0, 1, 2].map((idx) => (
                  <span
                    key={idx}
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: idx < p.stocks ? p.color : 'rgba(148, 163, 184, 0.25)',
                    }}
                  />
                ))}
              </div>

              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {hud.mode === 'koth'
                  ? `${Math.round(p.objectiveScore)}%`
                  : hud.mode === 'ctf'
                  ? `${p.objectiveScore}/3`
                  : `${p.knockouts} KO`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
