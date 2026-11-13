import React, { useState, useEffect, useRef } from 'react';
import {
  RiderProfile,
  HorseProfile,
  Gait,
  AbandonedStable,
  ActiveMonster,
} from '../game/types';
import {
  Sparkles,
  Map as MapIcon,
  Tent,
  Eye,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  Apple,
  Sun,
  Moon,
  Sunset,
  Sunrise,
  Footprints,
  Flame,
  Clock,
  ArrowUp,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import { WORLD_LENGTH, LAKE_START_Z, LAKE_END_Z, getRoadCenter } from '../game/terrain';
import type { CruisingGait } from '../game/engine';

interface GameHUDProps {
  rider: RiderProfile;
  horse: HorseProfile;
  speedKmh: number;
  gait: Gait;
  selectedGait: CruisingGait;
  isDismounted: boolean;
  isCamped: boolean;
  stamina: number;
  maxStamina: number;
  apples: number;
  starShards: number;
  timeOfDay: number;
  timeLabel: string;
  playerPos: { x: number; y: number; z: number; heading: number };
  stables: AbandonedStable[];
  monsters: ActiveMonster[];
  foxPos: { x: number; z: number };
  interactPrompt: string | null;
  onSelectGait: (gait: CruisingGait) => void;
  onToggleDismount: () => void;
  onTriggerStarBurst: () => void;
  onToggleCamp: () => void;
  onOpenCampMenu: () => void;
  onRestFourHours: () => void;
  onFeedApple: () => void;
  onCycleCamera: () => void;
  onOpenMap: () => void;
  onOpenCreator: () => void;
  onMobileJoystickMove?: (forward: number, turn: number) => void;
  onMobileJump?: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  rider,
  horse,
  speedKmh,
  gait,
  selectedGait,
  isDismounted,
  isCamped,
  stamina,
  maxStamina,
  apples,
  starShards,
  timeOfDay,
  timeLabel,
  playerPos,
  stables,
  monsters,
  foxPos,
  interactPrompt,
  onSelectGait,
  onToggleDismount,
  onTriggerStarBurst,
  onToggleCamp,
  onOpenCampMenu,
  onRestFourHours,
  onFeedApple,
  onCycleCamera,
  onOpenMap,
  onOpenCreator,
  onMobileJoystickMove,
  onMobileJump,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [muted, setMuted] = useState(soundEngine.getMuted());
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mobile virtual joystick touch handling
  const joystickContainerRef = useRef<HTMLDivElement | null>(null);
  const joystickTouchIdRef = useRef<number | null>(null);
  const [touchActive, setTouchActive] = useState(false);
  const [touchPos, setTouchPos] = useState({ x: 0, y: 0 });
  const [isTouchDevice, setIsTouchDevice] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia?.('(pointer: coarse)').matches
    );
  });

  useEffect(() => {
    const onFirstTouch = () => setIsTouchDevice(true);
    window.addEventListener('touchstart', onFirstTouch, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', onFirstTouch);
  }, []);

  const handleToggleMute = () => {
    const isMuted = soundEngine.toggleMute();
    setMuted(isMuted);
  };

  // Draw circular compass minimap in the top right
  useEffect(() => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 6;

    ctx.clearRect(0, 0, size, size);

    // Save circle clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.clip();

    // Map background according to time of day
    ctx.fillStyle = timeOfDay > 0.82 || timeOfDay < 0.15 ? '#0d1527' : '#2d4b26';
    ctx.fillRect(0, 0, size, size);

    // Coordinate mapping relative to player
    // 1 pixel = 1.2 world units
    const mapScale = 0.55;

    // Draw Długie Jezioro (Long Lake) & City of Dale when near z: 1520..2020
    const lakeZMin = Math.max(LAKE_START_Z, playerPos.z - 90);
    const lakeZMax = Math.min(LAKE_END_Z, playerPos.z + 90);
    if (lakeZMax > lakeZMin) {
      ctx.fillStyle = timeOfDay > 0.82 || timeOfDay < 0.15 ? '#163d5c' : '#256c8f';
      ctx.beginPath();
      for (let z = lakeZMin; z <= lakeZMax; z += 4) {
        const rx = getRoadCenter(z) + 5;
        const sx = center + (rx - playerPos.x) * mapScale;
        const sy = center - (z - playerPos.z) * mapScale;
        if (z === lakeZMin) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      for (let z = lakeZMax; z >= lakeZMin; z -= 4) {
        const rx = getRoadCenter(z) + 92;
        const sx = center + (rx - playerPos.x) * mapScale;
        const sy = center - (z - playerPos.z) * mapScale;
        ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();

      // City of Dale icon across the water
      const daleX = getRoadCenter(1770) + 46;
      const dmx = center + (daleX - playerPos.x) * mapScale;
      const dmy = center - (1770 - playerPos.z) * mapScale;
      if (Math.hypot(dmx - center, dmy - center) < radius - 4) {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(dmx - 5, dmy - 7, 10, 14);
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(dmx - 5, dmy - 7, 10, 14);
      }
    }

    // Draw winding road
    ctx.strokeStyle = '#c4ab80';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let z = playerPos.z - 80; z <= playerPos.z + 80; z += 4) {
      const roadX = getRoadCenter(z);
      const screenX = center + (roadX - playerPos.x) * mapScale;
      const screenY = center - (z - playerPos.z) * mapScale;
      if (z === playerPos.z - 80) ctx.moveTo(screenX, screenY);
      else ctx.lineTo(screenX, screenY);
    }
    ctx.stroke();

    // Draw Stables
    stables.forEach((st) => {
      const sx = center + (st.x - playerPos.x) * mapScale;
      const sy = center - (st.z - playerPos.z) * mapScale;
      if (Math.hypot(sx - center, sy - center) < radius - 8) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    // Draw Fox Felek
    const fx = center + (foxPos.x - playerPos.x) * mapScale;
    const fy = center - (foxPos.z - playerPos.z) * mapScale;
    if (Math.hypot(fx - center, fy - center) < radius - 8) {
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.arc(fx, fy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Active Monsters
    monsters.forEach((m) => {
      if (m.state === 'vanished') return;
      const mx = center + (m.x - playerPos.x) * mapScale;
      const my = center - (m.z - playerPos.z) * mapScale;
      if (Math.hypot(mx - center, my - center) < radius - 8) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(mx, my, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Draw Lonely Mountain Beacon indicator at top of map
    const lmx = center + (getRoadCenter(2380) - playerPos.x) * mapScale;
    const lmy = center - (2380 - playerPos.z) * mapScale;
    if (Math.hypot(lmx - center, lmy - center) < radius - 8) {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(lmx, lmy, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Player Arrow in center
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(-playerPos.heading); // rotate with horse orientation

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // restore clip

    // Golden compass border
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();

    // North marker
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', center, 14);
  }, [playerPos, stables, monsters, foxPos, timeOfDay]);

  // Gait display label
  const gaitLabels: Record<Gait, { label: string; color: string }> = {
    idle: { label: 'Stój', color: 'text-stone-400' },
    walk: { label: 'Stęp (Krok)', color: 'text-emerald-400' },
    trot: { label: 'Kłus', color: 'text-cyan-400' },
    canter: { label: 'Galop', color: 'text-amber-400' },
    gallop: { label: 'Cwał (Sprint)', color: 'text-red-400' },
  };

  // Biome determination
  let currentBiome = 'Zielone Wzgórza Hobbitów';
  if (playerPos.z > 400 && playerPos.z < 900) currentBiome = 'Leśne Ostępy';
  else if (playerPos.z >= 900 && playerPos.z < 1520) currentBiome = 'Wąwóz Mglistych Gór';
  else if (playerPos.z >= 1520 && playerPos.z < 2020) currentBiome = 'Brzeg Długiego Jeziora · Dale';
  else if (playerPos.z >= 2020) currentBiome = 'Podnóże Samotnej Góry';

  const progressPercent = Math.min(100, Math.round((playerPos.z / WORLD_LENGTH) * 100));

  // Time icon
  const renderTimeIcon = () => {
    if (timeOfDay >= 0.15 && timeOfDay < 0.3) return <Sunrise className="w-4 h-4 text-amber-300" />;
    if (timeOfDay >= 0.3 && timeOfDay < 0.7) return <Sun className="w-4 h-4 text-yellow-400" />;
    if (timeOfDay >= 0.7 && timeOfDay < 0.82) return <Sunset className="w-4 h-4 text-orange-400" />;
    return <Moon className="w-4 h-4 text-indigo-300" />;
  };

  // Virtual Joystick touch listeners for mobile (supports multi-touch alongside camera drag)
  const clampJoystickDelta = (rawX: number, rawY: number) => {
    const maxDist = 45;
    const dist = Math.hypot(rawX, rawY);
    if (dist > maxDist) {
      return { x: (rawX / dist) * maxDist, y: (rawY / dist) * maxDist };
    }
    return { x: rawX, y: rawY };
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!joystickContainerRef.current || joystickTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    joystickTouchIdRef.current = touch.identifier;
    const rect = joystickContainerRef.current.getBoundingClientRect();
    const { x, y } = clampJoystickDelta(
      touch.clientX - (rect.left + rect.width / 2),
      touch.clientY - (rect.top + rect.height / 2)
    );
    setTouchActive(true);
    setTouchPos({ x, y });
    updateMobileInput(x, y);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (!joystickContainerRef.current || joystickTouchIdRef.current === null) return;
    let touch: React.Touch | null = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === joystickTouchIdRef.current) {
        touch = e.touches[i];
        break;
      }
    }
    if (!touch) return;
    const rect = joystickContainerRef.current.getBoundingClientRect();
    const { x, y } = clampJoystickDelta(
      touch.clientX - (rect.left + rect.width / 2),
      touch.clientY - (rect.top + rect.height / 2)
    );
    setTouchActive(true);
    setTouchPos({ x, y });
    updateMobileInput(x, y);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (joystickTouchIdRef.current !== null) {
      let ended = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchIdRef.current) {
          ended = true;
          break;
        }
      }
      if (!ended) return;
    }
    joystickTouchIdRef.current = null;
    setTouchActive(false);
    setTouchPos({ x: 0, y: 0 });
    if (onMobileJoystickMove) onMobileJoystickMove(0, 0);
  };

  const updateMobileInput = (x: number, y: number) => {
    if (!onMobileJoystickMove) return;
    const maxDist = 45;
    const forwardRatio = -y / maxDist; // up is positive
    const turnRatio = x / maxDist; // right is positive
    onMobileJoystickMove(forwardRatio, turnRatio);
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none flex flex-col justify-between p-4 overflow-hidden">
      {/* TOP BAR CLUSTER */}
      <div className="w-full flex justify-between items-start gap-4">
        {/* Top-Left: Rider & Horse Card */}
        <div className="pointer-events-auto bg-stone-900/90 border border-amber-600/40 rounded-2xl p-3 shadow-xl max-w-xs text-stone-100 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">🐎</span>
              <div>
                <h3 className="text-xs font-bold text-amber-200 tracking-wide font-serif truncate">
                  {rider.name}
                </h3>
                <div className="text-[11px] text-stone-300 font-semibold truncate">
                  {horse.name}
                </div>
              </div>
            </div>
            <button
              onClick={onOpenCreator}
              className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-amber-300 text-[10px] font-medium rounded-lg border border-amber-500/30 transition"
              title="Edytuj postać i konia"
            >
              Kreator
            </button>
          </div>

          {/* Horse Stamina Bar */}
          <div>
            <div className="flex justify-between text-[10px] text-stone-300 mb-1">
              <span>Energia Konia</span>
              <span className="tabular-nums font-bold text-amber-300">
                {Math.round(stamina)}%
              </span>
            </div>
            <div className="w-full h-2 bg-stone-950 rounded-full overflow-hidden border border-stone-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 transition-all duration-150"
                style={{ width: `${(stamina / maxStamina) * 100}%` }}
              />
            </div>
          </div>

          {/* Collectibles count */}
          <div className="flex items-center gap-3 pt-1 border-t border-stone-800 text-xs">
            <div className="flex items-center gap-1.5 text-rose-300">
              <Apple className="w-3.5 h-3.5 fill-rose-500 text-rose-400" />
              <span className="font-bold tabular-nums">{apples}</span>
              <span className="text-[10px] text-stone-400">jabłek</span>
            </div>
            <div className="flex items-center gap-1.5 text-amber-300">
              <Sparkles className="w-3.5 h-3.5 fill-amber-400 text-amber-300" />
              <span className="font-bold tabular-nums">{starShards}</span>
              <span className="text-[10px] text-stone-400">okruchów gwiazd</span>
            </div>
          </div>
        </div>

        {/* Top-Right: Minimap & Compass */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {/* Compass Minimap Widget */}
          <div
            onClick={onOpenMap}
            className="cursor-pointer group relative bg-stone-900/90 border-2 border-amber-500/50 rounded-full p-1 shadow-2xl transition hover:border-amber-400"
            title="Kliknij, aby otworzyć dużą Mapę Świata"
          >
            <canvas
              ref={minimapCanvasRef}
              width={112}
              height={112}
              className="rounded-full shadow-inner block"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 rounded-full transition">
              <MapIcon className="w-6 h-6 text-amber-200" />
            </div>
          </div>

          {/* Region & Time Badge */}
          <div className="bg-stone-900/90 border border-stone-800 rounded-xl px-3 py-1.5 text-right shadow-lg">
            <div className="flex items-center justify-end gap-1.5 text-xs font-semibold text-amber-200">
              {renderTimeIcon()}
              <span>{timeLabel}</span>
            </div>
            <div className="text-[11px] text-stone-400">{currentBiome}</div>
            <div className="text-[10px] text-emerald-400 font-bold mt-0.5">
              Do Samotnej Góry: <span className="tabular-nums">{progressPercent}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* CENTER INTERACTION PROMPT */}
      {interactPrompt && (
        <div className="self-center my-auto pointer-events-auto">
          <div className="bg-stone-900/95 border-2 border-amber-400 text-amber-100 font-medium px-6 py-3 rounded-2xl shadow-2xl text-center text-sm sm:text-base animate-bounce">
            {interactPrompt}
          </div>
        </div>
      )}

      {/* BOTTOM SECTION */}
      <div className="w-full flex flex-col items-center">
        {/* Mobile touch joystick (renders on touch devices in both portrait & landscape, and small screens) */}
        <div className={`w-full flex justify-between items-end mb-2 px-2 ${isTouchDevice ? '' : 'sm:hidden'}`}>
          {/* Touch Joystick */}
          <div
            ref={joystickContainerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            className="pointer-events-auto w-24 h-24 rounded-full bg-stone-900/70 border-2 border-amber-500/40 relative flex items-center justify-center touch-none"
          >
            <div
              className="w-10 h-10 rounded-full bg-amber-500/80 border border-white/60 shadow"
              style={{
                transform: `translate(${touchPos.x}px, ${touchPos.y}px)`,
                transition: touchActive ? 'none' : 'transform 0.15s ease-out',
              }}
            />
          </div>

          {/* Quick Action Touch Buttons */}
          <div className="pointer-events-auto flex flex-col gap-2">
            {!isDismounted && onMobileJump && (
              <button
                onClick={onMobileJump}
                className="w-12 h-12 rounded-full bg-sky-600/90 border border-sky-300 text-white flex items-center justify-center shadow-lg active:scale-90"
                title="Skok koniem"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onTriggerStarBurst}
              className="w-12 h-12 rounded-full bg-indigo-600/90 border border-indigo-400 text-white flex items-center justify-center shadow-lg active:scale-90"
              title="Gwiezdny Błysk"
            >
              <Sparkles className="w-5 h-5" />
            </button>
            <button
              onClick={onToggleDismount}
              className="w-12 h-12 rounded-full bg-emerald-700/90 border border-emerald-400 text-white flex items-center justify-center shadow-lg active:scale-90"
              title={isDismounted ? 'Wsiądź na konia' : 'Zejdź z konia'}
            >
              <Footprints className="w-5 h-5" />
            </button>
            <button
              onClick={onToggleCamp}
              className="w-12 h-12 rounded-full bg-amber-700/90 border border-amber-500 text-amber-100 flex items-center justify-center shadow-lg active:scale-90"
              title="Obóz / Namiot"
            >
              <Tent className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Unified Bottom Control Dock (Consolidated, Zero Occlusion) */}
        <div
          className={`pointer-events-auto transition-transform duration-300 w-full max-w-[1020px] flex flex-col items-center ${
            dockCollapsed ? 'translate-y-[calc(100%-24px)]' : 'translate-y-0'
          }`}
        >
          {/* Collapse / Expand Toggle Tab */}
          <button
            onClick={() => setDockCollapsed(!dockCollapsed)}
            className="bg-stone-900/90 border-t border-x border-stone-700 text-stone-300 hover:text-white px-4 py-1 rounded-t-xl text-xs flex items-center gap-1.5 shadow"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Pokaż panel sterowania</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Ukryj sterowanie · Przeciągnij myszką by obracać kamerę · Scroll = zoom</span>
              </>
            )}
          </button>

          {/* Main Horizontal Dock */}
          <div className="w-full bg-stone-900/95 border border-stone-800 rounded-2xl p-2.5 sm:p-3 shadow-2xl flex flex-wrap items-center justify-between gap-2.5 text-stone-200">
            {/* Speed & Gait Selector */}
            <div className="flex items-center gap-3 pl-1">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium">
                  Prędkość
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-amber-200 tabular-nums">
                    {speedKmh}
                  </span>
                  <span className="text-xs text-stone-400 font-sans">km/h</span>
                </div>
              </div>

              <div className="h-8 w-px bg-stone-800 hidden sm:block" />

              {!isDismounted ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium">
                      Bieg jazdy:
                    </span>
                    <span className={`text-[11px] font-bold ${gaitLabels[gait].color}`}>
                      {gaitLabels[gait].label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { id: 'walk', label: '1 Stęp' },
                        { id: 'trot', label: '2 Kłus' },
                        { id: 'canter', label: '3 Galop' },
                        { id: 'gallop', label: '4 Cwał' },
                      ] as const
                    ).map((gear) => (
                      <button
                        key={gear.id}
                        onClick={() => onSelectGait(gear.id)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition ${
                          selectedGait === gear.id
                            ? 'bg-amber-500 text-stone-950 border-amber-300 shadow'
                            : 'bg-stone-950 text-stone-400 border-stone-800 hover:text-stone-200'
                        }`}
                        title="Wybierz docelowy chód przy trzymaniu W (lub przytrzymaj Shift dla Cwału)"
                      >
                        {gear.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
                    Pieszo
                  </span>
                  <span className="text-xs text-stone-300">Spacerujesz obok konia</span>
                </div>
              )}
            </div>

            {/* Action Buttons cluster */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* Dismount / Mount Button */}
              <button
                onClick={onToggleDismount}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shadow border transition active:scale-95 ${
                  isDismounted
                    ? 'bg-emerald-700 hover:bg-emerald-600 text-white border-emerald-400/50'
                    : 'bg-stone-800 hover:bg-stone-700 text-emerald-200 border-emerald-600/40'
                }`}
                title="Zejdź z konia lub wsiądź z powrotem (Klawisz G)"
              >
                <Footprints className="w-4 h-4" />
                <span>{isDismounted ? 'Wsiądź na konia [G]' : 'Zejdź z konia [G]'}</span>
              </button>

              {/* Camp / Tent Button */}
              <button
                onClick={onToggleCamp}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shadow border transition active:scale-95 ${
                  isCamped
                    ? 'bg-amber-600 hover:bg-amber-500 text-stone-950 border-amber-300'
                    : 'bg-amber-900/80 hover:bg-amber-800 text-amber-100 border-amber-600/40'
                }`}
                title="Zejdź z konia i rozbij namiot oraz ognisko na noc (Klawisz E)"
              >
                <Tent className="w-4 h-4" />
                <span className="hidden sm:inline">
                  {isCamped ? 'Zwiń obóz [E]' : 'Rozbij obóz (Namiot) [E]'}
                </span>
              </button>

              {/* Open Camp Sleep/Tea Menu & Quick 4h Rest when camped */}
              {isCamped && (
                <>
                  <button
                    onClick={onRestFourHours}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-700 hover:bg-indigo-600 text-white rounded-xl text-xs font-semibold shadow border border-indigo-400/50 transition active:scale-95"
                    title="Odpocznij 4 godziny w rozbitym obozie (+4h czasu, 100% energii)"
                  >
                    <Clock className="w-4 h-4 text-amber-300" />
                    <span>Odpocznij 4h</span>
                  </button>
                  <button
                    onClick={onOpenCampMenu}
                    className="flex items-center gap-1.5 px-3 py-2 bg-orange-700 hover:bg-orange-600 text-white rounded-xl text-xs font-semibold shadow border border-orange-400/50 transition active:scale-95"
                    title="Prześpij noc do świtu lub zaparz herbatę przy ognisku"
                  >
                    <Flame className="w-4 h-4 text-yellow-300" />
                    <span>Nocuj do świtu</span>
                  </button>
                </>
              )}

              {/* Star Burst Defend */}
              <button
                onClick={onTriggerStarBurst}
                className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-indigo-700 to-purple-800 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl text-xs font-semibold shadow border border-indigo-400/40 transition active:scale-95"
                title="Odstrasz gobliny i trole gwiezdnym blaskiem (Klawisz Q lub F)"
              >
                <Sparkles className="w-4 h-4 text-cyan-300" />
                <span className="hidden md:inline">Błysk [Q]</span>
              </button>

              {/* Feed Apple */}
              <button
                onClick={onFeedApple}
                disabled={apples <= 0}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold transition active:scale-95 border ${
                  apples > 0
                    ? 'bg-rose-900/80 hover:bg-rose-800 text-rose-100 border-rose-500/40 shadow'
                    : 'bg-stone-950 text-stone-600 border-stone-800 cursor-not-allowed'
                }`}
                title="Nakarm konia jabłkiem, by odnowić siły"
              >
                <Apple className="w-4 h-4 text-rose-400" />
                <span className="tabular-nums">{apples}</span>
              </button>

              {/* World Map */}
              <button
                onClick={onOpenMap}
                className="flex items-center gap-1.5 px-2.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-medium border border-stone-700 transition"
                title="Otwórz Mapę Śródziemia [M]"
              >
                <MapIcon className="w-4 h-4 text-amber-300" />
              </button>

              {/* Camera Cycle */}
              <button
                onClick={onCycleCamera}
                className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition"
                title="Zmień widok kamery [C] · Reset widoku [R]"
              >
                <Eye className="w-4 h-4" />
              </button>

              {/* Sound Toggle */}
              <button
                onClick={handleToggleMute}
                className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition"
                title="Dźwięk"
              >
                {muted ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
