import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  EyeOff,
  MapPin,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import {
  CHASER_APPEARANCE,
  DIFFICULTY_CONFIG,
  GREY_PHASE_DURATION,
  MAP_INFO,
  RUNNER_APPEARANCES
} from './game/constants';
import { ChaseGame, HudSnapshot } from './game/game';
import {
  Difficulty,
  GameSettings,
  HumanAppearance,
  MapId,
  PlayerRole
} from './game/types';

function MiniHumanBadge({
  appearance,
  size = 'sm'
}: {
  appearance: HumanAppearance;
  size?: 'sm' | 'md';
}) {
  const dim = size === 'md' ? 'w-11 h-11' : 'w-8 h-8';
  return (
    <div
      className={`${dim} rounded-lg border-2 border-[#18181b] flex items-center justify-center shrink-0 overflow-hidden shadow-xs`}
      style={{ backgroundColor: appearance.topColor }}
    >
      <svg viewBox="0 0 32 32" className="w-full h-full">
        {/* Shoulders / Top */}
        <rect x="6" y="19" width="20" height="13" rx="5" fill={appearance.topColor} />
        <rect x="11" y="20" width="10" height="4" rx="2" fill={appearance.topAccent} />
        {/* Head */}
        <circle cx="16" cy="13" r="6.5" fill={appearance.skin} stroke="#18181b" strokeWidth="1.4" />
        {/* Hair or Hunter Hat */}
        {appearance.isChaser ? (
          <>
            <ellipse cx="16" cy="8.5" rx="9" ry="2.6" fill="#1c1917" stroke="#dc2626" strokeWidth="1" />
            <rect x="10.5" y="4" width="11" height="4.8" rx="2" fill="#292524" />
            <rect x="10.5" y="7" width="11" height="1.5" fill="#dc2626" />
          </>
        ) : (
          <path
            d="M9.5 12 C9.5 6.5, 22.5 6.5, 22.5 12 C20.5 9.5, 11.5 9.5, 9.5 12 Z"
            fill={appearance.hairColor}
          />
        )}
        {/* Eyes */}
        <circle cx="13.8" cy="13.5" r="1.1" fill={appearance.isChaser ? '#ef4444' : '#18181b'} />
        <circle cx="18.2" cy="13.5" r="1.1" fill={appearance.isChaser ? '#ef4444' : '#18181b'} />
      </svg>
    </div>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<ChaseGame | null>(null);

  const [selectedMap, setSelectedMap] = useState<MapId>('park');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [role, setRole] = useState<PlayerRole>('runner');
  const [selectedRunnerIdx, setSelectedRunnerIdx] = useState<number>(0);
  const [modal, setModal] = useState<'none' | 'instructions' | 'settings'>('none');

  const [settings, setSettings] = useState<GameSettings>({
    sfxEnabled: true,
    voiceEnabled: true,
    musicEnabled: true,
    mouseMode: 'hold',
    showMinimap: true,
    showTileLetters: false
  });

  const [hud, setHud] = useState<HudSnapshot>({
    state: 'MENU',
    round: 1,
    phase: 'GREY_PHASE',
    phaseTimer: GREY_PHASE_DURATION,
    phaseDuration: GREY_PHASE_DURATION,
    safeColor: null,
    runnersAlive: 8,
    runnersTotal: 8,
    score: 0,
    stamina: 100,
    dashReady: true,
    isHidden: false,
    isSafeOnColor: false,
    nearHidingSpot: false,
    chaserDistance: 20,
    chaserAlert: 'SAFE',
    chaserCamping: false,
    countdownStep: null,
    revealBannerActive: false,
    role: 'runner',
    mapId: 'park',
    difficulty: 'normal',
    victory: false,
    endReason: '',
    caughtCount: 0,
    survivedSeconds: 0
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new ChaseGame(canvas, (snap) => {
      setHud(snap);
    });
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const updateSettings = (patch: Partial<GameSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      gameRef.current?.applySettings(next);
      return next;
    });
  };

  const handleSelectMap = (id: MapId) => {
    gameRef.current?.sound.playButton();
    setSelectedMap(id);
    gameRef.current?.setPreviewMap(id);
  };

  const handleSelectDifficulty = (diff: Difficulty) => {
    gameRef.current?.sound.playButton();
    setDifficulty(diff);
    gameRef.current?.setDifficulty(diff);
  };

  const handleSelectRole = (nextRole: PlayerRole) => {
    gameRef.current?.sound.playButton();
    setRole(nextRole);
    gameRef.current?.setRole(nextRole);
  };

  const handleSelectRunner = (idx: number) => {
    gameRef.current?.sound.playButton();
    setSelectedRunnerIdx(idx);
  };

  const handleStart = () => {
    setModal('none');
    gameRef.current?.startGame(selectedMap, difficulty, role, selectedRunnerIdx);
  };

  const handlePauseToggle = () => {
    gameRef.current?.togglePause();
  };

  const handleReturnMenu = () => {
    setModal('none');
    gameRef.current?.returnToMenu();
  };

  const alertColors: Record<HudSnapshot['chaserAlert'], string> = {
    SAFE: 'text-emerald-700',
    NEARBY: 'text-amber-600',
    DANGER: 'text-rose-600',
    HIDDEN: 'text-sky-700',
    IMMUNE: 'text-emerald-700',
    HUNTING: 'text-rose-600'
  };

  const timerRatio = Math.max(0, Math.min(1, hud.phaseTimer / Math.max(0.1, hud.phaseDuration)));
  const activeRunner = RUNNER_APPEARANCES[selectedRunnerIdx] || RUNNER_APPEARANCES[0];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#f4efe2] text-[#18181b] font-sans select-none">
      {/* Full viewport HTML5 Canvas */}
      <div className="absolute inset-0">
        <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />
      </div>

      {/* =================================================================== */}
      {/* IN GAME HUD                                                         */}
      {/* =================================================================== */}
      {(hud.state === 'PLAYING' || hud.state === 'PAUSED') && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          {/* Top HUD Bar */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            {/* Left Telemetry */}
            <div className="flex items-center gap-4 bg-[#f4efe2]/96 border-2 border-[#18181b] rounded-xl px-4 py-2.5 shadow-[0_4px_0_#1e40af]">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wider">Round</span>
                <span className="text-lg font-black tabular-nums text-[#18181b]">{hud.round}</span>
              </div>

              <div className="h-7 w-px bg-[#d6ccb4]" />

              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wider">Runners</span>
                <span className="text-lg font-black tabular-nums text-[#18181b]">
                  {hud.runnersAlive} / {hud.runnersTotal}
                </span>
              </div>

              <div className="h-7 w-px bg-[#d6ccb4]" />

              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wider">Score</span>
                <span className="text-lg font-black tabular-nums text-[#2343d6]">{hud.score}</span>
              </div>
            </div>

            {/* Center Phase Countdown & SAFE COLOR Banner */}
            <div className="flex items-center gap-4 bg-[#f4efe2]/96 border-2 border-[#18181b] rounded-xl px-4 py-2.5 min-w-[300px] shadow-[0_4px_0_#1e40af]">
              <div className="flex items-center gap-2.5 pr-3 border-r border-[#d6ccb4]">
                <div
                  className="w-9 h-9 rounded-lg border-2 border-[#18181b] flex items-center justify-center font-black text-base text-white shrink-0"
                  style={{
                    backgroundColor: hud.safeColor ? hud.safeColor.hex : '#57534e'
                  }}
                >
                  {hud.safeColor ? '' : '?'}
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wider">Safe Color</span>
                  <span
                    className="text-sm font-black tracking-wide"
                    style={{ color: hud.safeColor ? hud.safeColor.hex : '#6b7280' }}
                  >
                    {hud.safeColor ? hud.safeColor.name : 'Hidden'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-[165px]">
                <div className="flex items-center justify-between gap-2 text-xs font-extrabold tabular-nums">
                  <span
                    className={
                      hud.phase === 'COLOR_PHASE'
                        ? 'text-emerald-700'
                        : hud.phase === 'COUNTDOWN'
                        ? 'text-[#2343d6]'
                        : 'text-[#18181b]'
                    }
                  >
                    {hud.phase === 'COUNTDOWN'
                      ? `Get Ready: ${hud.countdownStep || '1'}`
                      : hud.phase === 'GREY_PHASE'
                      ? `Colors reveal in: ${Math.ceil(hud.phaseTimer)}s`
                      : hud.phase === 'COLOR_PHASE'
                      ? `B&W returns in: ${hud.phaseTimer.toFixed(1)}s`
                      : 'Next Phase'}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-[#dfd6c1] border border-[#18181b]/20 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-colors duration-150"
                    style={{
                      width: `${timerRatio * 100}%`,
                      backgroundColor:
                        hud.phase === 'COLOR_PHASE'
                          ? hud.safeColor?.hex || '#2343d6'
                          : hud.phaseTimer <= 3
                          ? '#d97706'
                          : '#2343d6'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Right Hunter Proximity & Controls */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2.5 bg-[#f4efe2]/96 border-2 border-[#18181b] rounded-xl px-3.5 py-2.5 shadow-[0_4px_0_#1e40af]">
                {hud.isSafeOnColor ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                ) : hud.isHidden ? (
                  <EyeOff className="w-4 h-4 text-[#2343d6]" />
                ) : (
                  <ShieldAlert
                    className={`w-4 h-4 ${
                      hud.phase !== 'COLOR_PHASE'
                        ? 'text-[#2343d6]'
                        : alertColors[hud.chaserAlert]
                    }`}
                  />
                )}
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-[#6b7280] uppercase tracking-wider">
                    {hud.role === 'chaser' ? 'Hunter Status' : 'Hunter'}
                  </span>
                  <span
                    className={`text-sm font-extrabold tabular-nums ${
                      hud.phase !== 'COLOR_PHASE'
                        ? 'text-[#2343d6]'
                        : alertColors[hud.chaserAlert]
                    }`}
                  >
                    {hud.phase === 'COUNTDOWN'
                      ? 'Ready at Spawn'
                      : hud.phase === 'GREY_PHASE'
                      ? hud.role === 'chaser'
                        ? 'Wait for Reveal'
                        : 'Scatter (No Catch)'
                      : hud.role === 'chaser'
                      ? `Hunting (${hud.runnersAlive} left)`
                      : hud.isSafeOnColor
                      ? 'Safe on Color!'
                      : hud.isHidden
                      ? 'Hidden'
                      : `${hud.chaserDistance}m ${hud.chaserAlert}`}
                  </span>
                </div>
              </div>

              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateSettings({
                      mouseMode: settings.mouseMode === 'hold' ? 'follow' : 'hold'
                    })
                  }
                  title="Switch Mouse Movement Mode"
                  className="flex items-center gap-1.5 h-11 px-3 rounded-xl bg-[#f4efe2]/96 hover:bg-[#ebe4d2] border-2 border-[#18181b] text-xs font-bold text-[#18181b] transition-colors cursor-pointer shadow-[0_3px_0_#18181b]"
                >
                  <MousePointer2 className="w-3.5 h-3.5 text-[#2343d6]" />
                  <span>{settings.mouseMode === 'follow' ? 'Mouse: Follow' : 'Mouse: Hold'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    updateSettings({
                      sfxEnabled: !settings.sfxEnabled,
                      voiceEnabled: !settings.sfxEnabled
                    })
                  }
                  aria-label="Toggle Sound and Voices"
                  className="flex items-center justify-center w-11 h-11 rounded-xl bg-[#f4efe2]/96 hover:bg-[#ebe4d2] border-2 border-[#18181b] text-[#18181b] transition-colors cursor-pointer shadow-[0_3px_0_#18181b]"
                >
                  {settings.sfxEnabled ? (
                    <Volume2 className="w-4 h-4" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-[#9ca3af]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={handlePauseToggle}
                  aria-label="Pause Game"
                  className="flex items-center gap-1.5 h-11 px-3.5 rounded-xl bg-[#2343d6] hover:bg-[#1d39b8] border-2 border-[#15288a] text-sm font-extrabold text-white transition-colors cursor-pointer shadow-[0_3px_0_#111f6e]"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </button>
              </div>
            </div>
          </div>

          {/* Center Phase Banners (1-2-3-GO, Black & White Scatter, Colors Revealed) */}
          {hud.phase === 'COUNTDOWN' && (
            <div className="pointer-events-none fixed top-24 left-1/2 -translate-x-1/2 z-10">
              <div className="bg-[#1d2e5c]/96 border-[2.5px] border-[#f4efe2] ring-2 ring-[#18181b] rounded-2xl px-10 py-4 shadow-[0_6px_0_#111827,0_16px_36px_rgba(0,0,0,0.38)] text-center min-w-[290px]">
                <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#f4efe2]">
                  GET READY
                </div>
                <div className="text-5xl font-black text-white leading-tight tabular-nums my-1">
                  {hud.countdownStep || '1'}
                </div>
                <div className="text-xs font-semibold text-[#dbeafe]">
                  Everyone runs on GO!
                </div>
              </div>
            </div>
          )}

          {hud.phase === 'GREY_PHASE' && (
            <div className="pointer-events-none fixed top-24 left-1/2 -translate-x-1/2 z-10">
              <div className="bg-[#1d2e5c]/95 border-[2.5px] border-[#f4efe2] ring-2 ring-[#18181b] rounded-2xl px-8 py-3 shadow-[0_6px_0_#111827,0_14px_28px_rgba(0,0,0,0.32)] text-center min-w-[310px]">
                <div className="text-[11px] font-black uppercase tracking-[0.13em] text-[#f8fafc]">
                  BLACK AND WHITE SCATTER
                </div>
                <div className="text-4xl font-black text-white leading-tight tabular-nums my-0.5">
                  {hud.countdownStep === 'GO!' ? 'GO!' : Math.ceil(hud.phaseTimer)}
                </div>
                <div className="text-xs font-semibold text-[#e2e8f0]">
                  {hud.role === 'chaser'
                    ? 'Move across the map! Catching unlocks when colors reveal.'
                    : 'Move across the map before tiles reveal colors!'}
                </div>
              </div>
            </div>
          )}

          {hud.phase === 'COLOR_PHASE' && hud.revealBannerActive && hud.safeColor && (
            <div className="pointer-events-none fixed top-24 left-1/2 -translate-x-1/2 z-10">
              <div
                className="border-[3px] border-[#1e293b] rounded-2xl px-9 py-3.5 shadow-[0_6px_0_#1e293b,0_16px_32px_rgba(0,0,0,0.32)] text-center min-w-[340px]"
                style={{
                  backgroundColor: hud.safeColor.hex,
                  color:
                    hud.safeColor.id === 'yellow' || hud.safeColor.id === 'orange'
                      ? '#1e293b'
                      : '#ffffff'
                }}
              >
                <div className="text-[11px] font-black uppercase tracking-[0.14em]">
                  COLORS REVEALED!
                </div>
                <div className="text-3xl sm:text-4xl font-black tracking-tight uppercase leading-none my-1">
                  {hud.role === 'runner'
                    ? `GET TO ${hud.safeColor.name}!`
                    : `CHASE! SAFE IS ${hud.safeColor.name}!`}
                </div>
                <div className="text-xs font-bold opacity-90">
                  10s max per safe tile. Keep rotating to new tiles!
                </div>
              </div>
            </div>
          )}

          {/* Bottom Left Stamina & Action Cluster */}
          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-2 bg-[#f4efe2]/96 border-2 border-[#18181b] rounded-xl px-4 py-3 w-76 shadow-[0_4px_0_#1e40af]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#374151]">
                  {hud.role === 'chaser' ? 'Hunter Stamina' : 'Stamina (Shift)'}
                </span>
                <span
                  className={`font-black tabular-nums ${
                    hud.chaserCamping ? 'text-rose-600' : 'text-[#2343d6]'
                  }`}
                >
                  {hud.stamina}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-[#dfd6c1] rounded-full overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-75 ${
                    hud.chaserCamping ? 'bg-rose-600' : 'bg-[#2343d6]'
                  }`}
                  style={{ width: `${hud.stamina}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#4b5563] pt-0.5 font-semibold">
                <span>
                  Dash (Space):{' '}
                  <strong className={hud.dashReady ? 'text-emerald-700' : 'text-[#9ca3af]'}>
                    {hud.dashReady ? 'Ready' : 'Cooldown'}
                  </strong>
                </span>
                {hud.role === 'chaser' ? (
                  <span className={hud.chaserCamping ? 'text-rose-600 font-extrabold' : 'text-emerald-700 font-bold'}>
                    {hud.chaserCamping ? 'Keep Moving! Draining' : 'Active Hunt (Full)'}
                  </span>
                ) : (
                  <span>
                    {hud.isSafeOnColor
                      ? 'Immune on Safe Color'
                      : hud.isHidden
                      ? 'Hidden (Move or E)'
                      : hud.nearHidingSpot
                      ? 'Press E to Hide'
                      : 'WASD or Mouse'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* CENTERED CREAM + ROYAL BLUE MAIN MENU OVERLAY                       */}
      {/* =================================================================== */}
      {hud.state === 'MENU' && (
        <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6 bg-slate-950/35 backdrop-blur-[1.5px]">
          <div className="w-full max-w-[780px] bg-[#f4efe2] border-2 border-[#18181b] rounded-[20px] p-5 sm:p-6 shadow-[0_8px_0_#2343d6,0_24px_55px_rgba(0,0,0,0.42)] flex flex-col gap-4 max-h-[94vh] overflow-y-auto">
            {/* Header Row: Eyebrow + Title + Play Game Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#dcd3bd] pb-4">
              <div className="flex flex-col">
                <span className="text-[11px] font-black uppercase tracking-[0.09em] text-[#2343d6]">
                  2D SURVIVAL CHASE | 1 HUNTER VS 8 RUNNERS
                </span>
                <h1 className="text-3xl sm:text-[34px] font-black tracking-tight text-[#111827] leading-tight mt-0.5">
                  STREET CHASE <span className="text-[#2343d6]">2D</span>
                </h1>
                <p className="text-xs sm:text-[13px] text-[#4b5563] mt-1 leading-snug max-w-md font-medium">
                  10s Black and White scatter, 10 second Safe Color limits, dynamic color shifts,
                  and Hunter Vance on the prowl.
                </p>
              </div>

              <button
                type="button"
                onClick={handleStart}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#2343d6] hover:bg-[#1d39b8] active:translate-y-0.5 border-2 border-[#14267a] shadow-[0_4px_0_#111f6e] text-white font-black text-sm sm:text-base tracking-wide transition-all cursor-pointer shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>PLAY GAME</span>
              </button>
            </div>

            {/* 1. CHOOSE YOUR ROLE */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#6b7280]">
                1. CHOOSE YOUR ROLE
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleSelectRole('runner')}
                  className={`flex items-center gap-3.5 p-3.5 rounded-xl text-left transition-all cursor-pointer ${
                    role === 'runner'
                      ? 'bg-[#eff0dc] border-2 border-[#18181b] shadow-[0_3px_0_#18181b]'
                      : 'bg-[#ebe5d5]/70 border border-[#d6ccb4] hover:border-[#9ca3af]'
                  }`}
                >
                  <MiniHumanBadge appearance={activeRunner} size="md" />
                  <div className="flex flex-col">
                    <span className="text-sm font-black text-[#111827]">
                      Play as Runner (1 of 8)
                    </span>
                    <span className="text-xs text-[#4b5563] leading-snug mt-0.5">
                      Rotate between safe tiles every 10s and be the last standing!
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('chaser')}
                  className={`flex items-center gap-3.5 p-3.5 rounded-xl text-left transition-all cursor-pointer ${
                    role === 'chaser'
                      ? 'bg-[#eff0dc] border-2 border-[#18181b] border-b-[4px] border-b-[#dc2626] shadow-sm'
                      : 'bg-[#ebe5d5]/70 border border-[#d6ccb4] hover:border-[#9ca3af]'
                  }`}
                >
                  <MiniHumanBadge appearance={CHASER_APPEARANCE} size="md" />
                  <div className="flex flex-col">
                    <span className="text-sm font-black text-[#111827]">
                      Play as Hunter (Vance)
                    </span>
                    <span className="text-xs text-[#4b5563] leading-snug mt-0.5">
                      Eliminate all 8 Runners as they rotate between safe tiles!
                    </span>
                  </div>
                </button>
              </div>
            </div>

            {/* 2. PICK YOUR RUNNER (Shown when Runner is selected, hidden for Hunter) */}
            {role === 'runner' && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#6b7280]">
                  2. PICK YOUR RUNNER
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {RUNNER_APPEARANCES.map((runner, idx) => {
                    const active = selectedRunnerIdx === idx;
                    return (
                      <button
                        key={runner.name}
                        type="button"
                        onClick={() => handleSelectRunner(idx)}
                        className={`flex items-center gap-2.5 p-2 rounded-xl text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-[#eff0dc] border-2 border-[#18181b] shadow-[0_2px_0_#18181b]'
                            : 'bg-[#ebe5d5]/65 border border-[#d6ccb4] hover:border-[#9ca3af]'
                        }`}
                      >
                        <MiniHumanBadge appearance={runner} size="sm" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-extrabold text-[#111827] truncate">
                            {runner.name}
                          </span>
                          <span className="text-[10px] text-[#6b7280] leading-tight truncate">
                            {runner.tagline}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. MAP AND DIFFICULTY */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-0.5">
              <div className="flex flex-col gap-1.5 flex-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#6b7280]">
                  {role === 'runner' ? '3. SELECT WORLD MAP' : '2. SELECT WORLD MAP'}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(Object.keys(MAP_INFO) as MapId[]).map((id) => {
                    const info = MAP_INFO[id];
                    const active = selectedMap === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleSelectMap(id)}
                        className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-[#eff0dc] border-2 border-[#18181b] shadow-[0_2px_0_#18181b]'
                            : 'bg-[#ebe5d5]/70 border border-[#d6ccb4] hover:border-[#9ca3af]'
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: info.accent }} />
                        <span className="text-[11px] font-extrabold text-[#111827] truncate">
                          {info.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 shrink-0">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#6b7280]">
                  DIFFICULTY
                </span>
                <div className="flex items-center gap-1 p-1 bg-[#ebe5d5] border border-[#d6ccb4] rounded-lg">
                  {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleSelectDifficulty(d)}
                      className={`px-3 py-1.5 rounded-md text-xs font-extrabold transition-colors cursor-pointer ${
                        difficulty === d
                          ? 'bg-[#18181b] text-[#f4efe2] shadow-xs'
                          : 'text-[#4b5563] hover:text-[#111827]'
                      }`}
                    >
                      {DIFFICULTY_CONFIG[d].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Two Column Rules & Controls Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="bg-[#ebe5d5]/70 border border-[#d8ceb8] rounded-xl p-3.5 flex flex-col gap-1.5">
                <span className="text-xs font-extrabold text-[#111827]">Core Survival Rules</span>
                <ul className="text-[11px] text-[#4b5563] leading-relaxed flex flex-col gap-1 list-disc pl-4">
                  <li>
                    <strong className="text-[#111827]">10s Safe Color Limit:</strong> Every 10s the
                    Safe Color shifts; stay moving between distant tiles.
                  </li>
                  <li>
                    <strong className="text-[#111827]">Hunter Immunity:</strong> Stand on a matching
                    Safe Color tile so Hunter Vance cannot chase you.
                  </li>
                </ul>
              </div>

              <div className="bg-[#ebe5d5]/70 border border-[#d8ceb8] rounded-xl p-3.5 flex flex-col justify-between gap-2.5">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-extrabold text-[#111827]">Controls and Assist</span>
                  <p className="text-[11px] text-[#4b5563] leading-relaxed">
                    Move with <strong>WASD / Arrow Keys / Mouse</strong>. Shift Sprint, Space Dash,
                    E Hide, Press <strong>P</strong> to pause anytime.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({ showTileLetters: !settings.showTileLetters })
                    }
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-extrabold transition-colors cursor-pointer ${
                      settings.showTileLetters
                        ? 'bg-[#2343d6] border-[#14267a] text-white'
                        : 'bg-[#f4efe2] border-[#cbc0a8] hover:border-[#18181b] text-[#111827]'
                    }`}
                  >
                    Tile Color Letters: {settings.showTileLetters ? 'ON' : 'OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSettings({ voiceEnabled: !settings.voiceEnabled })}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-extrabold transition-colors cursor-pointer ${
                      settings.voiceEnabled
                        ? 'bg-[#eff0dc] border-[#18181b] text-[#111827]'
                        : 'bg-[#f4efe2] border-[#cbc0a8] text-[#6b7280]'
                    }`}
                  >
                    Voices: {settings.voiceEnabled ? 'ON' : 'OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      gameRef.current?.sound.playButton();
                      setModal('instructions');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#f4efe2] border border-[#cbc0a8] hover:border-[#18181b] text-[11px] font-extrabold text-[#111827] cursor-pointer"
                  >
                    <BookOpen className="w-3 h-3 text-[#2343d6]" />
                    <span>Rules</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      gameRef.current?.sound.playButton();
                      setModal('settings');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#f4efe2] border border-[#cbc0a8] hover:border-[#18181b] text-[11px] font-extrabold text-[#111827] cursor-pointer"
                  >
                    <SettingsIcon className="w-3 h-3 text-[#2343d6]" />
                    <span>Settings</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* INSTRUCTIONS & SETTINGS MODALS                                      */}
      {/* =================================================================== */}
      {modal !== 'none' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/50">
          <div className="w-full max-w-lg bg-[#f4efe2] border-2 border-[#18181b] rounded-2xl p-6 shadow-[0_8px_0_#2343d6,0_20px_40px_rgba(0,0,0,0.35)] flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#dcd3bd] pb-3">
              <h2 className="text-lg font-black text-[#111827]">
                {modal === 'instructions' ? 'How to Play' : 'Game Settings'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  gameRef.current?.sound.playButton();
                  setModal('none');
                }}
                aria-label="Close"
                className="p-1.5 rounded-lg hover:bg-[#ebe4d2] text-[#6b7280] hover:text-[#111827] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modal === 'instructions' ? (
              <div className="flex flex-col gap-3 text-sm text-[#374151] leading-relaxed">
                <p>
                  <strong className="text-[#111827]">1. Ready and Black and White Scatter (10s):</strong>{' '}
                  After the 1, 2, 3, GO countdown, the map stays black and white for 10 seconds while
                  everyone runs freely. The Chaser cannot catch anyone until colors reveal!
                </p>
                <p>
                  <strong className="text-[#111827]">2. Colors Revealed (10s Chase):</strong> Colors
                  appear and a Safe Color banner pops up. The Chaser now hunts everyone not standing
                  on a matching Safe Color tile! After 10 seconds, the map returns to black and
                  white and repeats with a new color.
                </p>
                <div className="bg-[#ebe5d5] border border-[#d6ccb4] rounded-xl p-3.5 grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <span className="text-[#2343d6] font-extrabold block">Move (Keyboard)</span>
                    WASD or Arrow Keys
                  </div>
                  <div>
                    <span className="text-[#2343d6] font-extrabold block">Move (Mouse)</span>
                    Hold Left Click or Follow Mode
                  </div>
                  <div>
                    <span className="text-[#2343d6] font-extrabold block">Sprint and Dash</span>
                    Shift to Sprint, Space or Right Click Dash
                  </div>
                  <div>
                    <span className="text-[#2343d6] font-extrabold block">Hide and Pause</span>
                    E or F near Cover, P or Esc Pause
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <label className="flex items-center justify-between p-3 rounded-xl bg-[#ebe5d5] border border-[#d6ccb4] cursor-pointer">
                  <span className="text-sm font-bold text-[#111827]">Tile Color Letters (R, B, G, Y, P, O)</span>
                  <input
                    type="checkbox"
                    checked={settings.showTileLetters}
                    onChange={(e) => updateSettings({ showTileLetters: e.target.checked })}
                    className="w-4 h-4 accent-[#2343d6]"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-[#ebe5d5] border border-[#d6ccb4] cursor-pointer">
                  <span className="text-sm font-bold text-[#111827]">Sound Effects</span>
                  <input
                    type="checkbox"
                    checked={settings.sfxEnabled}
                    onChange={(e) => updateSettings({ sfxEnabled: e.target.checked })}
                    className="w-4 h-4 accent-[#2343d6]"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-[#ebe5d5] border border-[#d6ccb4] cursor-pointer">
                  <span className="text-sm font-bold text-[#111827]">Run and Out Voices</span>
                  <input
                    type="checkbox"
                    checked={settings.voiceEnabled}
                    onChange={(e) => updateSettings({ voiceEnabled: e.target.checked })}
                    className="w-4 h-4 accent-[#2343d6]"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-[#ebe5d5] border border-[#d6ccb4] cursor-pointer">
                  <span className="text-sm font-bold text-[#111827]">Background Music</span>
                  <input
                    type="checkbox"
                    checked={settings.musicEnabled}
                    onChange={(e) => updateSettings({ musicEnabled: e.target.checked })}
                    className="w-4 h-4 accent-[#2343d6]"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-[#ebe5d5] border border-[#d6ccb4] cursor-pointer">
                  <span className="text-sm font-bold text-[#111827]">Show Minimap</span>
                  <input
                    type="checkbox"
                    checked={settings.showMinimap}
                    onChange={(e) => updateSettings({ showMinimap: e.target.checked })}
                    className="w-4 h-4 accent-[#2343d6]"
                  />
                </label>

                <div className="flex items-center justify-between p-3 rounded-xl bg-[#ebe5d5] border border-[#d6ccb4]">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-[#111827]">Mouse Movement</span>
                    <span className="text-xs text-[#4b5563]">
                      Hold left click or automatically follow cursor
                    </span>
                  </div>
                  <div className="flex gap-1 p-1 bg-[#dfd6c1] rounded-lg border border-[#c7bc9f]">
                    <button
                      type="button"
                      onClick={() => updateSettings({ mouseMode: 'hold' })}
                      className={`px-2.5 py-1 rounded text-xs font-extrabold cursor-pointer ${
                        settings.mouseMode === 'hold'
                          ? 'bg-[#2343d6] text-white'
                          : 'text-[#4b5563]'
                      }`}
                    >
                      Hold Click
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettings({ mouseMode: 'follow' })}
                      className={`px-2.5 py-1 rounded text-xs font-extrabold cursor-pointer ${
                        settings.mouseMode === 'follow'
                          ? 'bg-[#2343d6] text-white'
                          : 'text-[#4b5563]'
                      }`}
                    >
                      Follow
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                gameRef.current?.sound.playButton();
                setModal('none');
              }}
              className="w-full py-2.5 rounded-xl bg-[#2343d6] text-white font-extrabold text-sm hover:bg-[#1d39b8] border-2 border-[#14267a] shadow-[0_3px_0_#111f6e] transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* PAUSE MODAL                                                         */}
      {/* =================================================================== */}
      {hud.state === 'PAUSED' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/50">
          <div className="w-full max-w-sm bg-[#f4efe2] border-2 border-[#18181b] rounded-2xl p-6 text-center shadow-[0_8px_0_#2343d6,0_20px_40px_rgba(0,0,0,0.35)] flex flex-col gap-4">
            <h2 className="text-2xl font-black text-[#111827]">Game Paused</h2>
            <p className="text-sm font-semibold text-[#4b5563]">
              Round {hud.round} | {MAP_INFO[hud.mapId].name} |{' '}
              {DIFFICULTY_CONFIG[hud.difficulty].label}
            </p>
            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="button"
                onClick={handlePauseToggle}
                className="w-full py-2.5 rounded-xl bg-[#2343d6] hover:bg-[#1d39b8] border-2 border-[#14267a] shadow-[0_3px_0_#111f6e] text-white font-extrabold text-sm cursor-pointer"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="w-full py-2.5 rounded-xl bg-[#ebe5d5] hover:bg-[#dfd6c1] border border-[#c7bc9f] text-[#111827] font-bold text-sm cursor-pointer"
              >
                Restart Match
              </button>
              <button
                type="button"
                onClick={handleReturnMenu}
                className="w-full py-2.5 rounded-xl bg-transparent border border-[#d6ccb4] hover:bg-[#ebe5d5] text-[#4b5563] font-semibold text-sm cursor-pointer"
              >
                Return to Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* GAME OVER / VICTORY MODAL                                           */}
      {/* =================================================================== */}
      {hud.state === 'GAME_OVER' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-950/55">
          <div className="w-full max-w-md bg-[#f4efe2] border-2 border-[#18181b] rounded-2xl p-7 text-center shadow-[0_8px_0_#2343d6,0_24px_48px_rgba(0,0,0,0.4)] flex flex-col gap-5">
            <div>
              <h2
                className={`text-3xl font-black tracking-tight ${
                  hud.victory ? 'text-[#2343d6]' : 'text-rose-600'
                }`}
              >
                {hud.victory ? 'VICTORY!' : 'GAME OVER'}
              </h2>
              <p className="text-sm text-[#374151] mt-1 font-semibold">{hud.endReason}</p>
            </div>

            <div className="grid grid-cols-3 gap-2.5 bg-[#ebe5d5] border border-[#d6ccb4] rounded-xl p-4">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-[#6b7280] uppercase">Round</span>
                <span className="text-xl font-black tabular-nums text-[#111827]">{hud.round}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-[#6b7280] uppercase">Final Score</span>
                <span className="text-xl font-black tabular-nums text-[#2343d6]">{hud.score}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-[#6b7280] uppercase">Time</span>
                <span className="text-xl font-black tabular-nums text-[#111827]">
                  {hud.survivedSeconds}s
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleStart}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#2343d6] hover:bg-[#1d39b8] border-2 border-[#14267a] shadow-[0_3px_0_#111f6e] text-white font-extrabold text-sm cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Play Again</span>
              </button>
              <button
                type="button"
                onClick={handleReturnMenu}
                className="flex-1 py-3 rounded-xl bg-[#ebe5d5] hover:bg-[#dfd6c1] border border-[#c7bc9f] text-[#111827] font-bold text-sm cursor-pointer"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
