import React from 'react';
import { Tent, Moon, Sun, Coffee, Sparkles, X } from 'lucide-react';
import { soundEngine } from '../game/audio';

interface CampModalProps {
  horseName: string;
  onSleepUntilDawn: () => void;
  onClose: () => void;
}

export const CampModal: React.FC<CampModalProps> = ({
  horseName,
  onSleepUntilDawn,
  onClose,
}) => {
  const [teaBrewed, setTeaBrewed] = React.useState(false);

  const handleBrewTea = () => {
    setTeaBrewed(true);
    soundEngine.playStarBurst();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-none select-none">
      <div className="bg-stone-900 border-2 border-amber-600/50 rounded-3xl w-full max-w-lg p-6 shadow-2xl text-stone-100 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Tent className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-serif font-bold text-amber-200">
              Biwak pod Gołym Niebem
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Campfire illustration & description */}
        <div className="bg-stone-950/80 border border-stone-800 rounded-2xl p-5 text-center flex flex-col items-center">
          <div className="text-4xl mb-2">🏕️ 🔥 ✨</div>
          <p className="text-sm text-stone-300 leading-relaxed max-w-sm">
            Ogień cicho trzaska, a nad głową rozciąga się bezkresne rozgwieżdżone niebo Śródziemia.
            Koń <strong className="text-amber-300">{horseName}</strong> skubie trawę przy namiocie i w spokoju odzyskuje siły.
          </p>

          {teaBrewed && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ciepły napar z mięty i leśnych ziół rozgrzewa dłonie...</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={onSleepUntilDawn}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold rounded-xl shadow-lg transition active:scale-98"
          >
            <Sun className="w-5 h-5 stroke-[2.5]" />
            <span>Nocuj do Świtu (Zregeneruj całą energię)</span>
          </button>

          <button
            onClick={handleBrewTea}
            disabled={teaBrewed}
            className={`w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl border text-sm font-medium transition ${
              teaBrewed
                ? 'border-stone-800 text-stone-500 bg-stone-950 cursor-not-allowed'
                : 'border-amber-600/50 text-amber-200 bg-stone-900 hover:bg-stone-800'
            }`}
          >
            <Coffee className="w-4 h-4 text-amber-400" />
            <span>{teaBrewed ? 'Herbata wypita!' : 'Zaparz kubek herbaty ziołowej'}</span>
          </button>

          <button
            onClick={onClose}
            className="w-full py-2.5 text-stone-400 hover:text-stone-200 text-xs font-medium transition"
          >
            Zwiń biwak i wracaj do jazdy
          </button>
        </div>
      </div>
    </div>
  );
};
