import React from 'react';
import { WORLD_MILESTONES, WORLD_LENGTH } from '../game/terrain';
import { X, Compass, MapPin, Sparkles, CheckCircle2 } from 'lucide-react';

interface WorldMapModalProps {
  playerZ: number;
  riderName: string;
  horseName: string;
  onClose: () => void;
}

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  playerZ,
  riderName,
  horseName,
  onClose,
}) => {
  const progressPercent = Math.min(100, Math.max(0, (playerZ / WORLD_LENGTH) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-none select-none">
      <div className="bg-[#1f1a14] border-2 border-[#b8860b] rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.9)] flex flex-col text-amber-100">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-amber-900/60 bg-[#16120d]">
          <div className="flex items-center gap-3">
            <Compass className="w-6 h-6 text-amber-400" />
            <div>
              <h2 className="text-xl font-serif font-bold text-amber-200 tracking-wide">
                Mapa Krain Śródziemia · Szlak pod Samotną Górę
              </h2>
              <p className="text-xs text-amber-400/80">
                Wyprawa: {riderName} na koniu {horseName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-amber-400 hover:text-white hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Parchment Map Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#2a2218] via-[#1c1611] to-[#120e0a]">
          {/* Progress bar line */}
          <div className="bg-[#18130e] border border-amber-800/60 rounded-2xl p-4 shadow-inner">
            <div className="flex justify-between items-center text-xs mb-2">
              <span className="font-serif font-semibold text-amber-300">
                Postęp podróży ku Samotnej Górze
              </span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {Math.round(progressPercent)}%
              </span>
            </div>
            <div className="w-full h-3 bg-stone-950 rounded-full overflow-hidden border border-amber-900/40">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 via-amber-500 to-yellow-400"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Interactive Visual Route */}
          <div className="relative pl-6 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-1 before:bg-gradient-to-b before:from-emerald-600 before:via-amber-600 before:to-yellow-500 before:rounded">
            {WORLD_MILESTONES.map((ms, index) => {
              const isPastOrCurrent = playerZ >= ms.zPos - 40;
              const isCurrent = Math.abs(playerZ - ms.zPos) < 120;

              return (
                <div key={ms.id} className="relative group">
                  {/* Pin node on line */}
                  <div
                    className={`absolute -left-[19px] top-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                      isCurrent
                        ? 'bg-amber-400 border-white text-stone-950 scale-125 shadow-[0_0_12px_#ffd700]'
                        : isPastOrCurrent
                        ? 'bg-emerald-600 border-emerald-300 text-white'
                        : 'bg-stone-900 border-stone-700 text-stone-500'
                    }`}
                  >
                    {isCurrent ? (
                      <MapPin className="w-3.5 h-3.5 fill-current" />
                    ) : isPastOrCurrent ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <span className="text-[10px] font-bold">{index + 1}</span>
                    )}
                  </div>

                  {/* Card description */}
                  <div
                    className={`ml-4 p-4 rounded-2xl border transition ${
                      isCurrent
                        ? 'bg-amber-950/60 border-amber-500 shadow-lg'
                        : isPastOrCurrent
                        ? 'bg-stone-900/60 border-stone-800'
                        : 'bg-stone-950/40 border-stone-900 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-serif font-bold text-base text-amber-200">
                        {ms.name}
                      </h4>
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-stone-950 border border-stone-800 text-amber-400 font-medium">
                        {ms.biome}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-stone-300 leading-relaxed">
                      {ms.description}
                    </p>
                    {isCurrent && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Jesteś w pobliżu tego miejsca!</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-amber-900/60 bg-[#16120d] flex justify-between items-center text-xs text-amber-400/80">
          <span>Wskazówka: Lisek Felek często czeka w pobliżu bezpiecznych polan</span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold transition"
          >
            Zamknij Mapę (M)
          </button>
        </div>
      </div>
    </div>
  );
};
