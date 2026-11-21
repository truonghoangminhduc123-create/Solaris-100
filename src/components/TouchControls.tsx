import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Crosshair, Flame, Radio, Swords, Zap } from 'lucide-react';
import type { WeaponFireMode } from '../../shared/world';

interface TouchControlsProps {
  boost: number;
  equippedWeaponName?: string | null;
  weaponFireMode?: WeaponFireMode | null;
  isThrowable?: boolean;
  throwChargeRatio?: number;
  onMove: (x: number, z: number) => void;
  onSteerDelta: (dx: number, dy: number) => void;
  onDash: () => void;
  onJump: () => void;
  onPulse: () => void;
  onFireStart: () => void;
  onFireMove: (stickX: number, stickY: number) => void;
  onFireEnd: () => void;
}

const JOY_MAX_RADIUS = 46;
const FIRE_MAX_RADIUS = 28;

function safeSetCapture(el: HTMLElement | null, pointerId: number): void {
  if (!el) return;
  try {
    if (!el.hasPointerCapture?.(pointerId)) {
      el.setPointerCapture(pointerId);
    }
  } catch {
    // Ignore pointer capture errors on synthetic/cancelled Android multi-touch pointers
  }
}

function safeReleaseCapture(el: HTMLElement | null, pointerId: number): void {
  if (!el) return;
  try {
    if (el.hasPointerCapture?.(pointerId)) {
      el.releasePointerCapture(pointerId);
    }
  } catch {
    // Ignore release errors if element detached or capture already lost
  }
}

export const TouchControls: React.FC<TouchControlsProps> = React.memo(({
  boost,
  equippedWeaponName = null,
  weaponFireMode = null,
  isThrowable = false,
  throwChargeRatio = 0,
  onMove,
  onSteerDelta,
  onDash,
  onJump,
  onPulse,
  onFireStart,
  onFireMove,
  onFireEnd,
}) => {
  const joyPointerIdRef = useRef<number | null>(null);
  const joyOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const steerPointerIdRef = useRef<number | null>(null);
  const steerLastRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const firePointerIdRef = useRef<number | null>(null);
  const fireOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const pulsePointerIdRef = useRef<number | null>(null);
  const jumpPointerIdRef = useRef<number | null>(null);
  const dashPointerIdRef = useRef<number | null>(null);

  const joyKnobElRef = useRef<HTMLDivElement | null>(null);
  const fireKnobElRef = useRef<HTMLDivElement | null>(null);

  const callbacksRef = useRef({
    onMove,
    onSteerDelta,
    onDash,
    onJump,
    onPulse,
    onFireStart,
    onFireMove,
    onFireEnd,
  });
  callbacksRef.current = {
    onMove,
    onSteerDelta,
    onDash,
    onJump,
    onPulse,
    onFireStart,
    onFireMove,
    onFireEnd,
  };

  const [joyActive, setJoyActive] = useState(false);
  const [joyOrigin, setJoyOrigin] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [dashDown, setDashDown] = useState(false);
  const [jumpDown, setJumpDown] = useState(false);
  const [pulseDown, setPulseDown] = useState(false);
  const [fireDown, setFireDown] = useState(false);

  const updateJoyKnobDom = (kx: number, ky: number) => {
    if (joyKnobElRef.current) {
      joyKnobElRef.current.style.transform = `translate3d(calc(-50% + ${kx.toFixed(1)}px), calc(-50% + ${ky.toFixed(1)}px), 0)`;
    }
  };

  const updateFireKnobDom = (kx: number, ky: number, active: boolean) => {
    if (fireKnobElRef.current) {
      fireKnobElRef.current.style.transform = `translate3d(${kx.toFixed(1)}px, ${ky.toFixed(1)}px, 0) scale(${active ? 1.07 : 1})`;
    }
  };

  const releaseJoy = () => {
    if (joyPointerIdRef.current !== null) {
      joyPointerIdRef.current = null;
    }
    setJoyActive(false);
    updateJoyKnobDom(0, 0);
    callbacksRef.current.onMove(0, 0);
  };

  const releaseSteer = () => {
    steerPointerIdRef.current = null;
  };

  const releaseFire = () => {
    if (firePointerIdRef.current !== null) {
      firePointerIdRef.current = null;
    }
    setFireDown(false);
    updateFireKnobDom(0, 0, false);
    callbacksRef.current.onFireMove(0, 0);
    callbacksRef.current.onFireEnd();
  };

  // Critical fix: if the Fire stick unmounts mid-touch (throwable thrown, weapon broken/dropped),
  // onPointerUp never fires on the removed DOM node. Clear fire state immediately so future touches never lock.
  const hasWeapon = Boolean(equippedWeaponName);
  useEffect(() => {
    if (!hasWeapon && (firePointerIdRef.current !== null || fireDown)) {
      firePointerIdRef.current = null;
      setFireDown(false);
      updateFireKnobDom(0, 0, false);
      callbacksRef.current.onFireMove(0, 0);
      callbacksRef.current.onFireEnd();
    }
  }, [hasWeapon, fireDown]);

  // Global multi-touch failsafe: catch stray pointerup/pointercancel/blur/visibilitychange
  // even if Android Chrome or Samsung OneUI drops pointer capture without firing element events.
  useEffect(() => {
    const resetAll = () => {
      joyPointerIdRef.current = null;
      steerPointerIdRef.current = null;
      pulsePointerIdRef.current = null;
      jumpPointerIdRef.current = null;
      dashPointerIdRef.current = null;
      if (firePointerIdRef.current !== null) {
        firePointerIdRef.current = null;
        callbacksRef.current.onFireMove(0, 0);
        callbacksRef.current.onFireEnd();
      }
      setJoyActive(false);
      updateJoyKnobDom(0, 0);
      setDashDown(false);
      setJumpDown(false);
      setPulseDown(false);
      setFireDown(false);
      updateFireKnobDom(0, 0, false);
      callbacksRef.current.onMove(0, 0);
    };

    const onWindowPointerEnd = (e: PointerEvent) => {
      const id = e.pointerId;
      if (joyPointerIdRef.current === id) {
        joyPointerIdRef.current = null;
        setJoyActive(false);
        updateJoyKnobDom(0, 0);
        callbacksRef.current.onMove(0, 0);
      }
      if (steerPointerIdRef.current === id) {
        steerPointerIdRef.current = null;
      }
      if (firePointerIdRef.current === id) {
        firePointerIdRef.current = null;
        setFireDown(false);
        updateFireKnobDom(0, 0, false);
        callbacksRef.current.onFireMove(0, 0);
        callbacksRef.current.onFireEnd();
      }
      if (pulsePointerIdRef.current === id) {
        pulsePointerIdRef.current = null;
        setPulseDown(false);
      }
      if (jumpPointerIdRef.current === id) {
        jumpPointerIdRef.current = null;
        setJumpDown(false);
      }
      if (dashPointerIdRef.current === id) {
        dashPointerIdRef.current = null;
        setDashDown(false);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) resetAll();
    };

    window.addEventListener('pointerup', onWindowPointerEnd, { passive: true });
    window.addEventListener('pointercancel', onWindowPointerEnd, { passive: true });
    window.addEventListener('blur', resetAll);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointerup', onWindowPointerEnd);
      window.removeEventListener('pointercancel', onWindowPointerEnd);
      window.removeEventListener('blur', resetAll);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resetAll();
    };
  }, []);

  // --- Left Thumb Virtual Joystick (Independent Pointer ID) ---
  const handleJoyPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== null && joyPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    safeSetCapture(e.currentTarget, e.pointerId);
    joyPointerIdRef.current = e.pointerId;
    joyOriginRef.current = { x: e.clientX, y: e.clientY };
    setJoyOrigin({ x: e.clientX, y: e.clientY });
    setJoyActive(true);
    updateJoyKnobDom(0, 0);
    onMove(0, 0);
  };

  const handleJoyPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - joyOriginRef.current.x;
    const dy = e.clientY - joyOriginRef.current.y;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(JOY_MAX_RADIUS, dist);
    const angle = Math.atan2(dy, dx);
    const kx = dist > 0.001 ? Math.cos(angle) * clampedDist : 0;
    const ky = dist > 0.001 ? Math.sin(angle) * clampedDist : 0;

    updateJoyKnobDom(kx, ky);
    const normX = kx / JOY_MAX_RADIUS;
    const normZ = -ky / JOY_MAX_RADIUS;
    onMove(normX, normZ);
  };

  const handleJoyPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    safeReleaseCapture(e.currentTarget, e.pointerId);
    releaseJoy();
  };

  // --- Right Side Swipe 360 Camera/Yaw+Pitch Steering (Independent Pointer ID) ---
  const handleSteerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (steerPointerIdRef.current !== null && steerPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    safeSetCapture(e.currentTarget, e.pointerId);
    steerPointerIdRef.current = e.pointerId;
    steerLastRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleSteerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (steerPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - steerLastRef.current.x;
    const dy = e.clientY - steerLastRef.current.y;
    steerLastRef.current = { x: e.clientX, y: e.clientY };
    onSteerDelta(dx, dy);
  };

  const handleSteerPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (steerPointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    safeReleaseCapture(e.currentTarget, e.pointerId);
    releaseSteer();
  };

  // --- Real Gamepad Analog FIRE Thumbstick (Normalized [-1..1] Continuous Camera Pan + Smart Fire) ---
  const handleFirePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (firePointerIdRef.current !== null && firePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    safeSetCapture(e.currentTarget, e.pointerId);
    firePointerIdRef.current = e.pointerId;
    fireOriginRef.current = { x: e.clientX, y: e.clientY };
    setFireDown(true);
    updateFireKnobDom(0, 0, true);
    onFireMove(0, 0);
    onFireStart();
  };

  const handleFirePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (firePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();

    const ox = e.clientX - fireOriginRef.current.x;
    const oy = e.clientY - fireOriginRef.current.y;
    const dist = Math.hypot(ox, oy);
    const clampedDist = Math.min(FIRE_MAX_RADIUS, dist);
    const angle = Math.atan2(oy, ox);
    const kx = dist > 0.5 ? Math.cos(angle) * clampedDist : 0;
    const ky = dist > 0.5 ? Math.sin(angle) * clampedDist : 0;

    updateFireKnobDom(kx, ky, true);
    onFireMove(kx / FIRE_MAX_RADIUS, ky / FIRE_MAX_RADIUS);
  };

  const handleFirePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (firePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    safeReleaseCapture(e.currentTarget, e.pointerId);
    releaseFire();
  };

  const fireModeLabel =
    weaponFireMode === 'throw'
      ? '3.0s'
      : weaponFireMode === 'auto'
      ? 'AUTO'
      : weaponFireMode === 'melee'
      ? 'NEAR'
      : 'AIM';

  const canDash = boost >= 20;
  const canPulse = boost >= 32;

  return (
    <div className="pointer-events-none absolute inset-0 z-[25] overflow-hidden touch-none select-none">
      {/* Left Half: Floating Virtual Movement Joystick Zone */}
      <div
        onPointerDown={handleJoyPointerDown}
        onPointerMove={handleJoyPointerMove}
        onPointerUp={handleJoyPointerEnd}
        onPointerCancel={handleJoyPointerEnd}
        onLostPointerCapture={handleJoyPointerEnd}
        className="pointer-events-auto absolute bottom-0 left-0 top-24 w-1/2 touch-none"
        aria-label="Movement joystick area"
      >
        {!joyActive && (
          <div className="pointer-events-none absolute bottom-4 left-4 sm:bottom-6 sm:left-6 flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full border border-white/20 bg-[#12141a]/45 backdrop-blur-sm">
            <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full border border-white/35 bg-[#f4efe6]/20" />
          </div>
        )}
      </div>

      {/* Active Floating Joystick Visual */}
      {joyActive && (
        <div
          className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#e68a1e]/75 bg-[#12141a]/55 backdrop-blur-sm"
          style={{
            left: joyOrigin.x,
            top: joyOrigin.y,
            width: JOY_MAX_RADIUS * 2 + 16,
            height: JOY_MAX_RADIUS * 2 + 16,
          }}
        >
          <div
            ref={joyKnobElRef}
            className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60 bg-[#e68a1e]/85 shadow-lg"
            style={{
              transform: 'translate3d(-50%, -50%, 0)',
              willChange: 'transform',
            }}
          />
        </div>
      )}

      {/* Right Half: 360 Drag-to-Steer Zone */}
      <div
        onPointerDown={handleSteerPointerDown}
        onPointerMove={handleSteerPointerMove}
        onPointerUp={handleSteerPointerEnd}
        onPointerCancel={handleSteerPointerEnd}
        onLostPointerCapture={handleSteerPointerEnd}
        className="pointer-events-auto absolute bottom-0 right-0 top-24 w-1/2 touch-none"
        aria-label="Camera steering area"
      />

      {/* Right Thumb Multi-Touch Action Cluster (z-[32] stays above HUD dock so edges never block touch) */}
      <div className="pointer-events-none fixed bottom-2.5 right-2 sm:bottom-5 sm:right-5 z-[32] flex items-end gap-1.5 sm:gap-3">
        <div className="flex flex-col items-center gap-1.5 sm:gap-2">
          {/* Real Gamepad Analog Fire Thumbstick */}
          {equippedWeaponName && (
            <div
              role="button"
              onPointerDown={handleFirePointerDown}
              onPointerMove={handleFirePointerMove}
              onPointerUp={handleFirePointerEnd}
              onPointerCancel={handleFirePointerEnd}
              onLostPointerCapture={handleFirePointerEnd}
              className={`pointer-events-auto relative flex h-[76px] w-[76px] min-[420px]:h-[84px] min-[420px]:w-[84px] sm:h-[94px] sm:w-[94px] items-center justify-center rounded-full border-2 backdrop-blur-md shadow-2xl touch-none select-none ${
                fireDown
                  ? 'border-[#facc15] bg-[#12141a]/88'
                  : isThrowable
                  ? 'border-[#fb923c]/85 bg-[#12141a]/78'
                  : 'border-[#ef4444]/85 bg-[#12141a]/78'
              }`}
              aria-label={`Gamepad fire joystick for ${equippedWeaponName}`}
            >
              {/* Concentric Gamepad Socket Track */}
              <div className="pointer-events-none absolute inset-2 sm:inset-2.5 rounded-full border border-white/15 bg-black/25" />
              {/* 4-Way Directional Socket Ticks */}
              <span className="pointer-events-none absolute top-1.5 left-1/2 h-1.5 w-0.5 -translate-x-1/2 rounded-full bg-white/35" />
              <span className="pointer-events-none absolute bottom-1.5 left-1/2 h-1.5 w-0.5 -translate-x-1/2 rounded-full bg-white/35" />
              <span className="pointer-events-none absolute left-1.5 top-1/2 h-0.5 w-1.5 -translate-y-1/2 rounded-full bg-white/35" />
              <span className="pointer-events-none absolute right-1.5 top-1/2 h-0.5 w-1.5 -translate-y-1/2 rounded-full bg-white/35" />

              {/* Circular 3.0s charge progress ring for Throwables */}
              {isThrowable && throwChargeRatio > 0 && (
                <svg className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 64 64">
                  <circle
                    cx="32"
                    cy="32"
                    r="29"
                    fill="none"
                    stroke="#facc15"
                    strokeWidth="4"
                    strokeDasharray={182.2}
                    strokeDashoffset={182.2 * (1 - Math.min(1, throwChargeRatio))}
                    strokeLinecap="round"
                  />
                </svg>
              )}

              {/* Tactile Analog Thumbstick Cap */}
              <div
                ref={fireKnobElRef}
                className={`pointer-events-none flex h-10 w-10 min-[420px]:h-11 min-[420px]:w-11 sm:h-12 sm:w-12 flex-col items-center justify-center rounded-full border-2 shadow-[0_4px_14px_rgba(0,0,0,0.65),inset_0_2px_6px_rgba(255,255,255,0.28)] ${
                  fireDown ? '' : 'transition-transform duration-150 ease-out'
                } ${
                  fireDown
                    ? 'border-[#fef08a] bg-[#ef4444] text-white'
                    : isThrowable
                    ? 'border-[#fed7aa]/80 bg-[#ea580c]/92 text-white'
                    : weaponFireMode === 'melee'
                    ? 'border-[#bae6fd]/80 bg-[#0284c7]/90 text-white'
                    : 'border-white/65 bg-[#dc2626]/90 text-white'
                }`}
                style={{
                  transform: `translate3d(0px, 0px, 0) scale(${fireDown ? 1.07 : 1})`,
                  willChange: 'transform',
                }}
              >
                {isThrowable ? (
                  <Flame className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : weaponFireMode === 'melee' ? (
                  <Swords className="h-4 w-4 sm:h-5 sm:w-5" />
                ) : (
                  <Crosshair className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
                <span className="mt-0.5 text-[7px] sm:text-[8px] font-extrabold leading-none tracking-wider uppercase">
                  {fireModeLabel}
                </span>
              </div>
            </div>
          )}

          {/* Pulse Button */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              safeSetCapture(e.currentTarget, e.pointerId);
              pulsePointerIdRef.current = e.pointerId;
              setPulseDown(true);
              onPulse();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              safeReleaseCapture(e.currentTarget, e.pointerId);
              if (pulsePointerIdRef.current === e.pointerId) pulsePointerIdRef.current = null;
              setPulseDown(false);
            }}
            onPointerCancel={(e) => {
              if (pulsePointerIdRef.current === e.pointerId) pulsePointerIdRef.current = null;
              setPulseDown(false);
            }}
            onLostPointerCapture={(e) => {
              if (pulsePointerIdRef.current === e.pointerId) pulsePointerIdRef.current = null;
              setPulseDown(false);
            }}
            className={`pointer-events-auto ios-btn flex h-10 w-10 sm:h-13 sm:w-13 flex-col items-center justify-center rounded-full border backdrop-blur-md text-[9px] sm:text-[10px] font-bold tracking-wide touch-none select-none ${
              pulseDown ? 'scale-90' : 'scale-100'
            } ${
              canPulse
                ? 'border-[#38bdf8]/75 bg-[#12141a]/82 text-[#38bdf8]'
                : 'border-white/15 bg-[#12141a]/60 text-[#6b7280]'
            }`}
            aria-label="Gravity Pulse"
          >
            <Radio className="pointer-events-none h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* Jump + Dash stacked ergonomics */}
        <div className="flex flex-col items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              safeSetCapture(e.currentTarget, e.pointerId);
              jumpPointerIdRef.current = e.pointerId;
              setJumpDown(true);
              onJump();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              safeReleaseCapture(e.currentTarget, e.pointerId);
              if (jumpPointerIdRef.current === e.pointerId) jumpPointerIdRef.current = null;
              setJumpDown(false);
            }}
            onPointerCancel={(e) => {
              if (jumpPointerIdRef.current === e.pointerId) jumpPointerIdRef.current = null;
              setJumpDown(false);
            }}
            onLostPointerCapture={(e) => {
              if (jumpPointerIdRef.current === e.pointerId) jumpPointerIdRef.current = null;
              setJumpDown(false);
            }}
            className={`pointer-events-auto ios-btn flex h-11 w-11 sm:h-13 sm:w-13 items-center justify-center rounded-full border border-white/25 bg-[#12141a]/82 backdrop-blur-md text-[#f4efe6] touch-none select-none ${
              jumpDown ? 'scale-90 border-[#38bdf8]' : 'scale-100'
            }`}
            aria-label="Jump"
          >
            <ArrowUp className="pointer-events-none h-4 w-4 sm:h-5 sm:w-5 text-[#38bdf8]" />
          </button>

          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              safeSetCapture(e.currentTarget, e.pointerId);
              dashPointerIdRef.current = e.pointerId;
              setDashDown(true);
              onDash();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              safeReleaseCapture(e.currentTarget, e.pointerId);
              if (dashPointerIdRef.current === e.pointerId) dashPointerIdRef.current = null;
              setDashDown(false);
            }}
            onPointerCancel={(e) => {
              if (dashPointerIdRef.current === e.pointerId) dashPointerIdRef.current = null;
              setDashDown(false);
            }}
            onLostPointerCapture={(e) => {
              if (dashPointerIdRef.current === e.pointerId) dashPointerIdRef.current = null;
              setDashDown(false);
            }}
            className={`pointer-events-auto ios-btn flex h-13 w-13 min-[420px]:h-14 min-[420px]:w-14 sm:h-[68px] sm:w-[68px] items-center justify-center rounded-full border-2 backdrop-blur-md shadow-lg touch-none select-none ${
              dashDown ? 'scale-90' : 'scale-100'
            } ${
              canDash
                ? 'border-[#fbbf24] bg-[#e68a1e]/92 text-[#12141a]'
                : 'border-white/20 bg-[#12141a]/75 text-[#9ca3af]'
            }`}
            aria-label="Kinetic Dash"
          >
            {equippedWeaponName ? (
              <Zap className="pointer-events-none h-5 w-5 sm:h-6 sm:w-6" />
            ) : (
              <Swords className="pointer-events-none h-5 w-5 sm:h-6 sm:w-6" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
