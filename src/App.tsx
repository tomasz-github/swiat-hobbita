/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  RiderProfile,
  HorseProfile,
  GameState,
  Gait,
  AbandonedStable,
  ActiveMonster,
} from './game/types';
import { GameEngine } from './game/engine';
import { TitleScreen } from './components/TitleScreen';
import { GameHUD } from './components/GameHUD';
import { CreatorModal } from './components/CreatorModal';
import { WorldMapModal } from './components/WorldMapModal';
import { CampModal } from './components/CampModal';
import { VictoryModal } from './components/VictoryModal';
import { soundEngine } from './game/audio';

const STORAGE_KEY_RIDER = 'horse_game_rider_profile_v1';
const STORAGE_KEY_HORSE = 'horse_game_horse_profile_v1';

const DEFAULT_RIDER: RiderProfile = {
  name: 'Alicja Srebrzysta',
  hairColor: 'blonde',
  outfitColor: 'shire_green',
};

const DEFAULT_HORSE: HorseProfile = {
  name: 'Gwiezdny Cwał',
  coat: 'palomino',
  maneColor: 'golden',
  blanketColor: 'emerald',
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // Game UI State
  const [gameState, setGameState] = useState<GameState>('title');
  const [showCreator, setShowCreator] = useState(false);
  const [showWorldMap, setShowWorldMap] = useState(false);
  const [showCampModal, setShowCampModal] = useState(false);
  const [showVictory, setShowVictory] = useState(false);

  // Profiles
  const [rider, setRider] = useState<RiderProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RIDER);
      return saved ? JSON.parse(saved) : DEFAULT_RIDER;
    } catch {
      return DEFAULT_RIDER;
    }
  });

  const [horse, setHorse] = useState<HorseProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HORSE);
      return saved ? JSON.parse(saved) : DEFAULT_HORSE;
    } catch {
      return DEFAULT_HORSE;
    }
  });

  // Real-time HUD telemetry
  const [speedKmh, setSpeedKmh] = useState(0);
  const [gait, setGait] = useState<Gait>('idle');
  const [stamina, setStamina] = useState(100);
  const [maxStamina, setMaxStamina] = useState(100);
  const [apples, setApples] = useState(3);
  const [starShards, setStarShards] = useState(0);
  const [timeOfDay, setTimeOfDay] = useState(0.35);
  const [timeLabel, setTimeLabel] = useState('Słoneczne Południe');
  const [playerPos, setPlayerPos] = useState({ x: 0, y: 0, z: 40, heading: 0 });
  const [stables, setStables] = useState<AbandonedStable[]>([]);
  const [monsters, setMonsters] = useState<ActiveMonster[]>([]);
  const [foxPos, setFoxPos] = useState({ x: 0, z: 65 });
  const [interactPrompt, setInteractPrompt] = useState<string | null>(null);
  const [milestoneNotice, setMilestoneNotice] = useState<{ title: string; desc: string } | null>(null);

  // Save profiles on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_RIDER, JSON.stringify(rider));
      localStorage.setItem(STORAGE_KEY_HORSE, JSON.stringify(horse));
    } catch {
      // storage unavailable
    }
  }, [rider, horse]);

  // Initialize 3D Engine once inside isolated DOM container
  useEffect(() => {
    if (!canvasMountRef.current) return;

    const engine = new GameEngine(
      canvasMountRef.current,
      horse,
      rider,
      {
        onSpeedChange: (kmh, newGait) => {
          setSpeedKmh(kmh);
          setGait(newGait);
        },
        onPositionUpdate: (pos) => {
          setPlayerPos(pos);
          if (engineRef.current) {
            setStables([...engineRef.current.getStables()]);
            setMonsters([...engineRef.current.getMonsters()]);
            setFoxPos(engineRef.current.getFoxPosition());
          }
        },
        onTimeChange: (time, label) => {
          setTimeOfDay(time);
          setTimeLabel(label);
        },
        onStaminaChange: (stam, max) => {
          setStamina(stam);
          setMaxStamina(max);
        },
        onApplesChange: (app) => setApples(app),
        onStarsChange: (stars) => setStarShards(stars),
        onInteractPrompt: (prompt) => setInteractPrompt(prompt),
        onMilestoneReached: (name, desc) => {
          setMilestoneNotice({ title: name, desc });
          setTimeout(() => setMilestoneNotice(null), 5000);
        },
        onVictory: () => {
          setShowVictory(true);
        },
      }
    );

    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Update 3D engine profiles when edited
  const handleSaveProfiles = (newRider: RiderProfile, newHorse: HorseProfile) => {
    setRider(newRider);
    setHorse(newHorse);
    setShowCreator(false);
    if (engineRef.current) {
      engineRef.current.updateProfiles(newHorse, newRider);
    }
  };

  // Keyboard shortcut for starting game or map
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        setGameState('playing');
        soundEngine.playWhinny();
      } else if (gameState === 'playing') {
        if (e.code === 'KeyM') {
          setShowWorldMap((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  const handleStartGame = () => {
    setGameState('playing');
    soundEngine.playWhinny();
  };

  const handleToggleCamp = () => {
    if (engineRef.current) {
      engineRef.current.toggleCamp();
      setShowCampModal(engineRef.current.isCamped);
    }
  };

  const handleSleepUntilDawn = () => {
    if (engineRef.current) {
      engineRef.current.sleepUntilDawn();
      setShowCampModal(false);
    }
  };

  const handleFeedApple = () => {
    if (engineRef.current) {
      engineRef.current.feedHorseApple();
    }
  };

  const handleTriggerStarBurst = () => {
    if (engineRef.current) {
      engineRef.current.triggerStarBurst();
    }
  };

  const handleCycleCamera = () => {
    if (engineRef.current) {
      engineRef.current.cycleCameraView();
    }
  };

  const handleMobileJoystickMove = (forward: number, turn: number) => {
    if (engineRef.current) {
      engineRef.current.applyMobileInput(forward, turn);
    }
  };

  const handleRestartFromShire = () => {
    window.location.reload();
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-stone-950 font-sans select-none">
      {/* Isolated Three.js Canvas Container */}
      <div ref={canvasMountRef} className="absolute inset-0 z-0" />

      {/* Title Screen Overlay */}
      {gameState === 'title' && (
        <div className="relative z-10 w-full h-full">
          <TitleScreen
            rider={rider}
            horse={horse}
            onStartGame={handleStartGame}
            onOpenCreator={() => setShowCreator(true)}
          />
        </div>
      )}

      {/* Active Game HUD */}
      {gameState === 'playing' && (
        <div className="relative z-10 w-full h-full">
          <GameHUD
            rider={rider}
            horse={horse}
            speedKmh={speedKmh}
            gait={gait}
            stamina={stamina}
            maxStamina={maxStamina}
            apples={apples}
            starShards={starShards}
            timeOfDay={timeOfDay}
            timeLabel={timeLabel}
            playerPos={playerPos}
            stables={stables}
            monsters={monsters}
            foxPos={foxPos}
            interactPrompt={interactPrompt}
            onTriggerStarBurst={handleTriggerStarBurst}
            onToggleCamp={handleToggleCamp}
            onFeedApple={handleFeedApple}
            onCycleCamera={handleCycleCamera}
            onOpenMap={() => setShowWorldMap(true)}
            onOpenCreator={() => setShowCreator(true)}
            onMobileJoystickMove={handleMobileJoystickMove}
          />
        </div>
      )}

      {/* Milestone Discovery Banner */}
      {milestoneNotice && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-fade-in">
          <div className="bg-[#1f160e]/95 border-2 border-amber-400 text-amber-100 px-6 py-3.5 rounded-2xl shadow-2xl text-center max-w-md">
            <div className="text-[10px] tracking-widest uppercase font-bold text-amber-400 mb-0.5">
              Odkryto Nowe Miejsce
            </div>
            <div className="font-serif font-bold text-lg text-amber-200">
              {milestoneNotice.title}
            </div>
            <div className="text-xs text-stone-300 mt-1">
              {milestoneNotice.desc}
            </div>
          </div>
        </div>
      )}

      {/* Creator Modal */}
      {showCreator && (
        <CreatorModal
          initialRider={rider}
          initialHorse={horse}
          onSave={handleSaveProfiles}
          onClose={() => setShowCreator(false)}
        />
      )}

      {/* World Map Modal */}
      {showWorldMap && (
        <WorldMapModal
          playerZ={playerPos.z}
          riderName={rider.name}
          horseName={horse.name}
          onClose={() => setShowWorldMap(false)}
        />
      )}

      {/* Camp Modal */}
      {showCampModal && (
        <CampModal
          horseName={horse.name}
          onSleepUntilDawn={handleSleepUntilDawn}
          onClose={() => setShowCampModal(false)}
        />
      )}

      {/* Victory Modal */}
      {showVictory && (
        <VictoryModal
          riderName={rider.name}
          horseName={horse.name}
          apples={apples}
          starShards={starShards}
          onContinueRiding={() => setShowVictory(false)}
          onRestart={handleRestartFromShire}
        />
      )}
    </div>
  );
}
