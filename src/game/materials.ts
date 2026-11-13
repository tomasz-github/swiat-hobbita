import * as THREE from 'three';
import { HorseCoat, ManeColor, BlanketColor, HairColor, OutfitColor } from './types';

// Deterministic pseudo-random helper so procedural textures look consistent
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Fine directional hair/fur bump map (linear space)
function createCoatBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(101);

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 9500; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const len = 8 + rand() * 16;
    const shade = Math.floor(100 + rand() * 56);
    ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
    ctx.lineWidth = 0.7 + rand() * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 2.5, y + len);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

// Silky flowing hair texture for mane & tail (vertical striations)
function createManeHairTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(112);

  ctx.fillStyle = '#dcdcdc';
  ctx.fillRect(0, 0, 256, 512);

  for (let i = 0; i < 1600; i++) {
    const x = rand() * 256;
    const shade = Math.floor(165 + rand() * 90);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},0.45)`;
    ctx.lineWidth = 0.8 + rand() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(
      x + (rand() - 0.5) * 14,
      170,
      x + (rand() - 0.5) * 14,
      340,
      x + (rand() - 0.5) * 8,
      512
    );
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Rich coat albedo texture with subtle muscular dappling, warmth variation & silky strokes
function createSolidCoatTexture(
  baseHex: string,
  highlightHex: string,
  shadowHex: string,
  seed: number,
  dappleIntensity = 0.16
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(seed);

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, highlightHex);
  grad.addColorStop(0.45, baseHex);
  grad.addColorStop(1, shadowHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 320; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 8 + rand() * 22;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    const bright = rand() > 0.44;
    g.addColorStop(0, bright ? `rgba(255,248,235,${dappleIntensity})` : `rgba(26,15,10,${dappleIntensity * 0.8})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.09;
  for (let i = 0; i < 3400; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    ctx.strokeStyle = rand() > 0.5 ? '#ffffff' : '#1a100a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 4, y + 8 + rand() * 12);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createDappledTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(202);

  const baseGrad = ctx.createLinearGradient(0, 0, 0, 512);
  baseGrad.addColorStop(0, '#f3f5f8');
  baseGrad.addColorStop(0.55, '#c6ccd6');
  baseGrad.addColorStop(1, '#98a0ae');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 480; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 8 + rand() * 15;
    const grad = ctx.createRadialGradient(x, y, r * 0.25, x, y, r);
    const isLight = rand() > 0.34;
    if (isLight) {
      grad.addColorStop(0, 'rgba(250, 252, 255, 0.62)');
      grad.addColorStop(0.66, 'rgba(122, 130, 146, 0.3)');
      grad.addColorStop(1, 'rgba(198, 204, 214, 0)');
    } else {
      grad.addColorStop(0, 'rgba(105, 113, 128, 0.3)');
      grad.addColorStop(1, 'rgba(198, 204, 214, 0)');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createPintoTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(303);

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#964c24');
  grad.addColorStop(0.5, '#723718');
  grad.addColorStop(1, '#4f220c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 16; i++) {
    const cx = rand() * 512;
    const cy = rand() * 512;
    const points = 11 + Math.floor(rand() * 5);
    const radius = 40 + rand() * 72;

    ctx.save();
    ctx.beginPath();
    for (let p = 0; p <= points; p++) {
      const idx = p % points;
      const angle = (idx / points) * Math.PI * 2;
      const dist = radius * (0.62 + (Math.sin(idx * 2.3 + i) * 0.25 + 0.25));
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      if (p === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#f8f6f0';
    ctx.shadowColor = 'rgba(248, 246, 240, 0.75)';
    ctx.shadowBlur = 7;
    ctx.fill();
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createSaddlePadTexture(baseColorHex: string, patternHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColorHex;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle woven fabric speckles
  const rand = seededRandom(77);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 2000; i++) {
    ctx.fillRect(rand() * 512, rand() * 512, 2, 2);
  }

  // Quilted diamond stitch pattern
  ctx.strokeStyle = patternHex;
  ctx.lineWidth = 4;
  const step = 38;
  for (let i = -512; i < 1024; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 512, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i, 512);
    ctx.lineTo(i + 512, 0);
    ctx.stroke();
  }

  // Cream cord piping + double golden embroidered border
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#fff5d6';
  ctx.strokeRect(24, 24, 464, 464);

  ctx.lineWidth = 14;
  ctx.strokeStyle = '#eab308';
  ctx.strokeRect(8, 8, 496, 496);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Tooled Leather Texture (for saddle, bridle, boots, belts)
function createLeatherTexture(baseHex = '#462413', grainHex = '#2a1308'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(314);

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1400; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 1 + rand() * 2.5;
    ctx.fillStyle = rand() > 0.5 ? grainHex : 'rgba(130, 75, 45, 0.18)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle stitched edge border
  ctx.strokeStyle = 'rgba(225, 185, 130, 0.35)';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, 240, 240);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createGroundDetailTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(404);

  ctx.fillStyle = '#e6e8e3';
  ctx.fillRect(0, 0, 512, 512);

  // Soil speckles, grass blade tufts, tiny pebbles
  for (let i = 0; i < 5500; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 1 + rand() * 3.2;
    const shade = Math.floor(190 + rand() * 64);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine blades / micro texture lines
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 1800; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    ctx.strokeStyle = rand() > 0.5 ? '#b4b8b0' : '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 6, y - 5 - rand() * 8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(92, 400);
  return tex;
}

export function createGroundBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(405);

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 3200; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 1 + rand() * 3;
    const v = Math.floor(95 + rand() * 70);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(92, 400);
  return tex;
}

export function createWoodGrainTexture(baseHex = '#5d3b23', grainHex = '#382010'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(505);

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);

  // Plank grain & knots
  ctx.strokeStyle = grainHex;
  for (let i = 0; i < 140; i++) {
    const x = rand() * 512;
    ctx.lineWidth = 1 + rand() * 2.5;
    ctx.globalAlpha = 0.24 + rand() * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rand() - 0.5) * 20, 170, x + (rand() - 0.5) * 20, 340, x, 512);
    ctx.stroke();
  }
  // Knots
  for (let k = 0; k < 6; k++) {
    const kx = 40 + rand() * 430;
    const ky = 40 + rand() * 430;
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = grainHex;
    for (let r = 3; r <= 12; r += 3) {
      ctx.beginPath();
      ctx.ellipse(kx, ky, r, r * 1.8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Crisp plank joints
  ctx.strokeStyle = 'rgba(20, 10, 4, 0.45)';
  ctx.lineWidth = 3;
  for (let x = 64; x < 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createBarkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(555);

  ctx.fillStyle = '#4e3523';
  ctx.fillRect(0, 0, 256, 512);

  for (let i = 0; i < 240; i++) {
    const x = rand() * 256;
    const y = rand() * 512;
    const h = 25 + rand() * 65;
    ctx.fillStyle = rand() > 0.45 ? '#352214' : '#684830';
    ctx.globalAlpha = 0.4 + rand() * 0.4;
    ctx.fillRect(x, y, 2 + rand() * 5, h);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createFoliageTexture(baseHex = '#3c7e2c', lightHex = '#56a33e', darkHex = '#23531a'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(577);

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 420; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const rx = 5 + rand() * 8;
    const ry = 3 + rand() * 4;
    ctx.fillStyle = rand() > 0.5 ? lightHex : darkHex;
    ctx.globalAlpha = 0.45 + rand() * 0.35;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createThatchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(588);

  ctx.fillStyle = '#826d47';
  ctx.fillRect(0, 0, 256, 256);

  // Layered straw bundles & shingled rows
  for (let y = 0; y < 256; y += 24) {
    ctx.fillStyle = 'rgba(42, 32, 16, 0.35)';
    ctx.fillRect(0, y, 256, 3);
  }
  for (let i = 0; i < 1200; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    ctx.strokeStyle = rand() > 0.45 ? '#a58c5a' : '#58482c';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 4, y + 10 + rand() * 14);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

export function createStoneTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(606);

  ctx.fillStyle = '#626661';
  ctx.fillRect(0, 0, 512, 512);

  // Fitted rustic stonework blocks with mortar & subtle moss
  let y = 0;
  while (y < 512) {
    const rowH = 28 + Math.floor(rand() * 20);
    let x = -10;
    while (x < 512) {
      const w = 36 + Math.floor(rand() * 34);
      const v = Math.floor(102 + rand() * 52);
      const warm = Math.floor(rand() * 14) - 6;
      ctx.fillStyle = `rgb(${v + warm},${v + 2},${v - 3})`;
      ctx.fillRect(x + 2, y + 2, w - 4, rowH - 4);
      ctx.strokeStyle = 'rgba(34, 36, 34, 0.65)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 2, y + 2, w - 4, rowH - 4);
      x += w;
    }
    y += rowH;
  }

  // Mossy weathering spots
  for (let m = 0; m < 80; m++) {
    const mx = rand() * 512;
    const my = rand() * 512;
    const mr = 6 + rand() * 16;
    const g = ctx.createRadialGradient(mx, my, 1, mx, my, mr);
    g.addColorStop(0, 'rgba(65, 105, 48, 0.36)');
    g.addColorStop(1, 'rgba(65, 105, 48, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createMountainRockTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(650);

  ctx.fillStyle = '#484d57';
  ctx.fillRect(0, 0, 512, 512);

  // Craggy granite strata & crevices
  for (let i = 0; i < 400; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const w = 24 + rand() * 64;
    const h = 8 + rand() * 24;
    const v = Math.floor(54 + rand() * 48);
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 12},0.45)`;
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeStyle = 'rgba(20, 24, 30, 0.5)';
  for (let c = 0; c < 90; c++) {
    const x = rand() * 512;
    const y = rand() * 512;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 45, y + 18 + rand() * 40);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function createPlaidTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#9b1c1c';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = 'rgba(20, 50, 35, 0.5)';
  for (let i = 0; i < 256; i += 32) {
    ctx.fillRect(i, 0, 14, 256);
    ctx.fillRect(0, i, 256, 14);
  }

  ctx.fillStyle = 'rgba(250, 204, 21, 0.55)';
  for (let i = 6; i < 256; i += 32) {
    ctx.fillRect(i, 0, 3, 256);
    ctx.fillRect(0, i, 256, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createCanvasFabricTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(707);

  ctx.fillStyle = '#e7ddc6';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle linen cross-weave
  ctx.strokeStyle = 'rgba(145, 130, 102, 0.2)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 256; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  // Slight natural weathering gradient
  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = `rgba(120, 105, 80, ${rand() * 0.08})`;
    ctx.beginPath();
    ctx.arc(rand() * 256, rand() * 256, 4 + rand() * 14, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createStarParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.2, 'rgba(255, 240, 160, 0.9)');
  grad.addColorStop(0.5, 'rgba(255, 210, 80, 0.4)');
  grad.addColorStop(1, 'rgba(255, 200, 50, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Material Library Factory
export class MaterialPalette {
  public coatBumpTex: THREE.CanvasTexture;
  public maneHairTex: THREE.CanvasTexture;
  public palominoTex: THREE.CanvasTexture;
  public karyTex: THREE.CanvasTexture;
  public kasztanTex: THREE.CanvasTexture;
  public bulanyTex: THREE.CanvasTexture;
  public dappledTex: THREE.CanvasTexture;
  public pintoTex: THREE.CanvasTexture;
  public starTex: THREE.CanvasTexture;
  public leatherTex: THREE.CanvasTexture;
  public woodTex: THREE.CanvasTexture;
  public barkTex: THREE.CanvasTexture;
  public appleFoliageTex: THREE.CanvasTexture;
  public willowFoliageTex: THREE.CanvasTexture;
  public pineFoliageTex: THREE.CanvasTexture;
  public thatchTex: THREE.CanvasTexture;
  public stoneTex: THREE.CanvasTexture;
  public mountainRockTex: THREE.CanvasTexture;
  public plaidTex: THREE.CanvasTexture;
  public canvasTex: THREE.CanvasTexture;
  private extraTextures: THREE.Texture[] = [];

  constructor(maxAnisotropy = 4) {
    this.coatBumpTex = createCoatBumpTexture();
    this.maneHairTex = createManeHairTexture();
    this.palominoTex = createSolidCoatTexture('#e6a95c', '#f5c784', '#c58038', 11, 0.14);
    this.karyTex = createSolidCoatTexture('#1a1b22', '#2b2d38', '#0d0e12', 22, 0.12);
    this.kasztanTex = createSolidCoatTexture('#8e3f20', '#ac542e', '#622610', 33, 0.16);
    this.bulanyTex = createSolidCoatTexture('#cca362', '#e4bf82', '#9b7438', 44, 0.15);
    this.dappledTex = createDappledTexture();
    this.pintoTex = createPintoTexture();
    this.starTex = createStarParticleTexture();
    this.leatherTex = createLeatherTexture();
    this.woodTex = createWoodGrainTexture();
    this.barkTex = createBarkTexture();
    this.appleFoliageTex = createFoliageTexture('#3c7e2c', '#5ba842', '#26581c');
    this.willowFoliageTex = createFoliageTexture('#236450', '#34856c', '#184738');
    this.pineFoliageTex = createFoliageTexture('#1b4932', '#2a6848', '#113021');
    this.thatchTex = createThatchTexture();
    this.stoneTex = createStoneTexture();
    this.mountainRockTex = createMountainRockTexture();
    this.plaidTex = createPlaidTexture();
    this.canvasTex = createCanvasFabricTexture();

    [
      this.coatBumpTex,
      this.maneHairTex,
      this.palominoTex,
      this.karyTex,
      this.kasztanTex,
      this.bulanyTex,
      this.dappledTex,
      this.pintoTex,
      this.leatherTex,
      this.woodTex,
      this.barkTex,
      this.appleFoliageTex,
      this.willowFoliageTex,
      this.pineFoliageTex,
      this.thatchTex,
      this.stoneTex,
      this.mountainRockTex,
      this.plaidTex,
      this.canvasTex,
    ].forEach((tex) => {
      tex.anisotropy = maxAnisotropy;
    });
  }

  public getHorseCoatMaterial(coat: HorseCoat): THREE.MeshPhysicalMaterial {
    switch (coat) {
      case 'palomino':
        return new THREE.MeshPhysicalMaterial({
          map: this.palominoTex,
          bumpMap: this.coatBumpTex,
          bumpScale: 0.009,
          roughness: 0.36,
          metalness: 0.03,
          sheen: 0.48,
          sheenRoughness: 0.4,
          sheenColor: new THREE.Color(0xffe7b8),
          clearcoat: 0.18,
          clearcoatRoughness: 0.5,
        });
      case 'kary':
        return new THREE.MeshPhysicalMaterial({
          map: this.karyTex,
          bumpMap: this.coatBumpTex,
          bumpScale: 0.008,
          roughness: 0.24,
          metalness: 0.08,
          sheen: 0.55,
          sheenRoughness: 0.34,
          sheenColor: new THREE.Color(0x64748b),
          clearcoat: 0.3,
          clearcoatRoughness: 0.36,
        });
      case 'siwy':
        return new THREE.MeshPhysicalMaterial({
          map: this.dappledTex,
          bumpMap: this.coatBumpTex,
          bumpScale: 0.009,
          roughness: 0.4,
          metalness: 0.02,
          sheen: 0.42,
          sheenRoughness: 0.48,
          sheenColor: new THREE.Color(0xf8fafc),
          clearcoat: 0.14,
          clearcoatRoughness: 0.56,
        });
      case 'kasztan':
        return new THREE.MeshPhysicalMaterial({
          map: this.kasztanTex,
          bumpMap: this.coatBumpTex,
          bumpScale: 0.009,
          roughness: 0.33,
          metalness: 0.04,
          sheen: 0.48,
          sheenRoughness: 0.4,
          sheenColor: new THREE.Color(0xfdba74),
          clearcoat: 0.2,
          clearcoatRoughness: 0.46,
        });
      case 'bulany':
        return new THREE.MeshPhysicalMaterial({
          map: this.bulanyTex,
          bumpMap: this.coatBumpTex,
          bumpScale: 0.009,
          roughness: 0.37,
          metalness: 0.03,
          sheen: 0.42,
          sheenRoughness: 0.44,
          sheenColor: new THREE.Color(0xfef3c7),
          clearcoat: 0.16,
          clearcoatRoughness: 0.52,
        });
      case 'srokaty':
        return new THREE.MeshPhysicalMaterial({
          map: this.pintoTex,
          bumpMap: this.coatBumpTex,
          bumpScale: 0.009,
          roughness: 0.38,
          metalness: 0.02,
          sheen: 0.4,
          sheenRoughness: 0.46,
          sheenColor: new THREE.Color(0xfffbeb),
          clearcoat: 0.16,
          clearcoatRoughness: 0.52,
        });
    }
  }

  public getHorseMuzzleMaterial(coat: HorseCoat): THREE.MeshPhysicalMaterial {
    let color = 0x4b4240;
    if (coat === 'palomino' || coat === 'siwy') color = 0x6b6062;
    else if (coat === 'kasztan') color = 0x5c3024;
    else if (coat === 'kary' || coat === 'bulany') color = 0x222024;
    else if (coat === 'srokaty') color = 0xd9b3a3;
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.52,
      metalness: 0.02,
      sheen: 0.65,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color(0xd6d3d1),
    });
  }

  public getHorsePointsMaterial(coat: HorseCoat): THREE.MeshPhysicalMaterial {
    const isDarkPoints = coat === 'bulany';
    return new THREE.MeshPhysicalMaterial({
      color: isDarkPoints ? 0x231e1b : 0xf4f3ef,
      bumpMap: this.coatBumpTex,
      bumpScale: 0.007,
      roughness: 0.44,
      metalness: 0.02,
      sheen: 0.38,
      sheenRoughness: 0.48,
    });
  }

  public getManeMaterial(color: ManeColor): THREE.MeshPhysicalMaterial {
    let hex = 0xf6d98f;
    let sheenCol = 0xfff8dc;
    switch (color) {
      case 'golden':
        hex = 0xf7db92;
        sheenCol = 0xfff9db;
        break;
      case 'black':
        hex = 0x16171d;
        sheenCol = 0x64748b;
        break;
      case 'white':
        hex = 0xf6f7fb;
        sheenCol = 0xffffff;
        break;
      case 'chestnut':
        hex = 0x5d2614;
        sheenCol = 0xc26d42;
        break;
      case 'silver':
        hex = 0xdce1eb;
        sheenCol = 0xffffff;
        break;
    }
    return new THREE.MeshPhysicalMaterial({
      color: hex,
      map: this.maneHairTex,
      bumpMap: this.maneHairTex,
      bumpScale: 0.015,
      roughness: 0.34,
      metalness: 0.06,
      sheen: 0.65,
      sheenRoughness: 0.32,
      sheenColor: new THREE.Color(sheenCol),
    });
  }

  public getBlanketMaterial(blanket: BlanketColor): THREE.MeshPhysicalMaterial {
    let base = '#2d6a4f';
    let pattern = '#1b4332';
    switch (blanket) {
      case 'emerald':
        base = '#1f7a4d';
        pattern = '#134e31';
        break;
      case 'lavender':
        base = '#8a5a9e';
        pattern = '#5c336e';
        break;
      case 'rose':
        base = '#d85c7a';
        pattern = '#a3364f';
        break;
      case 'celestial':
        base = '#2563eb';
        pattern = '#1e40af';
        break;
      case 'amber':
        base = '#d97706';
        pattern = '#92400e';
        break;
    }
    const tex = createSaddlePadTexture(base, pattern);
    this.extraTextures.push(tex);
    return new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: 0.65,
      metalness: 0.04,
      sheen: 0.55,
      sheenRoughness: 0.6,
    });
  }

  public getRiderHairMaterial(hair: HairColor): THREE.MeshPhysicalMaterial {
    let hex = 0xf4ce68;
    switch (hair) {
      case 'blonde':
        hex = 0xf3cd6a;
        break;
      case 'brown':
        hex = 0x4d2f1a;
        break;
      case 'raven':
        hex = 0x191a24;
        break;
      case 'auburn':
        hex = 0x8f3319;
        break;
      case 'silver':
        hex = 0xe3e7ef;
        break;
    }
    return new THREE.MeshPhysicalMaterial({
      color: hex,
      map: this.maneHairTex,
      bumpMap: this.maneHairTex,
      bumpScale: 0.012,
      roughness: 0.32,
      metalness: 0.06,
      sheen: 0.58,
      sheenRoughness: 0.34,
    });
  }

  public getRiderOutfitMaterial(outfit: OutfitColor): THREE.MeshPhysicalMaterial {
    let hex = 0x2e6f40;
    switch (outfit) {
      case 'shire_green':
        hex = 0x2b6e3f;
        break;
      case 'elven_violet':
        hex = 0x6d3885;
        break;
      case 'rose_pink':
        hex = 0xb53b61;
        break;
      case 'celestial_blue':
        hex = 0x2255a4;
        break;
      case 'dunedain_grey':
        hex = 0x3d434d;
        break;
    }
    return new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.55,
      metalness: 0.03,
      sheen: 0.6,
      sheenRoughness: 0.55,
    });
  }

  public dispose() {
    this.coatBumpTex.dispose();
    this.maneHairTex.dispose();
    this.palominoTex.dispose();
    this.karyTex.dispose();
    this.kasztanTex.dispose();
    this.bulanyTex.dispose();
    this.dappledTex.dispose();
    this.pintoTex.dispose();
    this.starTex.dispose();
    this.leatherTex.dispose();
    this.woodTex.dispose();
    this.barkTex.dispose();
    this.appleFoliageTex.dispose();
    this.willowFoliageTex.dispose();
    this.pineFoliageTex.dispose();
    this.thatchTex.dispose();
    this.stoneTex.dispose();
    this.mountainRockTex.dispose();
    this.plaidTex.dispose();
    this.canvasTex.dispose();
    this.extraTextures.forEach((t) => t.dispose());
    this.extraTextures = [];
  }
}
