import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { BellRing } from 'lucide-react';

// This hook runs once in the provider, independently of the currently visible page.
function useTimerController() {
  const [totalSeconds, setTotalSeconds] = useState<number>(150); // Default 2:30 (fries)
  const [remainingMs, setRemainingMs] = useState<number>(150 * 1000);
  const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'done'>('idle');
  const [activePresetId, setActivePresetId] = useState<string>('2m30');
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const endTimeRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<number | null>(null);

  // Ensure Web Audio context is created & resumed on user interaction
  const unlockAudio = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  };

  // Play crisp triple kitchen bell chime via Web Audio API
  const playKitchenBell = () => {
    if (isMuted) return;
    const ctx = unlockAudio();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 880, start: 0, dur: 0.22 },
        { freq: 1174.66, start: 0.2, dur: 0.22 },
        { freq: 1567.98, start: 0.4, dur: 0.48 },
      ];

      notes.forEach((n) => {
        const osc = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, now + n.start);

        overtone.type = 'triangle';
        overtone.frequency.setValueAtTime(n.freq * 2, now + n.start);

        const overtoneGain = ctx.createGain();
        overtoneGain.gain.setValueAtTime(0.18, now + n.start);

        gain.gain.setValueAtTime(0.001, now + n.start);
        gain.gain.exponentialRampToValueAtTime(0.42, now + n.start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);

        osc.connect(gain);
        overtone.connect(overtoneGain);
        overtoneGain.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + n.start);
        overtone.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.03);
        overtone.stop(now + n.start + n.dur + 0.03);
      });
    } catch {
      // Ignore audio autoplay block if any
    }
  };

  const stopAlarmLoop = () => {
    if (alarmIntervalRef.current !== null) {
      window.clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
  };

  // Drift-free countdown loop
  useEffect(() => {
    if (status !== 'running') return;

    const tick = () => {
      if (!endTimeRef.current) return;
      const diff = endTimeRef.current - Date.now();
      if (diff <= 0) {
        setRemainingMs(0);
        endTimeRef.current = null;
        setStatus('done');
      } else {
        setRemainingMs(diff);
      }
    };

    tick();
    const id = window.setInterval(tick, 150);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [status]);

  // Repeating alarm when timer finishes
  useEffect(() => {
    if (status === 'done') {
      playKitchenBell();
      alarmIntervalRef.current = window.setInterval(() => {
        playKitchenBell();
      }, 2800);
      return () => stopAlarmLoop();
    } else {
      stopAlarmLoop();
    }
  }, [status, isMuted]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopAlarmLoop();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const startDuration = (secs: number, presetId: string) => {
    if (secs <= 0) return;
    unlockAudio();
    stopAlarmLoop();
    setTotalSeconds(secs);
    setRemainingMs(secs * 1000);
    setActivePresetId(presetId);
    endTimeRef.current = Date.now() + secs * 1000;
    setStatus('running');
  };

  const handleTogglePlayPause = () => {
    unlockAudio();
    if (status === 'running') {
      const left = endTimeRef.current ? Math.max(0, endTimeRef.current - Date.now()) : remainingMs;
      setRemainingMs(left);
      endTimeRef.current = null;
      setStatus('paused');
    } else if (status === 'paused' || status === 'idle') {
      const startMs = remainingMs > 0 ? remainingMs : totalSeconds * 1000;
      setRemainingMs(startMs);
      endTimeRef.current = Date.now() + startMs;
      setStatus('running');
    } else if (status === 'done') {
      stopAlarmLoop();
      setRemainingMs(totalSeconds * 1000);
      setStatus('idle');
    }
  };

  const handleReset = () => {
    stopAlarmLoop();
    endTimeRef.current = null;
    setRemainingMs(totalSeconds * 1000);
    setStatus('idle');
  };

  const handleAdd30Sec = () => {
    unlockAudio();
    const extraMs = 30 * 1000;
    setTotalSeconds((prev) => prev + 30);
    if (status === 'running' && endTimeRef.current) {
      endTimeRef.current += extraMs;
      setRemainingMs(Math.max(0, endTimeRef.current - Date.now()));
    } else if (status === 'done') {
      stopAlarmLoop();
      setTotalSeconds(30);
      setRemainingMs(extraMs);
      endTimeRef.current = Date.now() + extraMs;
      setStatus('running');
    } else {
      setRemainingMs((prev) => prev + extraMs);
    }
  };

  return {
    totalSeconds, remainingMs, status, activePresetId, isMuted,
    setIsMuted, unlockAudio, playKitchenBell, startDuration,
    handleTogglePlayPause, handleReset, handleAdd30Sec,
  };
}

const KitchenTimerContext = createContext<ReturnType<typeof useTimerController> | null>(null);

export function KitchenTimerProvider({ children }: { children: React.ReactNode }) {
  const timer = useTimerController();

  return (
    <KitchenTimerContext.Provider value={timer}>
      {children}
      {timer.status === 'done' && (
        <div
          role="alert"
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-2xl border border-rose-400 bg-rose-50 px-4 py-3 text-rose-800 shadow-xl"
        >
          <BellRing className="h-5 w-5 shrink-0" />
          <span className="text-sm font-bold whitespace-nowrap">Kitchen timer: Time's Up</span>
          <button
            type="button"
            onClick={timer.handleReset}
            className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700 cursor-pointer whitespace-nowrap"
          >
            Stop Alarm
          </button>
        </div>
      )}
    </KitchenTimerContext.Provider>
  );
}

export function useKitchenTimer() {
  const timer = useContext(KitchenTimerContext);
  if (!timer) throw new Error('useKitchenTimer must be used within KitchenTimerProvider');
  return timer;
}
