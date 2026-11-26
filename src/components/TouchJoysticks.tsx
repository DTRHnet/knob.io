import React, { useEffect, useRef, useState } from 'react';

export type TouchInputKey =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'heavy'
  | 'emote'
  | 'spinLeft'
  | 'spinRight';

interface TouchJoysticksProps {
  onTouchInput: (key: TouchInputKey, pressed: boolean) => void;
}

const TRAVEL = 40; // px the knob can travel from centre
const DEADZONE = 0.35; // fraction of travel before an input engages
const TAP_MS = 260; // max press duration that still counts as a tap
const TAP_SLOP = 14; // max movement (px) that still counts as a tap
const HEAVY_PULSE_MS = 180; // how long a tap holds Heavy for

interface Gesture {
  pointerId: number | null;
  centerX: number;
  centerY: number;
  startX: number;
  startY: number;
  startT: number;
  maxDist: number;
}

const idleGesture = (): Gesture => ({
  pointerId: null,
  centerX: 0,
  centerY: 0,
  startX: 0,
  startY: 0,
  startT: 0,
  maxDist: 0,
});

interface StickProps {
  kind: 'spin' | 'jump';
  onTouchInput: (key: TouchInputKey, pressed: boolean) => void;
}

const Stick: React.FC<StickProps> = ({ kind, onTouchInput }) => {
  const knobRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<Gesture>(idleGesture());
  const applied = useRef<Partial<Record<TouchInputKey, boolean>>>({});
  const heavyTimer = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [heavyFlash, setHeavyFlash] = useState(false);

  const setKey = (key: TouchInputKey, pressed: boolean) => {
    if (applied.current[key] === pressed) return;
    applied.current[key] = pressed;
    onTouchInput(key, pressed);
  };

  const applyAxes = (nx: number, ny: number) => {
    if (kind === 'spin') {
      // Horizontal: spin the knob. Movement is coupled to the same
      // direction (push left = spin + roll left), matching how the
      // character plays with A/D + Q/F held together on a keyboard.
      setKey('spinLeft', nx < -DEADZONE);
      setKey('left', nx < -DEADZONE);
      setKey('spinRight', nx > DEADZONE);
      setKey('right', nx > DEADZONE);
    } else {
      // Vertical: push up to jump, pull down for down/fast-fall.
      setKey('up', ny < -DEADZONE);
      setKey('down', ny > DEADZONE);
    }
  };

  const clearAxes = () => {
    if (kind === 'spin') {
      setKey('spinLeft', false);
      setKey('left', false);
      setKey('spinRight', false);
      setKey('right', false);
    } else {
      setKey('up', false);
      setKey('down', false);
    }
  };

  const pulseHeavy = () => {
    onTouchInput('heavy', true);
    setHeavyFlash(true);
    if (heavyTimer.current !== null) window.clearTimeout(heavyTimer.current);
    heavyTimer.current = window.setTimeout(() => {
      onTouchInput('heavy', false);
      setHeavyFlash(false);
      heavyTimer.current = null;
    }, HEAVY_PULSE_MS);
  };

  const setKnobOffset = (dx: number, dy: number) => {
    const knob = knobRef.current;
    if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g.pointerId !== null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    g.pointerId = e.pointerId;
    g.centerX = rect.left + rect.width / 2;
    g.centerY = rect.top + rect.height / 2;
    g.startX = e.clientX;
    g.startY = e.clientY;
    g.startT = performance.now();
    g.maxDist = 0;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture is a nicety; handlers still work without it
    }
    setActive(true);
    onPointerMove(e);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g.pointerId !== e.pointerId) return;
    let dx = e.clientX - g.centerX;
    let dy = e.clientY - g.centerY;
    const dist = Math.hypot(dx, dy);
    g.maxDist = Math.max(g.maxDist, Math.hypot(e.clientX - g.startX, e.clientY - g.startY));
    if (dist > TRAVEL) {
      dx = (dx / dist) * TRAVEL;
      dy = (dy / dist) * TRAVEL;
    }
    // The spin stick is a horizontal control and the jump stick is
    // vertical, so the knob only travels along its own axis.
    if (kind === 'spin') dy = 0;
    else dx = 0;
    setKnobOffset(dx, dy);
    applyAxes(dx / TRAVEL, dy / TRAVEL);
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (g.pointerId !== e.pointerId) return;
    const wasTap =
      performance.now() - g.startT <= TAP_MS && g.maxDist <= TAP_SLOP;
    gesture.current = idleGesture();
    setActive(false);
    setKnobOffset(0, 0);
    clearAxes();
    if (wasTap) pulseHeavy();
  };

  useEffect(
    () => () => {
      if (heavyTimer.current !== null) window.clearTimeout(heavyTimer.current);
      clearAxes();
      onTouchInput('heavy', false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        role="application"
        aria-label={
          kind === 'spin'
            ? 'Spin joystick. Push left or right to spin, quick tap for Heavy.'
            : 'Jump joystick. Push up to jump, down to drop, quick tap for Heavy.'
        }
        className="pointer-events-auto touch-none relative w-32 h-32 rounded-full border"
        style={{
          background: 'rgba(10, 14, 22, 0.38)',
          borderColor: active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)',
          backdropFilter: 'blur(2px)',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        {kind === 'spin' ? (
          <>
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/50 text-lg select-none">
              ↺
            </span>
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 text-lg select-none">
              ↻
            </span>
          </>
        ) : (
          <>
            <span className="absolute top-1.5 left-1/2 -translate-x-1/2 text-white/50 text-sm select-none">
              ▲
            </span>
            <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-white/50 text-sm select-none">
              ▼
            </span>
          </>
        )}
        <div
          ref={knobRef}
          className="absolute left-1/2 top-1/2 w-14 h-14 rounded-full border border-white/40"
          style={{
            marginLeft: -28,
            marginTop: -28,
            background: heavyFlash
              ? 'rgba(251, 191, 36, 0.5)'
              : active
              ? 'rgba(255,255,255,0.35)'
              : 'rgba(255,255,255,0.22)',
          }}
        />
      </div>
      <span className="text-[10px] font-mono tracking-widest text-white/55 select-none">
        {kind === 'spin' ? 'SPIN · TAP = HEAVY' : 'JUMP · TAP = HEAVY'}
      </span>
    </div>
  );
};

/**
 * PSX-emulator-style twin virtual joysticks for touch play.
 * Left stick: spin left/right (coupled with roll movement).
 * Right stick: jump up / drop down. A quick tap on either stick
 * fires Heavy. Semi-transparent so the arena stays visible.
 */
export const TouchJoysticks: React.FC<TouchJoysticksProps> = ({ onTouchInput }) => {
  const inputRef = useRef(onTouchInput);
  inputRef.current = onTouchInput;
  const stableInput = useRef((key: TouchInputKey, pressed: boolean) =>
    inputRef.current(key, pressed)
  ).current;

  useEffect(
    () => () => {
      (
        ['left', 'right', 'up', 'down', 'heavy', 'spinLeft', 'spinRight'] as TouchInputKey[]
      ).forEach((k) => inputRef.current(k, false));
    },
    []
  );

  return (
    <div className="absolute inset-x-0 bottom-24 flex items-end justify-between px-4 sm:px-8 pointer-events-none">
      <Stick kind="spin" onTouchInput={stableInput} />
      <div className="flex flex-col items-end gap-3">
        <button
          type="button"
          aria-label="Emote"
          onPointerDown={() => stableInput('emote', true)}
          onPointerUp={() => stableInput('emote', false)}
          onPointerLeave={() => stableInput('emote', false)}
          className="pointer-events-auto touch-none px-3 h-10 rounded-full border border-white/25 text-slate-100/80 font-semibold text-[11px] active:bg-white/20"
          style={{ background: 'rgba(10, 14, 22, 0.38)', backdropFilter: 'blur(2px)' }}
        >
          Emote
        </button>
        <Stick kind="jump" onTouchInput={stableInput} />
      </div>
    </div>
  );
};
