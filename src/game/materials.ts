import * as THREE from 'three';
import { HorseCoat, ManeColor, BlanketColor, HairColor, OutfitColor } from './types';

// Procedural Canvas Textures (zero external 404 dependencies)
function createDappledTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base grey
  ctx.fillStyle = '#b0b5be';
  ctx.fillRect(0, 0, 512, 512);

  // Dapple circles (semi-translucent lighter & darker patches)
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 8 + Math.random() * 16;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
    const isLight = Math.random() > 0.4;
    grad.addColorStop(0, isLight ? 'rgba(235, 238, 245, 0.45)' : 'rgba(120, 125, 135, 0.3)');
    grad.addColorStop(1, 'rgba(176, 181, 190, 0)');
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

  // Rich chestnut base
  ctx.fillStyle = '#6e391b';
  ctx.fillRect(0, 0, 512, 512);

  // Large smooth white pinto/paint patches
  ctx.fillStyle = '#f5f4ef';
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    let cx = Math.random() * 512;
    let cy = Math.random() * 512;
    ctx.moveTo(cx, cy);
    const points = 6 + Math.floor(Math.random() * 4);
    const radius = 50 + Math.random() * 80;
    for (let p = 0; p < points; p++) {
      const angle = (p / points) * Math.PI * 2;
      const dist = radius * (0.6 + Math.random() * 0.8);
      ctx.lineTo(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist);
    }
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createSaddlePadTexture(baseColorHex: string, patternHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColorHex;
  ctx.fillRect(0, 0, 256, 256);

  // Quilted diamond stitch pattern
  ctx.strokeStyle = patternHex;
  ctx.lineWidth = 3;
  const step = 28;
  for (let i = -256; i < 512; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i, 256);
    ctx.lineTo(i + 256, 0);
    ctx.stroke();
  }

  // Golden / silver embroidered border
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ffd700';
  ctx.strokeRect(6, 6, 244, 244);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
  return texture;
}

// Material Library Factory
export class MaterialPalette {
  public dappledTex: THREE.CanvasTexture;
  public pintoTex: THREE.CanvasTexture;
  public starTex: THREE.CanvasTexture;

  constructor() {
    this.dappledTex = createDappledTexture();
    this.pintoTex = createPintoTexture();
    this.starTex = createStarParticleTexture();
  }

  public getHorseCoatMaterial(coat: HorseCoat): THREE.MeshStandardMaterial {
    switch (coat) {
      case 'palomino':
        return new THREE.MeshStandardMaterial({
          color: 0xe5a65e,
          roughness: 0.45,
          metalness: 0.05,
        });
      case 'kary': // Friesian Jet Black with sleek sheen
        return new THREE.MeshStandardMaterial({
          color: 0x18181c,
          roughness: 0.28,
          metalness: 0.12,
        });
      case 'siwy': // Dappled Grey
        return new THREE.MeshStandardMaterial({
          map: this.dappledTex,
          roughness: 0.5,
          metalness: 0.02,
        });
      case 'kasztan': // Warm chestnut
        return new THREE.MeshStandardMaterial({
          color: 0x873e23,
          roughness: 0.42,
          metalness: 0.04,
        });
      case 'bulany': // Warm buckskin with dark shading
        return new THREE.MeshStandardMaterial({
          color: 0xc9a468,
          roughness: 0.44,
          metalness: 0.05,
        });
      case 'srokaty': // Pinto / Paint horse
        return new THREE.MeshStandardMaterial({
          map: this.pintoTex,
          roughness: 0.46,
          metalness: 0.03,
        });
    }
  }

  public getManeMaterial(color: ManeColor): THREE.MeshStandardMaterial {
    switch (color) {
      case 'golden':
        return new THREE.MeshStandardMaterial({ color: 0xf6d98f, roughness: 0.4, metalness: 0.08 });
      case 'black':
        return new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.35, metalness: 0.05 });
      case 'white':
        return new THREE.MeshStandardMaterial({ color: 0xf5f5fa, roughness: 0.38, metalness: 0.05 });
      case 'chestnut':
        return new THREE.MeshStandardMaterial({ color: 0x5a2512, roughness: 0.45, metalness: 0.02 });
      case 'silver':
        return new THREE.MeshStandardMaterial({ color: 0xd8dde5, roughness: 0.32, metalness: 0.15 });
    }
  }

  public getBlanketMaterial(blanket: BlanketColor): THREE.MeshStandardMaterial {
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
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.55,
      metalness: 0.05,
    });
  }

  public getRiderHairMaterial(hair: HairColor): THREE.MeshStandardMaterial {
    switch (hair) {
      case 'blonde':
        return new THREE.MeshStandardMaterial({ color: 0xf4ce68, roughness: 0.35 });
      case 'brown':
        return new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.4 });
      case 'raven':
        return new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.3 });
      case 'auburn':
        return new THREE.MeshStandardMaterial({ color: 0x8b321a, roughness: 0.38 });
      case 'silver':
        return new THREE.MeshStandardMaterial({ color: 0xe2e5ec, roughness: 0.28 });
    }
  }

  public getRiderOutfitMaterial(outfit: OutfitColor): THREE.MeshStandardMaterial {
    switch (outfit) {
      case 'shire_green':
        return new THREE.MeshStandardMaterial({ color: 0x2e6f40, roughness: 0.5 });
      case 'elven_violet':
        return new THREE.MeshStandardMaterial({ color: 0x6d3885, roughness: 0.45 });
      case 'rose_pink':
        return new THREE.MeshStandardMaterial({ color: 0xb53b61, roughness: 0.48 });
      case 'celestial_blue':
        return new THREE.MeshStandardMaterial({ color: 0x2255a4, roughness: 0.45 });
      case 'dunedain_grey':
        return new THREE.MeshStandardMaterial({ color: 0x3d434d, roughness: 0.55 });
    }
  }

  public dispose() {
    this.dappledTex.dispose();
    this.pintoTex.dispose();
    this.starTex.dispose();
  }
}
