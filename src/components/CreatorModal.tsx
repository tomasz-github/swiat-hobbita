import React, { useState } from 'react';
import {
  RiderProfile,
  HorseProfile,
  HorseCoat,
  ManeColor,
  BlanketColor,
  HairColor,
  OutfitColor,
} from '../game/types';
import { Sparkles, Check, X, Dice5 } from 'lucide-react';
import { soundEngine } from '../game/audio';

interface CreatorModalProps {
  initialRider: RiderProfile;
  initialHorse: HorseProfile;
  onSave: (rider: RiderProfile, horse: HorseProfile) => void;
  onClose: () => void;
}

const RIDER_NAMES = [
  'Alicja Srebrzysta',
  'Maja Wierzbowa',
  'Zofia z Zielonych Wzgórz',
  'Lena Gwiazda Wieczorna',
  'Klara Złoty Promień',
  'Emilia Pod Pagórkiem',
];

const HORSE_NAMES = [
  'Gwiezdny Cwał',
  'Iskierka',
  'Mgławica',
  'Srebrny Wicher',
  'Złota Jutrzenka',
  'Cień Nocy',
  'Bursztyn',
  'Mleczna Droga',
];

export const CreatorModal: React.FC<CreatorModalProps> = ({
  initialRider,
  initialHorse,
  onSave,
  onClose,
}) => {
  const [tab, setTab] = useState<'rider' | 'horse'>('rider');
  const [rider, setRider] = useState<RiderProfile>({ ...initialRider });
  const [horse, setHorse] = useState<HorseProfile>({ ...initialHorse });

  const coats: Array<{ id: HorseCoat; name: string; color: string; desc: string }> = [
    { id: 'palomino', name: 'Palomino (Złoty)', color: '#e5a65e', desc: 'Złocista maść z jasną grzywą' },
    { id: 'kary', name: 'Kary (Fryzyjski)', color: '#1a1a1e', desc: 'Głęboka, lśniąca krucza czerń' },
    { id: 'siwy', name: 'Siwy Jabłkowity', color: '#b8bdc7', desc: 'Srebrny w delikatne jabłkowite cienie' },
    { id: 'kasztan', name: 'Kasztan', color: '#873e23', desc: 'Ciepły, szlachetny mahoniowy kasztan' },
    { id: 'bulany', name: 'Bułany', color: '#c9a468', desc: 'Piaskowy odcień z ciemnymi akcentami' },
    { id: 'srokaty', name: 'Srokaty (Pinto)', color: '#6e391b', desc: 'Wyraziste białe łaty na kasztanie' },
  ];

  const manes: Array<{ id: ManeColor; name: string; color: string }> = [
    { id: 'golden', name: 'Złocista', color: '#f6d98f' },
    { id: 'black', name: 'Kruczoczarna', color: '#1a1a1e' },
    { id: 'white', name: 'Śnieżnobiała', color: '#ffffff' },
    { id: 'chestnut', name: 'Kasztanowa', color: '#5a2512' },
    { id: 'silver', name: 'Srebrzysta', color: '#d8dde5' },
  ];

  const blankets: Array<{ id: BlanketColor; name: string; color: string }> = [
    { id: 'emerald', name: 'Szmaragd Shire', color: '#1f7a4d' },
    { id: 'lavender', name: 'Elfi Fiolet', color: '#8a5a9e' },
    { id: 'rose', name: 'Różany Kwiat', color: '#d85c7a' },
    { id: 'celestial', name: 'Gwiezdny Błękit', color: '#2563eb' },
    { id: 'amber', name: 'Złoty Bursztyn', color: '#d97706' },
  ];

  const hairs: Array<{ id: HairColor; name: string; color: string }> = [
    { id: 'blonde', name: 'Jasny Blond', color: '#f4ce68' },
    { id: 'brown', name: 'Czekoladowy Brąz', color: '#4a2e18' },
    { id: 'raven', name: 'Krucza Czerń', color: '#1a1a20' },
    { id: 'auburn', name: 'Rudy / Miedziany', color: '#8b321a' },
    { id: 'silver', name: 'Srebrzysty Popiel', color: '#e2e5ec' },
  ];

  const outfits: Array<{ id: OutfitColor; name: string; color: string }> = [
    { id: 'shire_green', name: 'Szmaragd Shire', color: '#2e6f40' },
    { id: 'elven_violet', name: 'Fiolet Rivendell', color: '#6d3885' },
    { id: 'rose_pink', name: 'Różany Płaszcz', color: '#b53b61' },
    { id: 'celestial_blue', name: 'Błękit Gwiazd', color: '#2255a4' },
    { id: 'dunedain_grey', name: 'Płaszcz Wędrowca', color: '#3d434d' },
  ];

  const handleRandomizeRider = () => {
    const randomName = RIDER_NAMES[Math.floor(Math.random() * RIDER_NAMES.length)];
    const randomHair = hairs[Math.floor(Math.random() * hairs.length)].id;
    const randomOutfit = outfits[Math.floor(Math.random() * outfits.length)].id;
    setRider({ name: randomName, hairColor: randomHair, outfitColor: randomOutfit });
  };

  const handleRandomizeHorse = () => {
    const randomName = HORSE_NAMES[Math.floor(Math.random() * HORSE_NAMES.length)];
    const randomCoat = coats[Math.floor(Math.random() * coats.length)].id;
    const randomMane = manes[Math.floor(Math.random() * manes.length)].id;
    const randomBlanket = blankets[Math.floor(Math.random() * blankets.length)].id;
    setHorse({ name: randomName, coat: randomCoat, maneColor: randomMane, blanketColor: randomBlanket });
    soundEngine.playWhinny();
  };

  const handleSave = () => {
    soundEngine.playStarBurst();
    onSave(rider, horse);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-none">
      <div className="bg-stone-900 border border-amber-500/40 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col text-stone-100">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-stone-800 bg-stone-950/60 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-serif font-bold text-amber-200">
              Kreator Bohaterki i Konia
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-stone-800 bg-stone-950/40 p-2 gap-2">
          <button
            onClick={() => setTab('rider')}
            className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition ${
              tab === 'rider'
                ? 'bg-amber-600/30 text-amber-200 border border-amber-500/50 shadow'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            👤 Twoja Bohaterka
          </button>
          <button
            onClick={() => setTab('horse')}
            className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition ${
              tab === 'horse'
                ? 'bg-amber-600/30 text-amber-200 border border-amber-500/50 shadow'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            🐎 Twój Koń (Star Stable)
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-6 flex-1">
          {tab === 'rider' ? (
            <>
              {/* Rider Name */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-amber-200">
                    Twoje Imię i Nazwisko
                  </label>
                  <button
                    onClick={handleRandomizeRider}
                    className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300"
                  >
                    <Dice5 className="w-3.5 h-3.5" />
                    <span>Losuj</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={rider.name}
                  onChange={(e) => setRider({ ...rider, name: e.target.value })}
                  placeholder="np. Alicja Srebrzysta"
                  maxLength={30}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-4 py-2.5 text-amber-100 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Hair Color */}
              <div>
                <label className="text-sm font-semibold text-amber-200 block mb-2.5">
                  Kolor Włosów (Warkocz)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {hairs.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => setRider({ ...rider, hairColor: h.id })}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-xs transition ${
                        rider.hairColor === h.id
                          ? 'border-amber-400 bg-amber-500/20 text-white shadow'
                          : 'border-stone-800 bg-stone-950/60 text-stone-300 hover:border-stone-700'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full border border-black/40 shadow-inner flex-shrink-0" style={{ backgroundColor: h.color }} />
                      <span className="truncate">{h.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Outfit Color */}
              <div>
                <label className="text-sm font-semibold text-amber-200 block mb-2.5">
                  Strój Jeździecki & Płaszcz
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {outfits.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setRider({ ...rider, outfitColor: o.id })}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-xs transition ${
                        rider.outfitColor === o.id
                          ? 'border-amber-400 bg-amber-500/20 text-white shadow'
                          : 'border-stone-800 bg-stone-950/60 text-stone-300 hover:border-stone-700'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full border border-black/40 shadow-inner flex-shrink-0" style={{ backgroundColor: o.color }} />
                      <span className="truncate">{o.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Horse Name */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-amber-200">
                    Nazwa Konia
                  </label>
                  <button
                    onClick={handleRandomizeHorse}
                    className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300"
                  >
                    <Dice5 className="w-3.5 h-3.5" />
                    <span>Losuj Konia</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={horse.name}
                  onChange={(e) => setHorse({ ...horse, name: e.target.value })}
                  placeholder="np. Gwiezdny Cwał"
                  maxLength={30}
                  className="w-full bg-stone-950 border border-stone-700 rounded-xl px-4 py-2.5 text-amber-100 focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Horse Coat */}
              <div>
                <label className="text-sm font-semibold text-amber-200 block mb-2.5">
                  Maść Konia
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {coats.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setHorse({ ...horse, coat: c.id })}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition ${
                        horse.coat === c.id
                          ? 'border-amber-400 bg-amber-500/20 text-white shadow'
                          : 'border-stone-800 bg-stone-950/60 text-stone-300 hover:border-stone-700'
                      }`}
                    >
                      <span className="w-6 h-6 rounded-full border border-white/20 shadow-md flex-shrink-0" style={{ backgroundColor: c.color }} />
                      <div className="overflow-hidden">
                        <div className="text-xs font-semibold text-amber-100">{c.name}</div>
                        <div className="text-[10px] text-stone-400 truncate">{c.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mane & Tail */}
              <div>
                <label className="text-sm font-semibold text-amber-200 block mb-2.5">
                  Kolor Grzywy i Ogona
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {manes.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setHorse({ ...horse, maneColor: m.id })}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-xs transition ${
                        horse.maneColor === m.id
                          ? 'border-amber-400 bg-amber-500/20 text-white shadow'
                          : 'border-stone-800 bg-stone-950/60 text-stone-300 hover:border-stone-700'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full border border-black/40 flex-shrink-0" style={{ backgroundColor: m.color }} />
                      <span className="truncate">{m.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Saddle Blanket */}
              <div>
                <label className="text-sm font-semibold text-amber-200 block mb-2.5">
                  Czafrak Jeździecki (Pikowana Derka)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {blankets.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setHorse({ ...horse, blanketColor: b.id })}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left text-xs transition ${
                        horse.blanketColor === b.id
                          ? 'border-amber-400 bg-amber-500/20 text-white shadow'
                          : 'border-stone-800 bg-stone-950/60 text-stone-300 hover:border-stone-700'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full border border-black/40 flex-shrink-0" style={{ backgroundColor: b.color }} />
                      <span className="truncate">{b.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-5 border-t border-stone-800 bg-stone-950/80 flex justify-end gap-3 sticky bottom-0 z-10">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-stone-700 text-stone-300 hover:bg-stone-800 text-sm font-medium transition"
          >
            Anuluj
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold text-sm shadow-lg transition"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Zapisz i Zastosuj</span>
          </button>
        </div>
      </div>
    </div>
  );
};
