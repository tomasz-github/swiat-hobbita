import * as THREE from 'three';
import { WorldMilestone } from './types';

export const WORLD_LENGTH = 1900;
export const WORLD_WIDTH = 140;

// Milestone definitions from Shire to Lonely Mountain
export const WORLD_MILESTONES: WorldMilestone[] = [
  {
    id: 'shire',
    name: 'Zielone Wzgórza Hobbitów',
    biome: 'The Shire',
    zPos: 50,
    description: 'Spokojna kraina hobbitów, pachnąca jabłkami, polnymi kwiatami i domowym chlebem.',
    visited: true,
  },
  {
    id: 'stable_haven',
    name: 'Opuszczona Stajnia pod Dębem',
    biome: 'Leśne Ostępy',
    zPos: 460,
    description: 'Stara stajnia wędrowców. Można tu wyczyścić konia, zebrać świeże jabłka i bezpiecznie odpocząć.',
    visited: false,
  },
  {
    id: 'elven_glade',
    name: 'Polana Liska Felka',
    biome: 'Leśne Ostępy',
    zPos: 720,
    description: 'Tajemniczy zakątek lasu pełen świetlików, gdzie figluje rudy lisek Felek.',
    visited: false,
  },
  {
    id: 'misty_pass',
    name: 'Wąwóz Mglistych Gór',
    biome: 'Górskie Przełęcze',
    zPos: 1100,
    description: 'Wąska górska grań zawieszona nad przepaścią. Strzeż się orków o zmroku!',
    visited: false,
  },
  {
    id: 'mountain_stable',
    name: 'Górska Przystań Kucyków',
    biome: 'Górskie Przełęcze',
    zPos: 1350,
    description: 'Ostatnie schronienie przed szczytem. Zapas chrupiących jabłek i ciepły żłób.',
    visited: false,
  },
  {
    id: 'lonely_mountain',
    name: 'Wrota Samotnej Góry (Erebor)',
    biome: 'Samotna Góra',
    zPos: 1850,
    description: 'Cel podróży! Majestatyczna góra krasnoludów kąpiąca się w złotym blasku gwiazd.',
    visited: false,
  },
];

// Road curvature through the world
export function getRoadCenter(z: number): number {
  return (
    Math.sin(z * 0.012) * 12 +
    Math.cos(z * 0.004) * 8 +
    Math.sin(z * 0.03) * 3
  );
}

// Procedural Height Function
export function getTerrainHeight(x: number, z: number): number {
  const roadX = getRoadCenter(z);
  const distToRoad = Math.abs(x - roadX);

  // Road is kept relatively level/smooth
  const roadFlatten = Math.min(1, Math.pow(distToRoad / 14, 2));

  // Biome-dependent heights
  let baseHeight = 0;
  if (z < 400) {
    // Shire: gentle rolling hills
    const hills = Math.sin(x * 0.05) * 2.5 + Math.cos(z * 0.04) * 2.0;
    baseHeight = hills * roadFlatten;
  } else if (z < 900) {
    // Mirkwood: undulating forest floor with mounds
    const forestRoll = Math.sin(x * 0.08) * 3.0 + Math.cos(z * 0.06) * 2.5;
    baseHeight = forestRoll * roadFlatten;
  } else if (z < 1500) {
    // Misty Mountains: deep canyon with high steep ridges on both sides
    const canyonSteepness = Math.pow(Math.max(0, (distToRoad - 8) / 12), 1.8) * 9.0;
    const rockyNoise = Math.sin(x * 0.15) * 1.5 + Math.cos(z * 0.12) * 1.8;
    baseHeight = (canyonSteepness + rockyNoise) * roadFlatten + (z - 900) * 0.025;
  } else {
    // Lonely Mountain approach: plateau rising toward Erebor
    const rise = (z - 1500) * 0.06;
    const plateauNoise = Math.sin(x * 0.06) * 3 + Math.cos(z * 0.05) * 2;
    baseHeight = rise + plateauNoise * roadFlatten;
  }

  // Soft perimeter borders so terrain slopes up naturally at edges
  const edgeDist = Math.max(0, Math.abs(x) - (WORLD_WIDTH * 0.38));
  if (edgeDist > 0) {
    baseHeight += Math.pow(edgeDist * 0.4, 1.8);
  }

  return Math.max(-0.5, baseHeight);
}

// Terrain geometry generation with vertex coloring according to biome
export function createWorldTerrain(): THREE.Mesh {
  const segmentsX = 90;
  const segmentsZ = 300;
  const geo = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_LENGTH, segmentsX, segmentsZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors: number[] = [];

  const colGrassShire = new THREE.Color(0x56963d);
  const colRoadShire = new THREE.Color(0xa38c64);
  const colForestFloor = new THREE.Color(0x356641);
  const colMountainRock = new THREE.Color(0x61666e);
  const colMountainSnow = new THREE.Color(0xdce5ed);
  const colLonelyRock = new THREE.Color(0x45484f);
  const colLonelyGold = new THREE.Color(0x94783b);

  const tempCol = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    // Align PlaneGeometry origin so z runs from 0 to WORLD_LENGTH
    const z = pos.getZ(i) + WORLD_LENGTH / 2;
    pos.setZ(i, z);

    const y = getTerrainHeight(x, z);
    pos.setY(i, y);

    const roadX = getRoadCenter(z);
    const distToRoad = Math.abs(x - roadX);
    const isRoad = distToRoad < 4.2;
    const roadBlend = Math.max(0, Math.min(1, (distToRoad - 2.8) / 2.0));

    if (z < 400) {
      tempCol.copy(isRoad ? colRoadShire : colGrassShire);
      if (!isRoad) {
        tempCol.offsetHSL((Math.sin(x * 0.2) + Math.cos(z * 0.2)) * 0.02, 0, 0);
      }
    } else if (z < 900) {
      const blend = (z - 400) / 500;
      const baseCol = colGrassShire.clone().lerp(colForestFloor, blend);
      tempCol.copy(isRoad ? colRoadShire.clone().lerp(colMountainRock, 0.3) : baseCol);
    } else if (z < 1500) {
      const rockBlend = Math.min(1, y / 16);
      const mCol = colMountainRock.clone().lerp(colMountainSnow, rockBlend);
      tempCol.copy(isRoad ? colRoadShire.clone().lerp(colMountainRock, 0.7) : mCol);
    } else {
      const goldGlow = (z - 1500) / 400;
      const pCol = colLonelyRock.clone().lerp(colLonelyGold, goldGlow * 0.35);
      tempCol.copy(isRoad ? colRoadShire.clone().lerp(colLonelyGold, 0.5) : pCol);
    }

    // Blend road edges smoothly
    if (distToRoad < 6.0) {
      tempCol.lerp(colRoadShire, 1 - roadBlend);
    }

    colors.push(tempCol.r, tempCol.g, tempCol.b);
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
  });

  const terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.receiveShadow = true;
  terrainMesh.name = 'WorldTerrain';
  return terrainMesh;
}

// Instanced colorful wildflowers & grass tufts along the Shire and Forest
export function createInstancedFlora(): THREE.InstancedMesh {
  const count = 1200;
  const flowerGeo = new THREE.ConeGeometry(0.18, 0.5, 4);
  flowerGeo.translate(0, 0.25, 0);

  const flowerMat = new THREE.MeshStandardMaterial({
    roughness: 0.6,
    metalness: 0.1,
  });

  const instMesh = new THREE.InstancedMesh(flowerGeo, flowerMat, count);
  const matrix = new THREE.Matrix4();
  const dummy = new THREE.Object3D();
  const colors = [
    new THREE.Color(0xff69b4), // Pink rose
    new THREE.Color(0xffd700), // Buttercup yellow
    new THREE.Color(0x9370db), // Lavender purple
    new THREE.Color(0x87ceeb), // Forget-me-not blue
    new THREE.Color(0xffffff), // White daisy
  ];

  for (let i = 0; i < count; i++) {
    // Scatter mostly in Shire and Forest regions (z: 10 to 950)
    const z = 20 + Math.random() * 950;
    const roadX = getRoadCenter(z);
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = roadX + side * (5 + Math.random() * 26);
    const y = getTerrainHeight(x, z);

    dummy.position.set(x, y, z);
    dummy.rotation.y = Math.random() * Math.PI * 2;
    dummy.rotation.z = (Math.random() - 0.5) * 0.2;
    const scale = 0.7 + Math.random() * 0.6;
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();

    instMesh.setMatrixAt(i, dummy.matrix);
    instMesh.setColorAt(i, colors[Math.floor(Math.random() * colors.length)]);
  }

  instMesh.instanceMatrix.needsUpdate = true;
  if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
  instMesh.computeBoundingSphere();
  instMesh.castShadow = true;
  return instMesh;
}
