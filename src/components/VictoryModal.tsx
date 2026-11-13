import React from 'react';
import { Sparkles, Trophy, Apple, RotateCcw, Compass } from 'lucide-react';
import { soundEngine } from '../game/audio';

interface VictoryModalProps {
  riderName: string;
  horseName: string;
  apples: number;
  starShards: number;
  onContinueRiding: () => void;
  onRestart: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  riderName,
  horseName,
  apples,
  starShards,
  onContinueRiding,
  onRestart,
}) => {
  React.useEffect(() => {
    soundEngine.playStarBurst();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-none select-none">
      <div className="bg-[#1f1811] border-2 border-yellow-400 rounded-3xl w-full max-w-xl p-8 shadow-[0_0_50px_rgba(234,179,8,0.3)] text-stone-100 text-center flex flex-col items-center gap-6">
        {/* Crown Icon */}
        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-600 to-yellow-300 flex items-center justify-center shadow-lg border-2 border-white/40">
          <Trophy className="w-9 h-9 text-stone-950 fill-current" />
        </div>

        <div>
          <span className="text-xs uppercase tracking-widest text-amber-400 font-bold">
            Wielkie Zwycięstwo!
          </span>
          <h2 className="text-3xl sm:text-4xl font-serif font-black text-amber-100 mt-1">
            Dotarłaś pod Samotną Górę!
          </h2>
          <p className="mt-2 text-sm text-amber-200/90 leading-relaxed max-w-md mx-auto">
            Wspaniała wyprawa dobiegła triumfalnego końca. Razem z koniem{' '}
            <strong className="text-yellow-300 font-bold">{horseName}</strong> pokonaliście
            bujne wzgórza Shire, prastarą Puszczę, przeprawiliście się przez strome skalne turnie i
            dotarliście do złotych Wrót Ereboru!
          </p>
        </div>

        {/* Stats card */}
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-4 flex flex-col items-center">
            <Apple className="w-6 h-6 text-rose-400 mb-1" />
            <span className="text-2xl font-bold font-mono text-amber-200 tabular-nums">
              {apples}
            </span>
            <span className="text-[11px] text-stone-400">Zebrane jabłka</span>
          </div>
          <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-4 flex flex-col items-center">
            <Sparkles className="w-6 h-6 text-amber-300 mb-1" />
            <span className="text-2xl font-bold font-mono text-amber-200 tabular-nums">
              {starShards}
            </span>
            <span className="text-[11px] text-stone-400">Gwiezdne okruchy</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
          <button
            onClick={onContinueRiding}
            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-stone-950 font-bold rounded-xl shadow-lg transition"
          >
            <Compass className="w-5 h-5" />
            <span>Kontynuuj Swobodną Jazdę</span>
          </button>
          <button
            onClick={onRestart}
            className="flex items-center justify-center gap-2 px-5 py-3.5 bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 font-medium rounded-xl transition"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
            <span>Zacznij od Shire</span>
          </button>
        </div>
      </div>
    </div>
  );
};
