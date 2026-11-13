import * as THREE from 'three';
import { WorldMilestone } from './types';
import { createGroundDetailTexture } from './materials';

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

// Smooth high-resolution terrain geometry with micro-detail texture and biome vertex shading
export function createWorldTerrain(maxAnisotropy = 4): THREE.Mesh {
  const segmentsX = 120;
  const segmentsZ = 380;
  const geo = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_LENGTH, segmentsX, segmentsZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors: number[] = [];

  const colGrassShire = new THREE.Color(0x55973b);
  const colGrassWarm = new THREE.Color(0x69ab44);
  const colRoadShire = new THREE.Color(0xb39a70);
  const colRoadShoulder = new THREE.Color(0x7c804e);
  const colForestFloor = new THREE.Color(0x32653d);
  const colMountainRock = new THREE.Color(0x636872);
  const colMountainSnow = new THREE.Color(0xe5edf5);
  const colLonelyRock = new THREE.Color(0x494c54);
  const colLonelyGold = new THREE.Color(0x9b7e3c);

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
    const isRoad = distToRoad < 4.0;
    const roadBlend = Math.max(0, Math.min(1, (distToRoad - 2.6) / 2.2));
    const patchWave = Math.sin(x * 0.16) * Math.cos(z * 0.14) * 0.5 + 0.5;

    if (z < 400) {
      tempCol.copy(isRoad ? colRoadShire : colGrassShire.clone().lerp(colGrassWarm, patchWave * 0.45));
    } else if (z < 900) {
      const blend = (z - 400) / 500;
      const baseCol = colGrassShire.clone().lerp(colForestFloor, blend);
      baseCol.lerp(colRoadShoulder, patchWave * 0.18);
      tempCol.copy(isRoad ? colRoadShire.clone().lerp(colMountainRock, 0.25) : baseCol);
    } else if (z < 1500) {
      const rockBlend = Math.min(1, Math.max(0, (y - 3) / 14));
      const mCol = colMountainRock.clone().lerp(colMountainSnow, rockBlend);
      tempCol.copy(isRoad ? colRoadShire.clone().lerp(colMountainRock, 0.62) : mCol);
    } else {
      const goldGlow = (z - 1500) / 400;
      const pCol = colLonelyRock.clone().lerp(colLonelyGold, goldGlow * 0.38);
      tempCol.copy(isRoad ? colRoadShire.clone().lerp(colLonelyGold, 0.45) : pCol);
    }

    // Softly blend road border into grass shoulder
    if (distToRoad < 5.6) {
      const roadTone = z >= 900 && z < 1500 ? colRoadShire.clone().lerp(colMountainRock, 0.5) : colRoadShire;
      tempCol.lerp(roadTone, 1 - roadBlend);
    }

    colors.push(tempCol.r, tempCol.g, tempCol.b);
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const detailTex = createGroundDetailTexture();
  detailTex.anisotropy = maxAnisotropy;

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: detailTex,
    roughness: 0.88,
    metalness: 0.02,
    flatShading: false,
  });

  const terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.receiveShadow = true;
  terrainMesh.name = 'WorldTerrain';
  return terrainMesh;
}

// Instanced colorful wildflowers & green stems along the Shire and Forest
export function createInstancedFlora(): THREE.Group {
  const floraGroup = new THREE.Group();
  const count = 1400;

  // Green leafy stem base
  const stemGeo = new THREE.ConeGeometry(0.11, 0.34, 5);
  stemGeo.translate(0, 0.17, 0);
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0x3b8432,
    roughness: 0.72,
  });

  // 6-sided flower blossom crown sitting atop stem
  const blossomGeo = new THREE.DodecahedronGeometry(0.14, 0);
  blossomGeo.scale(1.25, 0.55, 1.25);
  blossomGeo.translate(0, 0.36, 0);
  const blossomMat = new THREE.MeshStandardMaterial({
    roughness: 0.48,
    metalness: 0.04,
  });

  const stemInst = new THREE.InstancedMesh(stemGeo, stemMat, count);
  const blossomInst = new THREE.InstancedMesh(blossomGeo, blossomMat, count);

  const dummy = new THREE.Object3D();
  const colors = [
    new THREE.Color(0xf472b6), // Rose pink
    new THREE.Color(0xfacc15), // Buttercup gold
    new THREE.Color(0xa78bfa), // Wild lavender
    new THREE.Color(0x60a5fa), // Forget-me-not blue
    new THREE.Color(0xfef9c3), // Cream daisy
  ];

  for (let i = 0; i < count; i++) {
    const z = 18 + Math.random() * 960;
    const roadX = getRoadCenter(z);
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = roadX + side * (4.6 + Math.random() * 26);
    const y = getTerrainHeight(x, z);

    dummy.position.set(x, y - 0.02, z);
    dummy.rotation.set((Math.random() - 0.5) * 0.14, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.14);
    const scale = 0.72 + Math.random() * 0.65;
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();

    stemInst.setMatrixAt(i, dummy.matrix);
    blossomInst.setMatrixAt(i, dummy.matrix);
    blossomInst.setColorAt(i, colors[Math.floor(Math.random() * colors.length)]);
  }

  stemInst.instanceMatrix.needsUpdate = true;
  blossomInst.instanceMatrix.needsUpdate = true;
  if (blossomInst.instanceColor) blossomInst.instanceColor.needsUpdate = true;

  stemInst.computeBoundingSphere();
  blossomInst.computeBoundingSphere();
  blossomInst.castShadow = true;

  floraGroup.add(stemInst, blossomInst);
  return floraGroup;
}

// Instanced mossy boulders & mountain crag stones for natural outdoor framing
export function createInstancedRocks(): THREE.InstancedMesh {
  const count = 220;
  const rockGeo = new THREE.DodecahedronGeometry(0.9, 1);
  rockGeo.scale(1.15, 0.78, 1.0);
  rockGeo.translate(0, 0.35, 0);

  const rockMat = new THREE.MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  });

  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, count);
  const dummy = new THREE.Object3D();
  const mossyTint = new THREE.Color(0x5c6954);
  const graniteTint = new THREE.Color(0x6b7280);
  const slateTint = new THREE.Color(0x4b5563);

  for (let i = 0; i < count; i++) {
    const z = 40 + (i / count) * (WORLD_LENGTH - 90);
    const roadX = getRoadCenter(z);
    const side = i % 2 === 0 ? 1 : -1;
    const x = roadX + side * (6.2 + Math.random() * 28);
    const y = getTerrainHeight(x, z);

    dummy.position.set(x, y - 0.12, z);
    dummy.rotation.set(Math.random() * 0.3, Math.random() * Math.PI * 2, Math.random() * 0.3);
    const sx = 0.55 + Math.random() * 1.4;
    const sy = 0.45 + Math.random() * 1.1;
    const sz = 0.55 + Math.random() * 1.3;
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();

    rockInst.setMatrixAt(i, dummy.matrix);
    const col = z < 900 ? mossyTint : i % 3 === 0 ? slateTint : graniteTint;
    rockInst.setColorAt(i, col);
  }

  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  rockInst.castShadow = true;
  rockInst.receiveShadow = true;
  return rockInst;
}
