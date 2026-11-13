import * as THREE from 'three';
import { WorldMilestone } from './types';
import { createGroundDetailTexture, createGroundBumpTexture, createStoneTexture } from './materials';

export const WORLD_LENGTH = 1900;
export const WORLD_WIDTH = 280;

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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Road curvature through the world
export function getRoadCenter(z: number): number {
  return (
    Math.sin(z * 0.012) * 12 +
    Math.cos(z * 0.004) * 8 +
    Math.sin(z * 0.03) * 3
  );
}

// Elevation of the main trail center at any z (continuous across all biomes)
export function getMountainTrailElevation(z: number): number {
  if (z <= 820) return 0;
  if (z < 940) return smoothstep(820, 940, z) * 16.0;
  if (z <= 1460) return 16.0 + ((z - 940) / 520) * 6.0;
  if (z <= 1560) return 22.0 + smoothstep(1460, 1560, z) * 3.0;
  return 25.0 + (z - 1560) * 0.045;
}

// Procedural Height Function
export function getTerrainHeight(x: number, z: number): number {
  const roadX = getRoadCenter(z);
  const signedOffset = x - roadX;
  const distToRoad = Math.abs(signedOffset);

  // Smooth mask for the Misty Mountains pass (z: 840..1540)
  const mountainWeight = smoothstep(840, 930, z) * (1 - smoothstep(1450, 1540, z));
  const trailElev = getMountainTrailElevation(z);

  // Wide gentle meadows & forest outside the mountains
  const wideRoadFlatten = Math.min(1, Math.pow(distToRoad / 14, 2));
  let openHeight = 0;
  if (z < 420) {
    const hills =
      Math.sin(x * 0.042) * 2.8 +
      Math.cos(z * 0.036) * 2.2 +
      Math.sin((x + z) * 0.022) * 1.4;
    openHeight = hills * wideRoadFlatten;
  } else if (z < 920) {
    const forestRoll =
      Math.sin(x * 0.06) * 3.4 +
      Math.cos(z * 0.05) * 2.6 +
      Math.sin((x - z) * 0.028) * 1.5;
    openHeight = trailElev + forestRoll * wideRoadFlatten;
  } else if (z > 1460) {
    const plateauNoise =
      Math.sin(x * 0.05) * 3.5 +
      Math.cos(z * 0.045) * 2.5 +
      Math.sin(x * 0.11) * 1.1;
    openHeight = trailElev + plateauNoise * wideRoadFlatten;
  }

  let baseHeight = openHeight;

  if (mountainWeight > 0.001) {
    // Narrow mountain trail half-width (~2.35 units) with steep cliff wall on one side & sheer abyss on the other
    const narrowHalfWidth = 2.35;
    const cliffSign = Math.tanh((1200 - z) / 40); // +1 before z=1200 (abyss on +X), -1 after z=1200 (abyss on -X)
    const sidePos = signedOffset * cliffSign; // >0 = precipice/urwisko side, <0 = steep cliff wall side
    const ridgeDoubleDrop = Math.max(0, 1 - Math.abs(cliffSign));

    // Precipice (urwisko): sudden steep drop down into a deep rocky gorge, rising far across the chasm
    const dropDist = Math.max(0, sidePos - narrowHalfWidth);
    const sheerDrop = -20.5 * smoothstep(0, 8.5, dropDist);
    const farCanyonWall = Math.pow(Math.max(0, dropDist - 24), 1.28) * 0.92;
    const gorgeNoise =
      (Math.sin(x * 0.22) * 1.1 + Math.cos(z * 0.17) * 1.0) * smoothstep(0, 4, dropDist);

    // Steep cliff wall (strome zbocze): rises sharply beside the narrow path
    const wallDist = Math.max(0, -sidePos - narrowHalfWidth);
    const cliffRise = Math.min(44, Math.pow(wallDist, 1.24) * 2.15);
    const cliffCrags =
      (Math.sin(x * 0.26 + z * 0.09) * 1.8 + Math.cos(z * 0.19) * 1.3) * smoothstep(0, 5, wallDist);

    let mountainDelta = 0;
    if (sidePos >= 0) {
      mountainDelta = sheerDrop + farCanyonWall + gorgeNoise;
    } else {
      mountainDelta = cliffRise + cliffCrags;
    }

    // At the z=1200 saddle transition, carve sheer drops on BOTH sides for a dramatic narrow mountain ridge
    if (ridgeDoubleDrop > 0.01) {
      const saddleDropDist = Math.max(0, distToRoad - narrowHalfWidth);
      const saddleDrop =
        -17.5 * smoothstep(0, 8.0, saddleDropDist) +
        Math.pow(Math.max(0, saddleDropDist - 26), 1.25) * 0.85;
      mountainDelta = THREE.MathUtils.lerp(mountainDelta, saddleDrop, ridgeDoubleDrop);
    }

    // Natural flat alcove pocket at z=1350 on the safe cliff-wall side for Górska Przystań Kucyków
    const stableX = getRoadCenter(1350) + 7.5;
    const dxS = x - stableX;
    const dzS = z - 1350;
    const stableDist = Math.sqrt(dxS * dxS + dzS * dzS);
    if (stableDist < 13) {
      const pocketBlend = 1 - smoothstep(5.5, 13, stableDist);
      mountainDelta *= 1 - pocketBlend;
    }

    const mountainHeight = trailElev + mountainDelta;
    baseHeight = THREE.MathUtils.lerp(openHeight, mountainHeight, mountainWeight);
  }

  // Soft outer world boundary hills beyond the wide meadows
  const edgeDist = Math.max(0, Math.abs(x) - WORLD_WIDTH * 0.44);
  if (edgeDist > 0) {
    baseHeight += Math.pow(edgeDist * 0.45, 1.65);
  }

  return Math.max(-2.5, baseHeight);
}

// Smooth high-resolution terrain geometry with detail + bump textures and biome vertex shading
export function createWorldTerrain(maxAnisotropy = 4): THREE.Mesh {
  const segmentsX = 200;
  const segmentsZ = 420;
  const geo = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_LENGTH, segmentsX, segmentsZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors: number[] = [];

  const colGrassShire = new THREE.Color(0x55973b);
  const colGrassWarm = new THREE.Color(0x6cae46);
  const colRoadShire = new THREE.Color(0xb69c72);
  const colRoadShoulder = new THREE.Color(0x7c804e);
  const colForestFloor = new THREE.Color(0x32653d);
  const colMountainRock = new THREE.Color(0x636872);
  const colMountainChasm = new THREE.Color(0x353b45);
  const colMountainSnow = new THREE.Color(0xe5edf5);
  const colLonelyRock = new THREE.Color(0x494c54);
  const colLonelyGold = new THREE.Color(0x9b7e3c);

  const tempCol = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) + WORLD_LENGTH / 2;
    pos.setZ(i, z);

    const y = getTerrainHeight(x, z);
    pos.setY(i, y);

    const roadX = getRoadCenter(z);
    const distToRoad = Math.abs(x - roadX);
    const inMountains = z >= 870 && z <= 1520;
    const roadHalfWidth = inMountains ? 2.4 : 4.2;
    const shoulderHalfWidth = inMountains ? 3.2 : 5.8;
    const isRoad = distToRoad < roadHalfWidth;
    const roadBlend = Math.max(
      0,
      Math.min(1, (distToRoad - (roadHalfWidth - 0.8)) / (shoulderHalfWidth - roadHalfWidth + 0.8))
    );
    const patchWave = Math.sin(x * 0.16) * Math.cos(z * 0.14) * 0.5 + 0.5;

    if (z < 400) {
      tempCol.copy(isRoad ? colRoadShire : colGrassShire.clone().lerp(colGrassWarm, patchWave * 0.45));
    } else if (z < 870) {
      const blend = (z - 400) / 470;
      const baseCol = colGrassShire.clone().lerp(colForestFloor, blend);
      baseCol.lerp(colRoadShoulder, patchWave * 0.18);
      tempCol.copy(isRoad ? colRoadShire.clone().lerp(colMountainRock, 0.25) : baseCol);
    } else if (z <= 1520) {
      const trailY = getMountainTrailElevation(z);
      if (y < trailY - 2.0) {
        const depthT = Math.min(1, (trailY - y) / 18);
        tempCol.copy(colMountainRock).lerp(colMountainChasm, depthT * 0.85);
      } else {
        const snowBlend = Math.min(1, Math.max(0, (y - trailY - 8) / 16));
        const mCol = colMountainRock.clone().lerp(colMountainSnow, snowBlend);
        tempCol.copy(isRoad ? colRoadShire.clone().lerp(colMountainRock, 0.58) : mCol);
      }
    } else {
      const goldGlow = (z - 1520) / 380;
      const pCol = colLonelyRock.clone().lerp(colLonelyGold, goldGlow * 0.38);
      tempCol.copy(isRoad ? colRoadShire.clone().lerp(colLonelyGold, 0.45) : pCol);
    }

    if (distToRoad < shoulderHalfWidth) {
      const roadTone = inMountains ? colRoadShire.clone().lerp(colMountainRock, 0.52) : colRoadShire;
      tempCol.lerp(roadTone, 1 - roadBlend);
    }

    colors.push(tempCol.r, tempCol.g, tempCol.b);
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const detailTex = createGroundDetailTexture();
  detailTex.anisotropy = maxAnisotropy;
  const bumpTex = createGroundBumpTexture();
  bumpTex.anisotropy = maxAnisotropy;

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: detailTex,
    bumpMap: bumpTex,
    bumpScale: 0.08,
    roughness: 0.88,
    metalness: 0.02,
    flatShading: false,
  });

  const terrainMesh = new THREE.Mesh(geo, mat);
  terrainMesh.receiveShadow = true;
  terrainMesh.name = 'WorldTerrain';
  return terrainMesh;
}

// Instanced colorful wildflowers & green leaf clusters along the wide Shire and Forest
export function createInstancedFlora(): THREE.Group {
  const floraGroup = new THREE.Group();
  const count = 2400;

  const stemGeo = new THREE.CylinderGeometry(0.02, 0.09, 0.36, 5);
  stemGeo.translate(0, 0.18, 0);
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0x3b8432,
    roughness: 0.72,
  });

  // Sculpted 5-lobe blossom cup
  const blossomGeo = new THREE.CylinderGeometry(0.15, 0.04, 0.1, 6);
  blossomGeo.translate(0, 0.38, 0);
  const blossomMat = new THREE.MeshStandardMaterial({
    roughness: 0.45,
    metalness: 0.05,
  });

  const stemInst = new THREE.InstancedMesh(stemGeo, stemMat, count);
  const blossomInst = new THREE.InstancedMesh(blossomGeo, blossomMat, count);

  const dummy = new THREE.Object3D();
  const colors = [
    new THREE.Color(0xf472b6),
    new THREE.Color(0xfacc15),
    new THREE.Color(0xa78bfa),
    new THREE.Color(0x60a5fa),
    new THREE.Color(0xfef9c3),
  ];

  for (let i = 0; i < count; i++) {
    const z = 18 + Math.random() * 835;
    const roadX = getRoadCenter(z);
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = roadX + side * (4.8 + Math.random() * 88);
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

// Instanced displaced craggy boulders & stone-textured rocks
export function createInstancedRocks(maxAnisotropy = 4): THREE.InstancedMesh {
  const count = 340;
  const rockGeo = new THREE.IcosahedronGeometry(0.95, 1);
  const pos = rockGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * 2.7 + v.z * 1.9) * 0.18 + Math.cos(v.y * 3.1 - v.x * 1.5) * 0.12;
    v.multiplyScalar(1 + n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  rockGeo.scale(1.15, 0.74, 1.0);
  rockGeo.translate(0, 0.34, 0);
  rockGeo.computeVertexNormals();

  const stoneTex = createStoneTexture();
  stoneTex.anisotropy = maxAnisotropy;

  const rockMat = new THREE.MeshStandardMaterial({
    map: stoneTex,
    roughness: 0.9,
    metalness: 0.04,
    flatShading: true,
  });

  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, count);
  const dummy = new THREE.Object3D();
  const mossyTint = new THREE.Color(0x98a68d);
  const graniteTint = new THREE.Color(0xa6aeb8);
  const slateTint = new THREE.Color(0x828b96);

  for (let i = 0; i < count; i++) {
    const z = 40 + (i / count) * (WORLD_LENGTH - 90);
    const roadX = getRoadCenter(z);
    const inMountains = z >= 880 && z <= 1520;
    let x: number;
    if (inMountains) {
      // Cluster boulders along the cliff-wall base & chasm rim, keeping the narrow trail clear
      const cliffSign = Math.tanh((1200 - z) / 40);
      const onWall = i % 3 !== 0;
      const side = onWall ? -cliffSign : cliffSign;
      const offset = onWall ? 3.2 + Math.random() * 16 : 2.6 + Math.random() * 1.4;
      x = roadX + side * offset;
    } else {
      const side = i % 2 === 0 ? 1 : -1;
      x = roadX + side * (6.5 + Math.random() * 78);
    }
    const y = getTerrainHeight(x, z);

    dummy.position.set(x, y - 0.14, z);
    dummy.rotation.set(Math.random() * 0.3, Math.random() * Math.PI * 2, Math.random() * 0.3);
    const sx = 0.55 + Math.random() * 1.5;
    const sy = 0.45 + Math.random() * 1.15;
    const sz = 0.55 + Math.random() * 1.4;
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();

    rockInst.setMatrixAt(i, dummy.matrix);
    const col = z < 880 ? mossyTint : i % 3 === 0 ? slateTint : graniteTint;
    rockInst.setColorAt(i, col);
  }

  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  rockInst.castShadow = true;
  rockInst.receiveShadow = true;
  return rockInst;
}
