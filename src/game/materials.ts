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
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(101);

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 4200; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const len = 6 + rand() * 12;
    const shade = Math.floor(108 + rand() * 44);
    ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
    ctx.lineWidth = 0.8 + rand() * 0.8;
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

// Rich coat albedo texture with subtle muscular dappling / warmth variation
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

  // Subtle natural dapples & hair sheen streaks
  for (let i = 0; i < 240; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 10 + rand() * 24;
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    const bright = rand() > 0.45;
    g.addColorStop(0, bright ? `rgba(255,248,235,${dappleIntensity})` : `rgba(30,18,12,${dappleIntensity * 0.75})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine silky coat strokes
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 2600; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    ctx.strokeStyle = rand() > 0.5 ? '#ffffff' : '#1a100a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 4, y + 8 + rand() * 10);
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
  baseGrad.addColorStop(0, '#eef1f6');
  baseGrad.addColorStop(0.55, '#c6cbd4');
  baseGrad.addColorStop(1, '#9ca3af');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Classic Star Stable dappled grey rings
  for (let i = 0; i < 420; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = 9 + rand() * 16;
    const grad = ctx.createRadialGradient(x, y, r * 0.25, x, y, r);
    const isLight = rand() > 0.35;
    if (isLight) {
      grad.addColorStop(0, 'rgba(248, 250, 255, 0.55)');
      grad.addColorStop(0.65, 'rgba(130, 138, 152, 0.28)');
      grad.addColorStop(1, 'rgba(198, 203, 212, 0)');
    } else {
      grad.addColorStop(0, 'rgba(110, 118, 132, 0.28)');
      grad.addColorStop(1, 'rgba(198, 203, 212, 0)');
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

  // Warm chestnut base
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#8b4722');
  grad.addColorStop(0.5, '#6e3618');
  grad.addColorStop(1, '#4f230d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Soft-edged white paint patches with natural organic lobes
  for (let i = 0; i < 16; i++) {
    const cx = rand() * 512;
    const cy = rand() * 512;
    const points = 10 + Math.floor(rand() * 5);
    const radius = 42 + rand() * 72;

    ctx.save();
    ctx.beginPath();
    for (let p = 0; p <= points; p++) {
      const idx = p % points;
      const angle = (idx / points) * Math.PI * 2;
      const dist = radius * (0.65 + (Math.sin(idx * 2.3 + i) * 0.25 + 0.25));
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      if (p === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#f8f6f0';
    ctx.shadowColor = 'rgba(248, 246, 240, 0.65)';
    ctx.shadowBlur = 8;
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

  // Quilted diamond stitch pattern
  ctx.strokeStyle = patternHex;
  ctx.lineWidth = 4;
  const step = 42;
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

  // Subtle cream inner piping + golden outer embroidered border
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#fff5d6';
  ctx.strokeRect(22, 22, 468, 468);

  ctx.lineWidth = 14;
  ctx.strokeStyle = '#eab308';
  ctx.strokeRect(8, 8, 496, 496);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGroundDetailTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(404);

  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 2400; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 1 + rand() * 3.5;
    const shade = Math.floor(205 + rand() * 50);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(42, 340);
  return tex;
}

export function createWoodGrainTexture(baseHex = '#593a24', grainHex = '#382112'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(505);

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = grainHex;
  for (let i = 0; i < 65; i++) {
    const x = rand() * 256;
    ctx.lineWidth = 1 + rand() * 2.2;
    ctx.globalAlpha = 0.25 + rand() * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rand() - 0.5) * 16, 85, x + (rand() - 0.5) * 16, 170, x, 256);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Subtle plank seams
  ctx.strokeStyle = 'rgba(20, 10, 4, 0.35)';
  ctx.lineWidth = 2;
  for (let x = 64; x < 256; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createStoneTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(606);

  ctx.fillStyle = '#6f7370';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 120; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const w = 14 + rand() * 28;
    const h = 10 + rand() * 20;
    const v = Math.floor(92 + rand() * 48);
    ctx.fillStyle = `rgb(${v},${v + 2},${v - 2})`;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(40,42,40,0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
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
  public palominoTex: THREE.CanvasTexture;
  public karyTex: THREE.CanvasTexture;
  public kasztanTex: THREE.CanvasTexture;
  public bulanyTex: THREE.CanvasTexture;
  public dappledTex: THREE.CanvasTexture;
  public pintoTex: THREE.CanvasTexture;
  public starTex: THREE.CanvasTexture;
  public woodTex: THREE.CanvasTexture;
  public stoneTex: THREE.CanvasTexture;
  private extraTextures: THREE.Texture[] = [];

  constructor(maxAnisotropy = 4) {
    this.coatBumpTex = createCoatBumpTexture();
    this.palominoTex = createSolidCoatTexture('#e6a95c', '#f5c784', '#c58038', 11, 0.14);
    this.karyTex = createSolidCoatTexture('#1a1b22', '#2b2d38', '#0d0e12', 22, 0.12);
    this.kasztanTex = createSolidCoatTexture('#8e3f20', '#ac542e', '#622610', 33, 0.16);
    this.bulanyTex = createSolidCoatTexture('#cca362', '#e4bf82', '#9b7438', 44, 0.15);
    this.dappledTex = createDappledTexture();
    this.pintoTex = createPintoTexture();
    this.starTex = createStarParticleTexture();
    this.woodTex = createWoodGrainTexture();
    this.stoneTex = createStoneTexture();

    [
      this.coatBumpTex,
      this.palominoTex,
      this.karyTex,
      this.kasztanTex,
      this.bulanyTex,
      this.dappledTex,
      this.pintoTex,
      this.woodTex,
      this.stoneTex,
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
          bumpScale: 0.008,
          roughness: 0.38,
          metalness: 0.03,
          sheen: 0.45,
          sheenRoughness: 0.42,
          sheenColor: new THREE.Color(0xffe7b8),
          clearcoat: 0.15,
          clearcoatRoughness: 0.55,
        });
      case 'kary': // Friesian Jet Black with lustrous sheen
        return new THREE.MeshPhysicalMaterial({
          map: this.karyTex,
          bumpMap: this.coatBumpTex,
          bumpScale: 0.007,
          roughness: 0.25,
          metalness: 0.08,
          sheen: 0.5,
          sheenRoughness: 0.35,
          sheenColor: new THREE.Color(0x4b5563),
          clearcoat: 0.28,
          clearcoatRoughness: 0.38,
        });
      case 'siwy': // Dappled Grey
        return new THREE.MeshPhysicalMaterial({
          map: this.dappledTex,
          bumpMap: this.coatBumpTex,
          bumpScale: 0.008,
          roughness: 0.42,
          metalness: 0.02,
          sheen: 0.4,
          sheenRoughness: 0.5,
          sheenColor: new THREE.Color(0xf8fafc),
          clearcoat: 0.12,
          clearcoatRoughness: 0.6,
        });
      case 'kasztan': // Rich glowing chestnut
        return new THREE.MeshPhysicalMaterial({
          map: this.kasztanTex,
          bumpMap: this.coatBumpTex,
          bumpScale: 0.008,
          roughness: 0.34,
          metalness: 0.04,
          sheen: 0.45,
          sheenRoughness: 0.42,
          sheenColor: new THREE.Color(0xfdba74),
          clearcoat: 0.18,
          clearcoatRoughness: 0.48,
        });
      case 'bulany': // Warm buckskin
        return new THREE.MeshPhysicalMaterial({
          map: this.bulanyTex,
          bumpMap: this.coatBumpTex,
          bumpScale: 0.008,
          roughness: 0.38,
          metalness: 0.03,
          sheen: 0.4,
          sheenRoughness: 0.46,
          sheenColor: new THREE.Color(0xfef3c7),
          clearcoat: 0.14,
          clearcoatRoughness: 0.55,
        });
      case 'srokaty': // Pinto / Paint horse
        return new THREE.MeshPhysicalMaterial({
          map: this.pintoTex,
          bumpMap: this.coatBumpTex,
          bumpScale: 0.008,
          roughness: 0.4,
          metalness: 0.02,
          sheen: 0.38,
          sheenRoughness: 0.48,
          sheenColor: new THREE.Color(0xfffbeb),
          clearcoat: 0.14,
          clearcoatRoughness: 0.55,
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
    // Buckskin ('bulany') has characteristic dark points; others get crisp white stockings/socks
    const isDarkPoints = coat === 'bulany';
    return new THREE.MeshPhysicalMaterial({
      color: isDarkPoints ? 0x231e1b : 0xf4f3ef,
      bumpMap: this.coatBumpTex,
      bumpScale: 0.006,
      roughness: 0.45,
      metalness: 0.02,
      sheen: 0.35,
      sheenRoughness: 0.5,
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
      bumpMap: this.coatBumpTex,
      bumpScale: 0.012,
      roughness: 0.34,
      metalness: 0.06,
      sheen: 0.6,
      sheenRoughness: 0.35,
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
      bumpMap: this.coatBumpTex,
      bumpScale: 0.009,
      roughness: 0.32,
      metalness: 0.06,
      sheen: 0.55,
      sheenRoughness: 0.35,
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
    this.palominoTex.dispose();
    this.karyTex.dispose();
    this.kasztanTex.dispose();
    this.bulanyTex.dispose();
    this.dappledTex.dispose();
    this.pintoTex.dispose();
    this.starTex.dispose();
    this.woodTex.dispose();
    this.stoneTex.dispose();
    this.extraTextures.forEach((t) => t.dispose());
    this.extraTextures = [];
  }
}
