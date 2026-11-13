import React from 'react';
import { RiderProfile, HorseProfile } from '../game/types';
import { Sparkles, User, Play, Compass, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../game/audio';

interface TitleScreenProps {
  rider: RiderProfile;
  horse: HorseProfile;
  onStartGame: () => void;
  onOpenCreator: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  rider,
  horse,
  onStartGame,
  onOpenCreator,
}) => {
  const [muted, setMuted] = React.useState(soundEngine.getMuted());

  const handleToggleMute = () => {
    const isMuted = soundEngine.toggleMute();
    setMuted(isMuted);
  };

  return (
    <div className="absolute inset-0 flex flex-col justify-between items-center pointer-events-none p-6 select-none bg-gradient-to-b from-black/40 via-transparent to-black/70">
      {/* Top Header / Audio toggle */}
      <div className="w-full flex justify-between items-center pointer-events-auto">
        <div className="flex items-center gap-2 bg-amber-950/70 border border-amber-500/40 text-amber-200 px-4 py-1.5 rounded-full text-xs font-medium shadow-lg backdrop-blur-none">
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>Star Stable Vibe · Świat Hobbitów 3D</span>
        </div>
        <button
          onClick={handleToggleMute}
          className="p-2.5 rounded-full bg-stone-900/80 border border-stone-700 text-amber-200 hover:bg-stone-800 transition"
          title="Przełącz dźwięk"
        >
          {muted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
        </button>
      </div>

      {/* Hero Title Lockup */}
      <div className="text-center max-w-2xl px-4 my-auto">
        {/* Custom SVG decorative lockup */}
        <div className="flex justify-center mb-3">
          <svg className="w-48 h-12 text-amber-400" viewBox="0 0 200 40" fill="none">
            <path
              d="M10 20 Q 50 5, 100 20 Q 150 35, 190 20"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />
            <circle cx="100" cy="20" r="4" fill="currentColor" />
            <polygon points="100,8 103,16 111,16 105,21 107,29 100,24 93,29 95,21 89,16 97,16" fill="#ffd700" />
          </svg>
        </div>

        <h1 className="text-4xl md:text-6xl font-serif font-extrabold tracking-wider text-amber-100 drop-shadow-[0_4px_16px_rgba(0,0,0,0.85)]">
          PIEŚŃ O SAMOTNEJ GÓRZE
        </h1>
        <p className="mt-2 text-lg md:text-xl font-medium text-amber-200/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          Końska Wyprawa przez Krainy Hobbitów
        </p>

        {/* Current Rider & Horse preview pill */}
        <div className="mt-6 inline-flex items-center gap-3 bg-stone-900/85 border border-amber-600/40 rounded-full px-5 py-2 shadow-2xl">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
          <span className="text-stone-300 text-sm">
            Bohaterka: <strong className="text-amber-200 font-semibold">{rider.name}</strong> · Koń: <strong className="text-amber-200 font-semibold">{horse.name}</strong>
          </span>
        </div>

        {/* Main CTA buttons */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center pointer-events-auto">
          <button
            onClick={onStartGame}
            className="flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-serif font-bold text-lg rounded-xl shadow-[0_6px_20px_rgba(16,185,129,0.4)] border border-emerald-400/40 transform hover:-translate-y-0.5 active:translate-y-0 transition"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Wsiądź na Konia i Ruszaj (Enter)</span>
          </button>

          <button
            onClick={onOpenCreator}
            className="flex items-center justify-center gap-2.5 px-6 py-4 bg-stone-900/90 hover:bg-stone-800 text-amber-200 font-medium text-base rounded-xl border border-amber-500/50 shadow-xl transition"
          >
            <User className="w-5 h-5 text-amber-400" />
            <span>Kreator Postaci i Konia</span>
          </button>
        </div>
      </div>

      {/* Flat control hints bar at bottom */}
      <div className="text-center pointer-events-auto pb-2">
        <div className="inline-flex items-center gap-2 bg-black/65 border border-stone-800 text-stone-300 text-xs md:text-sm px-5 py-2 rounded-full">
          <Compass className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>
            <strong>WASD</strong> Jazda (<strong>1-4</strong> lub <strong>Shift</strong> = Galop/Cwał) · <strong>Przeciągnij myszką</strong> Obrót kamery · <strong>G</strong> Zejdź z konia · <strong>E</strong> Obóz/Namiot
          </span>
        </div>
      </div>
    </div>
  );
};
