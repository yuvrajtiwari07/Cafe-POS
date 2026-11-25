import React, { useState } from 'react';
import { useKitchenTimer } from '../contexts/KitchenTimerContext';
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  BellRing,
  SlidersHorizontal,
  Plus,
} from 'lucide-react';

interface TimerPreset {
  id: string;
  label: string;
  seconds: number;
}

const QUICK_PRESETS: TimerPreset[] = [
  { id: '2m', label: '2:00', seconds: 120 },
  { id: '2m15', label: '2:15', seconds: 135 },
  { id: '2m30', label: '2:30', seconds: 150 },
  { id: '3m', label: '3:00', seconds: 180 },
];

export const KitchenTimer: React.FC = () => {
  const {
    totalSeconds, remainingMs, status, activePresetId, isMuted,
    setIsMuted, unlockAudio, playKitchenBell, startDuration,
    handleTogglePlayPause, handleReset, handleAdd30Sec,
  } = useKitchenTimer();

  // Custom timer input toggle
  const [showCustom, setShowCustom] = useState<boolean>(false);
  const [customMinutes, setCustomMinutes] = useState<string>('2');
  const [customSeconds, setCustomSeconds] = useState<string>('30');

  const handleStartCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = Math.max(0, parseInt(customMinutes || '0', 10) || 0);
    const secs = Math.max(0, Math.min(59, parseInt(customSeconds || '0', 10) || 0));
    const total = mins * 60 + secs;
    if (total <= 0) return;
    startDuration(total, 'custom');
    setShowCustom(false);
  };

  const displaySeconds = Math.ceil(remainingMs / 1000);
  const mm = Math.floor(displaySeconds / 60);
  const ss = displaySeconds % 60;
  const formattedClock = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const progressPct = totalSeconds > 0 ? Math.max(0, Math.min(100, (remainingMs / (totalSeconds * 1000)) * 100)) : 0;

  return (
    <div
      className={`flex-1 min-w-0 rounded-2xl border px-3.5 py-2.5 transition-colors ${
        status === 'done'
          ? 'bg-rose-50 border-rose-400'
          : status === 'running'
          ? 'bg-[#fbf6ee] border-[#ea580c]/60'
          : 'bg-[#fbf6ee] border-[#eedecb]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Digital Countdown + Primary Play/Pause/Stop Alarm */}
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              status === 'done'
                ? 'bg-rose-600 text-white'
                : status === 'running'
                ? 'bg-[#ea580c] text-white'
                : 'bg-orange-100 text-[#ea580c]'
            }`}
          >
            {status === 'done' ? <BellRing className="w-4 h-4" /> : <Timer className="w-4 h-4" />}
          </div>

          <div className="min-w-[82px]">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-xl sm:text-2xl font-extrabold font-mono tabular-nums tracking-tight leading-none ${
                  status === 'done'
                    ? 'text-rose-700'
                    : status === 'running' && displaySeconds <= 15
                    ? 'text-amber-700'
                    : 'text-[#2b2320]'
                }`}
              >
                {formattedClock}
              </span>
              <span className="text-[11px] font-semibold text-[#7d6e67] whitespace-nowrap">
                {status === 'done'
                  ? "Time's Up"
                  : status === 'running'
                  ? 'Running'
                  : status === 'paused'
                  ? 'Paused'
                  : 'Kitchen Timer'}
              </span>
            </div>
            {/* Slim Progress Track */}
            <div className="mt-1.5 h-1.5 w-28 sm:w-32 bg-[#eedecb] rounded-full overflow-hidden">
              <div
                style={{ width: `${status === 'done' ? 100 : progressPct}%` }}
                className={`h-full transition-all duration-150 ${
                  status === 'done'
                    ? 'bg-rose-600'
                    : displaySeconds <= 15 && status === 'running'
                    ? 'bg-amber-500'
                    : 'bg-[#ea580c]'
                }`}
              />
            </div>
          </div>

          {/* Primary Play / Pause / Stop Alarm Action */}
          <div className="flex items-center gap-1">
            {status === 'done' ? (
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer whitespace-nowrap shadow-xs"
              >
                Stop Alarm
              </button>
            ) : (
              <button
                type="button"
                onClick={handleTogglePlayPause}
                className={`p-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  status === 'running'
                    ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 border border-amber-300'
                    : 'bg-[#ea580c] text-white hover:bg-[#c2410c]'
                }`}
                title={status === 'running' ? 'Pause timer' : 'Start timer'}
              >
                {status === 'running' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{status === 'running' ? 'Pause' : 'Start'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleAdd30Sec}
              className="px-2 py-2 rounded-xl bg-white hover:bg-[#f4ebe1] text-[#2b2320] border border-[#e3d3c2] text-[11px] font-bold font-mono tabular-nums transition cursor-pointer whitespace-nowrap"
              title="Add 30 seconds"
            >
              +30s
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="p-2 rounded-xl bg-white hover:bg-[#f4ebe1] text-[#6d5e56] hover:text-[#2b2320] border border-[#e3d3c2] transition cursor-pointer"
              title="Reset timer"
              aria-label="Reset timer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                if (!nextMuted) {
                  unlockAudio();
                }
              }}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                isMuted
                  ? 'bg-stone-200 text-stone-600 border-stone-300'
                  : 'bg-white text-[#6d5e56] hover:text-[#ea580c] border-[#e3d3c2]'
              }`}
              title={isMuted ? 'Sound muted (click to unmute)' : 'Sound alert on (click to mute)'}
              aria-label={isMuted ? 'Unmute alarm' : 'Mute alarm'}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Right: Quick Presets (2:00, 2:15, 2:30, 3:00) + Custom Toggle */}
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id && (status === 'running' || status === 'paused');
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  startDuration(preset.seconds, preset.id);
                  setShowCustom(false);
                }}
                className={`px-2.5 py-2 rounded-xl text-xs font-bold font-mono tabular-nums border transition cursor-pointer whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-[#ea580c] text-white border-[#ea580c] shadow-xs'
                    : 'bg-white text-[#2b2320] border-[#e3d3c2] hover:border-[#ea580c] hover:text-[#ea580c]'
                }`}
                title={`Start ${preset.label} countdown`}
              >
                {preset.label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className={`px-2.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center gap-1 whitespace-nowrap ${
              showCustom || activePresetId === 'custom'
                ? 'bg-[#2b2320] text-white border-[#2b2320]'
                : 'bg-white text-[#6d5e56] border-[#e3d3c2] hover:border-[#2b2320] hover:text-[#2b2320]'
            }`}
            title="Set custom timer duration"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Custom</span>
          </button>
        </div>
      </div>

      {/* Inline Custom Timer Input Row */}
      {showCustom && (
        <form
          onSubmit={handleStartCustom}
          className="mt-2.5 pt-2.5 border-t border-[#eedecb] flex flex-wrap items-center gap-2 text-xs"
        >
          <span className="font-semibold text-[#7d6e67]">Custom duration:</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="180"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              className="w-14 bg-white px-2 py-1.5 rounded-lg border border-[#e3d3c2] font-mono font-bold text-center tabular-nums text-[#2b2320] outline-hidden focus:border-[#ea580c]"
              aria-label="Minutes"
            />
            <span className="text-[#7d6e67] font-semibold">min</span>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="59"
              value={customSeconds}
              onChange={(e) => setCustomSeconds(e.target.value)}
              className="w-14 bg-white px-2 py-1.5 rounded-lg border border-[#e3d3c2] font-mono font-bold text-center tabular-nums text-[#2b2320] outline-hidden focus:border-[#ea580c]"
              aria-label="Seconds"
            />
            <span className="text-[#7d6e67] font-semibold">sec</span>
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Start Custom</span>
          </button>
          <button
            type="button"
            onClick={() => {
              unlockAudio();
              playKitchenBell();
            }}
            className="ml-auto px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#f4ebe1] text-[#6d5e56] border border-[#e3d3c2] font-semibold transition cursor-pointer whitespace-nowrap"
          >
            Test Bell
          </button>
        </form>
      )}
    </div>
  );
};
