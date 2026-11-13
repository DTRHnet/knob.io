import React from 'react';
import { GameMode, PlayerProfile } from '../game/types';

interface TitleScreenProps {
  profile: PlayerProfile;
  selectedMapName: string;
  selectedMode: GameMode;
  advancedPhysics: boolean;
  onStartPlay: () => void;
  onOpenLobbies: () => void;
  onOpenStudio: () => void;
}

const MODE_LABELS: Record<GameMode, string> = {
  classic: 'Classic Knockout',
  survival: 'Survival Ring',
  koth: 'King of the Hill',
  ctf: 'Capture the Core',
  arcade: 'Arcade Chaos',
};

export const TitleScreen: React.FC<TitleScreenProps> = ({
  profile,
  selectedMapName,
  selectedMode,
  advancedPhysics,
  onStartPlay,
  onOpenLobbies,
  onOpenStudio,
}) => {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none select-none">
      {/* Left calm negative-space gradient scrim so typography has >= 4.5:1 contrast over the live physics showcase */}
      <div
        className="absolute inset-y-0 left-0 w-full md:w-[56%] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(11,15,24,0.94) 0%, rgba(11,15,24,0.82) 62%, rgba(11,15,24,0) 100%)',
        }}
      />

      <div className="relative z-10 flex-1 flex items-center px-6 sm:px-12 lg:px-16 max-w-2xl">
        <div className="pointer-events-auto flex flex-col items-start gap-6">
          {/* Bespoke inline SVG Title Lockup */}
          <div className="flex items-center gap-4">
            <svg
              width="58"
              height="58"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <circle cx="32" cy="32" r="28" stroke="#FF4D3D" strokeWidth="3" strokeDasharray="8 5" />
              <circle cx="26" cy="34" r="14" fill="#F59E0B" stroke="#F8FAFC" strokeWidth="3" />
              <circle cx="24" cy="31" r="2" fill="#0F172A" />
              <circle cx="30" cy="31" r="2" fill="#0F172A" />
              <circle cx="44" cy="22" r="8" fill="#06B6D4" stroke="#F8FAFC" strokeWidth="2.5" />
              <path d="M35 28L40 24" stroke="#F8FAFC" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <div>
              <h1
                className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white leading-none"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                KNOB<span className="text-[#FF4D3D]">.IO</span>
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300 font-medium">
                <span>{profile.handle}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{profile.tier} ({profile.mmr} MMR)</span>
                <span aria-hidden="true">·</span>
                <span>{profile.season}</span>
              </div>
            </div>
          </div>

          <p className="text-base sm:text-lg text-slate-300 max-w-md leading-relaxed text-balance">
            Pure circle-bouncing physics across ice, springs, conveyors, magnetic wells, and destructible arenas.
          </p>

          {/* Current Queue Summary (unboxed clean metadata) */}
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span className="text-white font-semibold">{MODE_LABELS[selectedMode]}</span>
            <span aria-hidden="true">·</span>
            <span>{selectedMapName}</span>
            <span aria-hidden="true">·</span>
            <span>{advancedPhysics ? 'Advanced Physics On' : 'Classic Physics'}</span>
          </div>

          {/* Exactly <= 3 clean menu actions */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              data-start="true"
              onClick={onStartPlay}
              className="px-7 py-3.5 bg-[#FF4D3D] hover:bg-[#ff6152] active:scale-[0.98] text-white font-bold text-base rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{ boxShadow: '0 8px 24px rgba(255, 77, 61, 0.32)' }}
            >
              Play Now
            </button>

            <button
              type="button"
              onClick={onOpenLobbies}
              className="px-5 py-3.5 bg-[#1B2335] hover:bg-[#253047] text-slate-100 font-semibold text-sm rounded-lg border border-slate-700/80 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Lobbies & Modes
            </button>

            <button
              type="button"
              onClick={onOpenStudio}
              className="px-5 py-3.5 bg-[#1B2335] hover:bg-[#253047] text-slate-100 font-semibold text-sm rounded-lg border border-slate-700/80 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Studio & Profile
            </button>
          </div>
        </div>
      </div>

      {/* Single flat borderless control hint in bottom safe margin */}
      <div className="relative z-10 px-6 sm:px-12 lg:px-16 pb-5 text-xs text-slate-400 font-mono tracking-tight">
        WASD / Arrows Move · Space / Up Jump & Double Jump · Q/F or Mouse Spin/Aim Knob · Shift / X Heavy · E Emote
      </div>
    </div>
  );
};
