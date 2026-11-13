import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HorseProfile, RiderProfile } from './types';
import { MaterialPalette } from './materials';

export interface MaterialBatch {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
}

export function extractMaterialBatches(group: THREE.Group): MaterialBatch[] {
  group.updateMatrixWorld(true);
  const byMaterial = new Map<
    THREE.Material,
    { geos: THREE.BufferGeometry[]; castShadow: boolean; receiveShadow: boolean }
  >();

  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (!mat) return;

    const cloned = obj.geometry.clone();
    cloned.applyMatrix4(obj.matrixWorld);
    const nonIdx = cloned.index ? cloned.toNonIndexed() : cloned;
    if (cloned.index) cloned.dispose();

    if (!nonIdx.getAttribute('normal')) {
      nonIdx.computeVertexNormals();
    }
    if (!nonIdx.getAttribute('uv')) {
      const count = nonIdx.getAttribute('position').count;
      nonIdx.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (nonIdx.getAttribute('tangent')) {
      nonIdx.deleteAttribute('tangent');
    }

    let entry = byMaterial.get(mat);
    if (!entry) {
      entry = { geos: [], castShadow: false, receiveShadow: false };
      byMaterial.set(mat, entry);
    }
    entry.geos.push(nonIdx);
    if (obj.castShadow) entry.castShadow = true;
    if (obj.receiveShadow) entry.receiveShadow = true;
  });

  const batches: MaterialBatch[] = [];
  byMaterial.forEach((entry, material) => {
    const merged = entry.geos.length === 1 ? entry.geos[0] : mergeGeometries(entry.geos, false);
    if (entry.geos.length > 1) {
      entry.geos.forEach((g) => g.dispose());
    }
    if (merged) {
      merged.computeBoundingSphere();
      batches.push({
        geometry: merged,
        material,
        castShadow: entry.castShadow,
        receiveShadow: entry.receiveShadow,
      });
    }
  });
  return batches;
}

export function optimizeStaticGroup(group: THREE.Group): THREE.Group {
  const batches = extractMaterialBatches(group);
  const preservedLights: THREE.Object3D[] = [];
  group.traverse((obj) => {
    if (obj instanceof THREE.Light) {
      obj.updateMatrixWorld(true);
      const clone = obj.clone();
      clone.position.setFromMatrixPosition(obj.matrixWorld);
      preservedLights.push(clone);
    }
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
    }
  });

  group.clear();
  for (const b of batches) {
    const mesh = new THREE.Mesh(b.geometry, b.material);
    mesh.castShadow = b.castShadow;
    mesh.receiveShadow = b.receiveShadow;
    group.add(mesh);
  }
  for (const light of preservedLights) {
    group.add(light);
  }
  return group;
}

export interface HorseRig {
  group: THREE.Group;
  horseMeshGroup: THREE.Group;
  headNeckGroup: THREE.Group;
  headGroup: THREE.Group;
  maneGroup: THREE.Group;
  tailGroup: THREE.Group;
  tailJoint: THREE.Group;
  legFL: { upper: THREE.Group; lower: THREE.Group; hoof: THREE.Mesh };
  legFR: { upper: THREE.Group; lower: THREE.Group; hoof: THREE.Mesh };
  legRL: { upper: THREE.Group; lower: THREE.Group; hoof: THREE.Mesh };
  legRR: { upper: THREE.Group; lower: THREE.Group; hoof: THREE.Mesh };
  riderGroup: THREE.Group;
  riderTorso: THREE.Group;
  riderHead: THREE.Group;
  riderArmL: THREE.Group;
  riderArmR: THREE.Group;
  starBrooch: THREE.Mesh;
  starLight: THREE.PointLight;
}

// Helper: displace geometry vertices deterministically along their normals for organic rocks/hills/bark
function displaceVertices(
  geo: THREE.BufferGeometry,
  amp: number,
  freq = 2.5,
  yPreserveBottom = false
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (yPreserveBottom && v.y <= 0.05) continue;
    const n =
      Math.sin(v.x * freq + v.z * 1.3) * 0.5 +
      Math.cos(v.y * freq * 1.4 - v.x * 0.9) * 0.5;
    const scale = 1 + n * amp;
    v.x *= scale;
    v.z *= scale;
    if (!yPreserveBottom || v.y > 0.2) {
      v.y *= 1 + n * amp * 0.55;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Helper: smooth tapered elliptical tube along a 3D curve (used for horse neck)
function createTaperedNeckGeometry(
  curve: THREE.CatmullRomCurve3,
  tubularSegments: number,
  radialSegments: number,
  radiusXFn: (t: number) => number,
  radiusYFn: (t: number) => number
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const v = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    curve.getPointAt(t, P);
    N.set(1, 0, 0);
    B.crossVectors(frames.tangents[i], N).normalize();

    const rx = radiusXFn(t);
    const ry = radiusYFn(t);

    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      // Graceful arched crest ridge along top of neck, clean throatlatch below
      const crestBoost = sin > 0 ? Math.pow(sin, 2) * 0.22 * ry * (1 - t * 0.35) : 0;

      v.copy(P)
        .addScaledVector(N, cos * rx)
        .addScaledVector(B, sin * ry + crestBoost);

      positions.push(v.x, v.y, v.z);
      uvs.push(j / radialSegments, t);
    }
  }

  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * (radialSegments + 1) + j;
      const b = (i + 1) * (radialSegments + 1) + j;
      const c = (i + 1) * (radialSegments + 1) + (j + 1);
      const d = i * (radialSegments + 1) + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Seamless continuous lofted Horse Head geometry (poll -> forehead -> nasal bridge -> flared muzzle)
function createSculptedHorseHeadGeometry(): THREE.BufferGeometry {
  // Slices along head forward axis (z) with center y offset, width rx, height ry
  const slices = [
    { z: -0.06, y: 0.04, rx: 0.075, ry: 0.08 },  // Poll cap
    { z: 0.0,   y: 0.045, rx: 0.145, ry: 0.155 }, // Back of cranium
    { z: 0.08,  y: 0.04, rx: 0.165, ry: 0.175 },  // Cheekbones / brow
    { z: 0.17,  y: 0.025, rx: 0.148, ry: 0.158 }, // Forehead / eye level
    { z: 0.26,  y: 0.0,   rx: 0.118, ry: 0.132 }, // Upper nasal bridge (subtle Arab/Warmblood dish)
    { z: 0.36,  y: -0.024, rx: 0.098, ry: 0.112 }, // Mid nasal bridge
    { z: 0.45,  y: -0.044, rx: 0.088, ry: 0.096 }, // Lower bridge before muzzle
    { z: 0.52,  y: -0.058, rx: 0.092, ry: 0.088 }, // Flared muzzle rim
    { z: 0.565, y: -0.065, rx: 0.062, ry: 0.056 }, // Soft rounded upper lip
    { z: 0.585, y: -0.07, rx: 0.005, ry: 0.005 },  // Nose tip closure
  ];

  const radialSegs = 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    const t = i / (slices.length - 1);
    for (let j = 0; j <= radialSegs; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      // Subtle flat nasal bone on top (sin > 0.4) and fuller jowls at sides/bottom
      let x = cos * s.rx;
      let y = sin * s.ry + s.y;
      if (sin > 0.35 && i >= 3 && i <= 6) {
        y -= (sin - 0.35) * 0.022;
      }
      if (sin < -0.2 && i >= 1 && i <= 3) {
        x *= 1.08;
      }

      positions.push(x, y, s.z);
      uvs.push(j / radialSegs, t);
    }
  }

  for (let i = 0; i < slices.length - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * (radialSegs + 1) + j;
      const b = (i + 1) * (radialSegs + 1) + j;
      const c = (i + 1) * (radialSegs + 1) + (j + 1);
      const d = i * (radialSegs + 1) + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Helper: create a soft radial contact shadow disc
function createContactShadow(radiusX: number, radiusZ: number, opacity = 0.36): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, `rgba(12, 16, 10, ${opacity})`);
  grad.addColorStop(0.55, `rgba(12, 16, 10, ${opacity * 0.45})`);
  grad.addColorStop(1, 'rgba(12, 16, 10, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.03;
  return mesh;
}

function buildStylizedRiderHead(
  hairMat: THREE.Material,
  skinMat: THREE.Material,
  silverMat: THREE.Material,
  eyeIrisColor: number
): THREE.Group {
  const head = new THREE.Group();

  const faceGeo = new THREE.SphereGeometry(0.168, 24, 20);
  faceGeo.scale(0.92, 1.06, 0.96);
  const face = new THREE.Mesh(faceGeo, skinMat);
  face.castShadow = true;
  head.add(face);

  // Delicate nose
  const noseGeo = new THREE.ConeGeometry(0.022, 0.052, 8);
  noseGeo.rotateX(Math.PI * 0.38);
  const nose = new THREE.Mesh(noseGeo, skinMat);
  nose.position.set(0, -0.008, 0.164);
  head.add(nose);

  // Soft rosy cheeks & lips
  const cheekMat = new THREE.MeshStandardMaterial({ color: 0xf4979c, roughness: 0.72 });
  const cheekGeo = new THREE.SphereGeometry(0.032, 10, 10);
  cheekGeo.scale(1.2, 0.72, 0.45);
  const cheekL = new THREE.Mesh(cheekGeo, cheekMat);
  cheekL.position.set(0.084, -0.025, 0.132);
  const cheekR = cheekL.clone();
  cheekR.position.x = -0.084;
  head.add(cheekL, cheekR);

  const lipMat = new THREE.MeshStandardMaterial({ color: 0xd96b78, roughness: 0.45 });
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 12, Math.PI), lipMat);
  lip.rotation.z = Math.PI;
  lip.position.set(0, -0.058, 0.15);
  head.add(lip);

  // Expressive eyes (sclera + iris + pupil + catchlight + brow)
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.18 });
  const irisMat = new THREE.MeshStandardMaterial({ color: eyeIrisColor, roughness: 0.16 });
  const pupilMat = new THREE.MeshPhysicalMaterial({ color: 0x0e0f14, roughness: 0.05, clearcoat: 1.0 });
  const catchMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const browMat = new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.6 });

  [-1, 1].forEach((side) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(side * 0.064, 0.028, 0.136);
    eyeGroup.rotation.y = side * 0.28;

    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), scleraMat);
    sclera.scale.set(1.05, 0.9, 0.65);
    eyeGroup.add(sclera);

    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 10), irisMat);
    iris.position.set(0, 0, 0.014);
    iris.scale.set(1, 1, 0.55);
    eyeGroup.add(iris);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), pupilMat);
    pupil.position.set(0, 0, 0.021);
    eyeGroup.add(pupil);

    const catchlight = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 6), catchMat);
    catchlight.position.set(0.007, 0.007, 0.028);
    eyeGroup.add(catchlight);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.011, 0.012), browMat);
    brow.position.set(0, 0.044, 0.012);
    brow.rotation.z = side * -0.08;
    eyeGroup.add(brow);

    head.add(eyeGroup);
  });

  // Hair crown + Silver Elven Circlet + side bangs + braided ponytail
  const hairCrown = new THREE.Mesh(
    new THREE.SphereGeometry(0.183, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.66),
    hairMat
  );
  hairCrown.scale.set(0.98, 1.06, 1.02);
  hairCrown.position.set(0, 0.032, -0.018);
  hairCrown.castShadow = true;
  head.add(hairCrown);

  const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.009, 8, 28), silverMat);
  circlet.rotation.x = Math.PI / 2 - 0.12;
  circlet.position.set(0, 0.095, -0.005);
  head.add(circlet);

  const circletGem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.018, 0),
    new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 0.8 })
  );
  circletGem.position.set(0, 0.095, 0.165);
  head.add(circletGem);

  const bangGeo = new THREE.SphereGeometry(0.09, 12, 10);
  bangGeo.scale(1.15, 0.55, 0.65);
  const bangL = new THREE.Mesh(bangGeo, hairMat);
  bangL.position.set(0.085, 0.115, 0.105);
  bangL.rotation.set(0.3, 0.25, -0.45);
  const bangR = new THREE.Mesh(bangGeo, hairMat);
  bangR.position.set(-0.085, 0.115, 0.105);
  bangR.rotation.set(0.3, -0.25, 0.45);
  head.add(bangL, bangR);

  const lockGeo = new THREE.CapsuleGeometry(0.034, 0.16, 4, 10);
  const lockL = new THREE.Mesh(lockGeo, hairMat);
  lockL.position.set(0.145, -0.05, 0.02);
  lockL.rotation.z = 0.12;
  const lockR = lockL.clone();
  lockR.position.x = -0.145;
  lockR.rotation.z = -0.12;
  head.add(lockL, lockR);

  const braidGroup = new THREE.Group();
  braidGroup.position.set(0, 0.02, -0.175);
  braidGroup.rotation.x = -0.22;
  head.add(braidGroup);

  const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.4 });
  const ribbonTie = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.014, 8, 14), ribbonMat);
  ribbonTie.rotation.x = Math.PI / 2;
  braidGroup.add(ribbonTie);

  const braidRadii = [0.056, 0.052, 0.045, 0.038, 0.028];
  braidRadii.forEach((r, idx) => {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), hairMat);
    seg.scale.set(1.05, 1.35, 0.9);
    seg.position.set(0, -0.05 - idx * 0.095, -idx * 0.012);
    seg.castShadow = true;
    braidGroup.add(seg);
  });

  const tipTassel = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.11, 8), hairMat);
  tipTassel.rotation.x = Math.PI;
  tipTassel.position.set(0, -0.52, -0.06);
  braidGroup.add(tipTassel);

  return head;
}

export function createHorseAndRider(
  horse: HorseProfile,
  rider: RiderProfile,
  palette: MaterialPalette
): HorseRig {
  const root = new THREE.Group();
  root.name = 'HorseAndRiderRoot';

  const horseGroup = new THREE.Group();
  root.add(horseGroup);
  horseGroup.add(createContactShadow(0.88, 1.48, 0.35));

  // Materials
  const coatMat = palette.getHorseCoatMaterial(horse.coat);
  const muzzleMat = palette.getHorseMuzzleMaterial(horse.coat);
  const pointsMat = palette.getHorsePointsMaterial(horse.coat);
  const maneMat = palette.getManeMaterial(horse.maneColor);
  const blanketMat = palette.getBlanketMaterial(horse.blanketColor);
  const whiteMarkingMat = new THREE.MeshPhysicalMaterial({
    color: 0xf7f5f0,
    roughness: 0.45,
    sheen: 0.4,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const hoofMat = new THREE.MeshPhysicalMaterial({
    color: 0x222024,
    roughness: 0.38,
    metalness: 0.08,
    clearcoat: 0.3,
    clearcoatRoughness: 0.35,
  });
  const horseshoeMat = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    roughness: 0.2,
    metalness: 0.92,
  });
  const leatherMat = new THREE.MeshPhysicalMaterial({
    color: 0x5c341d,
    map: palette.leatherTex,
    roughness: 0.38,
    metalness: 0.06,
    clearcoat: 0.2,
    clearcoatRoughness: 0.42,
  });
  const darkLeatherMat = new THREE.MeshPhysicalMaterial({
    color: 0x2c170c,
    map: palette.leatherTex,
    roughness: 0.42,
    metalness: 0.05,
  });
  const silverMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.16,
    metalness: 0.94,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.2,
    metalness: 0.9,
  });

  // -------------------------------------------------------------
  // 1. SCULPTED EQUINE BODY (Lathe profile + anatomical musculature)
  // -------------------------------------------------------------
  const torsoProfile = [
    new THREE.Vector2(0.0, -1.2),
    new THREE.Vector2(0.24, -1.16),
    new THREE.Vector2(0.46, -0.97),
    new THREE.Vector2(0.56, -0.68), // Muscular croup & hindquarters
    new THREE.Vector2(0.51, -0.34), // Tucked loin / flank
    new THREE.Vector2(0.52, 0.0),   // Ribcage barrel
    new THREE.Vector2(0.56, 0.38),  // Deep heart-girth
    new THREE.Vector2(0.55, 0.7),   // Broad shoulder base
    new THREE.Vector2(0.41, 0.94),  // Breastbone
    new THREE.Vector2(0.18, 1.08),
    new THREE.Vector2(0.0, 1.12),
  ];
  const barrelGeo = new THREE.LatheGeometry(torsoProfile, 32);
  barrelGeo.rotateX(Math.PI / 2);
  barrelGeo.scale(0.81, 1.05, 1.0);
  const barrel = new THREE.Mesh(barrelGeo, coatMat);
  barrel.position.set(0, 1.46, -0.02);
  barrel.castShadow = true;
  barrel.receiveShadow = true;
  horseGroup.add(barrel);

  // Withers crest
  const withersGeo = new THREE.SphereGeometry(0.32, 20, 16);
  withersGeo.scale(0.72, 0.88, 1.38);
  const withers = new THREE.Mesh(withersGeo, coatMat);
  withers.position.set(0, 1.85, 0.45);
  withers.castShadow = true;
  horseGroup.add(withers);

  // Chest pectorals + shoulder blades + muscular haunches
  const pectoralGeo = new THREE.SphereGeometry(0.34, 18, 14);
  pectoralGeo.scale(0.92, 1.06, 0.95);
  const chest = new THREE.Mesh(pectoralGeo, coatMat);
  chest.position.set(0, 1.41, 0.8);
  chest.castShadow = true;
  horseGroup.add(chest);

  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 14), coatMat);
    shoulder.scale.set(0.56, 1.24, 0.94);
    shoulder.position.set(side * 0.28, 1.46, 0.58);
    shoulder.rotation.x = 0.26;
    shoulder.castShadow = true;
    horseGroup.add(shoulder);

    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.37, 18, 14), coatMat);
    haunch.scale.set(0.6, 1.2, 1.06);
    haunch.position.set(side * 0.26, 1.48, -0.74);
    haunch.castShadow = true;
    horseGroup.add(haunch);
  });

  // Leather Breastplate (Martingale) across chest with Star Medallion
  const breastCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.34, 1.72, 0.44),
    new THREE.Vector3(-0.32, 1.42, 0.82),
    new THREE.Vector3(0, 1.32, 0.96),
    new THREE.Vector3(0.32, 1.42, 0.82),
    new THREE.Vector3(0.34, 1.72, 0.44),
  ]);
  const breastStrap = new THREE.Mesh(new THREE.TubeGeometry(breastCurve, 20, 0.022, 8, false), leatherMat);
  horseGroup.add(breastStrap);

  const chestMedallion = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.022, 12), silverMat);
  chestMedallion.rotation.x = Math.PI / 2 - 0.2;
  chestMedallion.position.set(0, 1.32, 0.975);
  const chestGem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.032, 0),
    new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 0.75 })
  );
  chestGem.position.set(0, 1.32, 0.99);
  horseGroup.add(chestMedallion, chestGem);

  // -------------------------------------------------------------
  // 2. ARCHED EQUINE NECK, LAYERED SILKY MANE & CONTINUOUS LOFTED HEAD
  // -------------------------------------------------------------
  const headNeckGroup = new THREE.Group();
  headNeckGroup.position.set(0, 1.62, 0.68);
  horseGroup.add(headNeckGroup);

  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.06, -0.05),
    new THREE.Vector3(0, 0.22, 0.14),
    new THREE.Vector3(0, 0.56, 0.34),
    new THREE.Vector3(0, 0.86, 0.48),
  ]);
  const neckGeo = createTaperedNeckGeometry(
    neckCurve,
    24,
    24,
    (t) => THREE.MathUtils.lerp(0.25, 0.135, t),
    (t) => THREE.MathUtils.lerp(0.36, 0.175, t)
  );
  const neck = new THREE.Mesh(neckGeo, coatMat);
  neck.castShadow = true;
  neck.receiveShadow = true;
  headNeckGroup.add(neck);

  // 15 Fine Layered Flowing Mane Locks along neck crest
  const maneGroup = new THREE.Group();
  headNeckGroup.add(maneGroup);

  for (let i = 0; i < 15; i++) {
    const t = 0.06 + (i / 14) * 0.88;
    const basePt = neckCurve.getPointAt(t);
    const lockLen = 0.34 + Math.sin(t * Math.PI) * 0.24 + (i % 2) * 0.05;
    const strandCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.015, basePt.y + 0.15 - t * 0.04, basePt.z - 0.02),
      new THREE.Vector3(-0.095 - (i % 2) * 0.025, basePt.y + 0.04, basePt.z - 0.04),
      new THREE.Vector3(-0.16 - Math.sin(i * 1.2) * 0.03, basePt.y - lockLen * 0.62, basePt.z - 0.09),
      new THREE.Vector3(-0.13, basePt.y - lockLen, basePt.z - 0.15),
    ]);
    const strandGeo = new THREE.TubeGeometry(strandCurve, 12, 0.04 - Math.abs(t - 0.5) * 0.014, 8, false);
    const strand = new THREE.Mesh(strandGeo, maneMat);
    strand.castShadow = true;
    maneGroup.add(strand);
  }

  // Head group (pivots cleanly at the poll)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.86, 0.48);
  headGroup.rotation.x = 0.46;
  headNeckGroup.add(headGroup);

  // Seamless Sculpted Lofted Equine Head!
  const sculptedHead = new THREE.Mesh(createSculptedHorseHeadGeometry(), coatMat);
  sculptedHead.castShadow = true;
  sculptedHead.receiveShadow = true;
  headGroup.add(sculptedHead);

  // Rounded Jowls / Cheekbones
  [-1, 1].forEach((side) => {
    const jowl = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 14), coatMat);
    jowl.scale.set(0.65, 0.94, 1.18);
    jowl.position.set(side * 0.092, -0.068, 0.055);
    jowl.castShadow = true;
    headGroup.add(jowl);
  });

  // Soft Velvet Muzzle Cap & Chin blended smoothly over nose tip
  const muzzleGeo = new THREE.SphereGeometry(0.098, 20, 16);
  muzzleGeo.scale(0.92, 0.86, 1.02);
  const muzzle = new THREE.Mesh(muzzleGeo, muzzleMat);
  muzzle.position.set(0, -0.064, 0.515);
  muzzle.castShadow = true;
  headGroup.add(muzzle);

  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.064, 14, 12), muzzleMat);
  chin.scale.set(0.9, 0.72, 1.0);
  chin.position.set(0, -0.122, 0.465);
  headGroup.add(chin);

  // Sculpted Flared Nostrils
  const nostrilInnerMat = new THREE.MeshStandardMaterial({ color: 0x1a1012, roughness: 0.9 });
  [-1, 1].forEach((side) => {
    const nostrilRing = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.01, 8, 14), muzzleMat);
    nostrilRing.position.set(side * 0.065, -0.055, 0.555);
    nostrilRing.rotation.y = side * 0.65;
    headGroup.add(nostrilRing);

    const nostrilHole = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), nostrilInnerMat);
    nostrilHole.position.set(side * 0.061, -0.057, 0.55);
    headGroup.add(nostrilHole);
  });

  // Facial White Star & Blaze
  const starGeo = new THREE.SphereGeometry(0.05, 12, 10);
  starGeo.scale(0.85, 1.35, 0.25);
  const foreheadStar = new THREE.Mesh(starGeo, whiteMarkingMat);
  foreheadStar.position.set(0, 0.105, 0.21);
  foreheadStar.rotation.x = -0.45;
  headGroup.add(foreheadStar);

  const blazeGeo = new THREE.CapsuleGeometry(0.022, 0.22, 4, 10);
  blazeGeo.rotateX(Math.PI / 2);
  blazeGeo.scale(0.9, 0.32, 1.0);
  const blaze = new THREE.Mesh(blazeGeo, whiteMarkingMat);
  blaze.position.set(0, 0.062, 0.35);
  blaze.rotation.x = 0.24;
  headGroup.add(blaze);

  // Expressive Horse Eyes with iris, glossy cornea, catchlight & eyelid
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x3b2110, roughness: 0.2 });
  const pupilMat = new THREE.MeshPhysicalMaterial({
    color: 0x09080a,
    roughness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });
  const catchMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  [-1, 1].forEach((side) => {
    const eyePivot = new THREE.Group();
    eyePivot.position.set(side * 0.132, 0.072, 0.165);
    eyePivot.rotation.y = side * 0.72;

    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.043, 14, 12), irisMat);
    sclera.scale.set(1.0, 0.88, 0.72);
    eyePivot.add(sclera);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), pupilMat);
    pupil.position.set(0, 0, 0.015);
    pupil.scale.set(0.95, 0.85, 0.68);
    eyePivot.add(pupil);

    const catchlight = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), catchMat);
    catchlight.position.set(side * 0.008, 0.012, 0.036);
    eyePivot.add(catchlight);

    const eyelid = new THREE.Mesh(new THREE.TorusGeometry(0.041, 0.011, 6, 12, Math.PI), coatMat);
    eyelid.position.set(0, 0.008, 0.01);
    eyelid.rotation.x = -0.35;
    eyePivot.add(eyelid);

    headGroup.add(eyePivot);
  });

  // Sculpted Alert Ears
  const earInnerMat = new THREE.MeshStandardMaterial({ color: 0xd8b4ac, roughness: 0.7 });
  const earOuterProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.06, 0.02),
    new THREE.Vector2(0.066, 0.09),
    new THREE.Vector2(0.046, 0.18),
    new THREE.Vector2(0.017, 0.25),
    new THREE.Vector2(0.0, 0.27),
  ];
  const earOuterGeo = new THREE.LatheGeometry(earOuterProfile, 16);
  earOuterGeo.scale(0.85, 1.0, 0.65);

  [-1, 1].forEach((side) => {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.102, 0.175, -0.01);
    earGroup.rotation.set(0.18, side * 0.22, side * -0.18);

    const earOuter = new THREE.Mesh(earOuterGeo, coatMat);
    earOuter.castShadow = true;
    earGroup.add(earOuter);

    const earInner = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 10), earInnerMat);
    earInner.scale.set(0.9, 1.0, 0.35);
    earInner.position.set(0, 0.12, 0.025);
    earGroup.add(earInner);

    headGroup.add(earGroup);
  });

  // Multi-strand Wavy Forelock
  [-0.02, 0.02].forEach((fx) => {
    const forelockCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(fx * 0.5, 0.21, 0.04),
      new THREE.Vector3(fx, 0.22, 0.15),
      new THREE.Vector3(fx * 1.4, 0.12, 0.245),
      new THREE.Vector3(fx * 0.8, 0.01, 0.26),
    ]);
    const forelock = new THREE.Mesh(new THREE.TubeGeometry(forelockCurve, 10, 0.032, 8, false), maneMat);
    forelock.castShadow = true;
    headGroup.add(forelock);
  });

  // Detailed Bridle + Star Medallion + Reins
  const browbandCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.15, 0.12, 0.08),
    new THREE.Vector3(0, 0.155, 0.225),
    new THREE.Vector3(0.15, 0.12, 0.08),
  ]);
  headGroup.add(new THREE.Mesh(new THREE.TubeGeometry(browbandCurve, 14, 0.014, 8, false), leatherMat));

  const crownCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.15, 0.12, 0.08),
    new THREE.Vector3(-0.125, 0.19, -0.05),
    new THREE.Vector3(0, 0.205, -0.08),
    new THREE.Vector3(0.125, 0.19, -0.05),
    new THREE.Vector3(0.15, 0.12, 0.08),
  ]);
  headGroup.add(new THREE.Mesh(new THREE.TubeGeometry(crownCurve, 14, 0.013, 6, false), leatherMat));

  const gemMat = new THREE.MeshStandardMaterial({
    color: 0x99f6ff,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.75,
    roughness: 0.1,
    metalness: 0.85,
  });
  const starMedallion = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.015, 10), silverMat);
  starMedallion.rotation.x = Math.PI / 2 - 0.35;
  starMedallion.position.set(0, 0.15, 0.232);
  const browGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), gemMat);
  browGem.position.set(0, 0.153, 0.242);
  headGroup.add(starMedallion, browGem);

  const noseband = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.013, 8, 22), leatherMat);
  noseband.scale.set(0.86, 1.02, 1.0);
  noseband.position.set(0, -0.04, 0.38);
  noseband.rotation.x = 0.12;
  headGroup.add(noseband);

  [-1, 1].forEach((side) => {
    const cheekCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.145, 0.12, 0.08),
      new THREE.Vector3(side * 0.13, 0.01, 0.27),
      new THREE.Vector3(side * 0.102, -0.085, 0.45),
    ]);
    headGroup.add(new THREE.Mesh(new THREE.TubeGeometry(cheekCurve, 10, 0.011, 6, false), leatherMat));

    const bitRing = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 8, 14), silverMat);
    bitRing.rotation.y = Math.PI / 2;
    bitRing.position.set(side * 0.102, -0.092, 0.455);
    headGroup.add(bitRing);

    const reinCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.105, -0.095, 0.45),
      new THREE.Vector3(side * 0.22, -0.25, 0.15),
      new THREE.Vector3(side * 0.25, -0.35, -0.35),
      new THREE.Vector3(side * 0.18, -0.22, -0.68),
    ]);
    headGroup.add(new THREE.Mesh(new THREE.TubeGeometry(reinCurve, 16, 0.009, 6, false), darkLeatherMat));
  });

  // -------------------------------------------------------------
  // 3. LUSH MULTI-STRAND FLOWING TAIL
  // -------------------------------------------------------------
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.72, -1.14);
  horseGroup.add(tailGroup);

  const tailJoint = new THREE.Group();
  tailGroup.add(tailJoint);

  const dockCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.05),
    new THREE.Vector3(0, -0.05, -0.14),
    new THREE.Vector3(0, -0.24, -0.24),
  ]);
  const dock = new THREE.Mesh(new THREE.TubeGeometry(dockCurve, 8, 0.082, 10, false), maneMat);
  dock.castShadow = true;
  tailJoint.add(dock);

  const tailOffsets = [
    { x: 0, z: -0.02, r: 0.095, len: 1.2 },
    { x: 0.055, z: 0.02, r: 0.072, len: 1.1 },
    { x: -0.055, z: 0.02, r: 0.072, len: 1.1 },
    { x: 0.03, z: -0.06, r: 0.075, len: 1.25 },
    { x: -0.03, z: -0.06, r: 0.075, len: 1.25 },
  ];
  tailOffsets.forEach((off, idx) => {
    const strandCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(off.x * 0.4, -0.1, -0.14),
      new THREE.Vector3(off.x, -0.45, -0.28 + off.z),
      new THREE.Vector3(off.x * 1.35, -0.82, -0.33 + off.z + (idx % 2) * 0.03),
      new THREE.Vector3(off.x * 0.85, -off.len, -0.25 + off.z),
    ]);
    const tGeo = new THREE.TubeGeometry(strandCurve, 14, off.r, 10, false);
    const tMesh = new THREE.Mesh(tGeo, maneMat);
    tMesh.castShadow = true;
    tailJoint.add(tMesh);
  });

  // -------------------------------------------------------------
  // 4. ANATOMICAL LEGS WITH SCULPTED CANNON, FEATHERING, CONICAL HOOF & SHOE
  // -------------------------------------------------------------
  const hoofProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.106, 0.0),   // Wide bottom wall
    new THREE.Vector2(0.098, 0.04),
    new THREE.Vector2(0.082, 0.095),
    new THREE.Vector2(0.074, 0.12),  // Coronet band
    new THREE.Vector2(0.0, 0.12),
  ];
  const sculptedHoofGeo = new THREE.LatheGeometry(hoofProfile, 18);
  sculptedHoofGeo.translate(0, -0.12, 0);

  function buildLeg(isFront: boolean, isLeft: boolean) {
    const legRoot = new THREE.Group();
    const xPos = (isLeft ? 1 : -1) * (isFront ? 0.29 : 0.31);
    const zPos = isFront ? 0.62 : -0.72;
    legRoot.position.set(xPos, 1.32, zPos);
    horseGroup.add(legRoot);

    const upperLeg = new THREE.Group();
    legRoot.add(upperLeg);

    const upperLength = 0.54;
    const upperProfile = isFront
      ? [
          new THREE.Vector2(0.084, 0),
          new THREE.Vector2(0.096, 0.14),
          new THREE.Vector2(0.132, 0.34),
          new THREE.Vector2(0.158, 0.54),
        ]
      : [
          new THREE.Vector2(0.09, 0),
          new THREE.Vector2(0.115, 0.18),
          new THREE.Vector2(0.168, 0.38),
          new THREE.Vector2(0.21, 0.54),
        ];
    const upperGeo = new THREE.LatheGeometry(upperProfile, 18);
    upperGeo.translate(0, -upperLength, 0);
    if (!isFront) upperGeo.scale(0.88, 1.0, 1.16);
    const upperMesh = new THREE.Mesh(upperGeo, coatMat);
    upperMesh.castShadow = true;
    upperLeg.add(upperMesh);

    const jointSphere = new THREE.Mesh(new THREE.SphereGeometry(0.088, 14, 12), coatMat);
    jointSphere.scale.set(0.95, 1.12, isFront ? 1.0 : 1.28);
    jointSphere.position.set(0, -upperLength, isFront ? 0 : -0.02);
    upperLeg.add(jointSphere);

    const lowerLeg = new THREE.Group();
    lowerLeg.position.set(0, -upperLength, 0);
    upperLeg.add(lowerLeg);

    const lowerLength = 0.52;
    const lowerMat = horse.coat === 'bulany' ? pointsMat : coatMat;

    const cannonTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.06, lowerLength * 0.55, 16),
      lowerMat
    );
    cannonTop.position.set(0, -lowerLength * 0.275, 0);
    cannonTop.castShadow = true;
    lowerLeg.add(cannonTop);

    const cannonBot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.064, lowerLength * 0.45, 16),
      pointsMat
    );
    cannonBot.position.set(0, -lowerLength * 0.775, 0);
    cannonBot.castShadow = true;
    lowerLeg.add(cannonBot);

    const fetlock = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 12), pointsMat);
    fetlock.position.set(0, -lowerLength, 0);
    lowerLeg.add(fetlock);

    // Subtle feathering tuft behind fetlock
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 8), pointsMat);
    feather.position.set(0, -lowerLength - 0.04, -0.04);
    feather.rotation.x = Math.PI * 0.85;
    lowerLeg.add(feather);

    const pastern = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.068, 0.16, 14), pointsMat);
    pastern.position.set(0, -lowerLength - 0.065, 0.032);
    pastern.rotation.x = -0.38;
    pastern.castShadow = true;
    lowerLeg.add(pastern);

    const hoofGroup = new THREE.Group();
    hoofGroup.position.set(0, -lowerLength - 0.14, 0.065);
    lowerLeg.add(hoofGroup);

    const hoofMesh = new THREE.Mesh(sculptedHoofGeo, hoofMat);
    hoofMesh.position.set(0, 0, 0.01);
    hoofMesh.rotation.x = -0.12;
    hoofMesh.castShadow = true;
    hoofGroup.add(hoofMesh);

    const shoeGeo = new THREE.TorusGeometry(0.094, 0.016, 8, 16, Math.PI * 1.45);
    shoeGeo.rotateX(Math.PI / 2);
    shoeGeo.rotateZ(Math.PI * 0.78);
    const shoeMesh = new THREE.Mesh(shoeGeo, horseshoeMat);
    shoeMesh.position.set(0, -0.115, 0.015);
    hoofGroup.add(shoeMesh);

    return { upper: upperLeg, lower: lowerLeg, hoof: hoofMesh };
  }

  const legFL = buildLeg(true, true);
  const legFR = buildLeg(true, false);
  const legRL = buildLeg(false, true);
  const legRR = buildLeg(false, false);

  // -------------------------------------------------------------
  // 5. QUILTED SADDLE PAD, BEVELED EXTRUDED SADDLE, SADDLEBAGS & STIRRUPS
  // -------------------------------------------------------------
  const blanketGeo = new THREE.CylinderGeometry(0.565, 0.585, 0.96, 26, 1, false, Math.PI * 0.12, Math.PI * 0.76);
  blanketGeo.rotateZ(Math.PI / 2);
  blanketGeo.scale(0.84, 1.05, 1.0);
  const blanket = new THREE.Mesh(blanketGeo, blanketMat);
  blanket.position.set(0, 1.49, -0.05);
  blanket.castShadow = true;
  blanket.receiveShadow = true;
  horseGroup.add(blanket);

  const saddleGroup = new THREE.Group();
  saddleGroup.position.set(0, 1.94, -0.04);
  horseGroup.add(saddleGroup);

  // Extruded contoured English saddle seat profile (swept cantle -> deep seat -> pommel)
  const seatShape = new THREE.Shape();
  seatShape.moveTo(-0.32, 0.1);
  seatShape.quadraticCurveTo(-0.18, 0.0, 0.0, -0.02);
  seatShape.quadraticCurveTo(0.2, -0.01, 0.28, 0.06);
  seatShape.lineTo(0.28, -0.06);
  seatShape.quadraticCurveTo(0.0, -0.09, -0.32, -0.04);
  seatShape.closePath();

  const seatGeo = new THREE.ExtrudeGeometry(seatShape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.03,
    bevelThickness: 0.03,
  });
  seatGeo.rotateY(-Math.PI / 2);
  seatGeo.translate(0.17, 0.03, 0);
  const saddleSeat = new THREE.Mesh(seatGeo, leatherMat);
  saddleSeat.castShadow = true;
  saddleGroup.add(saddleSeat);

  // Beveled contoured saddle flaps + knee rolls
  const flapShape = new THREE.Shape();
  flapShape.moveTo(0, 0);
  flapShape.quadraticCurveTo(0.26, -0.04, 0.28, -0.3);
  flapShape.quadraticCurveTo(0.22, -0.52, -0.04, -0.5);
  flapShape.quadraticCurveTo(-0.24, -0.44, -0.22, -0.14);
  flapShape.closePath();
  const flapGeo = new THREE.ExtrudeGeometry(flapShape, {
    depth: 0.025,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  });

  [-1, 1].forEach((side) => {
    const flap = new THREE.Mesh(flapGeo, leatherMat);
    flap.rotation.y = side * (Math.PI / 2);
    flap.rotation.z = side * -0.18;
    flap.position.set(side * 0.4, -0.02, 0);
    flap.castShadow = true;
    saddleGroup.add(flap);

    const kneeRoll = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.22, 6, 10), darkLeatherMat);
    kneeRoll.position.set(side * 0.44, -0.2, 0.14);
    kneeRoll.rotation.set(0.35, 0, side * -0.2);
    saddleGroup.add(kneeRoll);

    // Adventure Saddlebag with brass buckle behind the cantle
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.26), leatherMat);
    bag.position.set(side * 0.36, -0.14, -0.38);
    bag.rotation.z = side * 0.22;
    bag.castShadow = true;
    const bagBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.05), brassMat);
    bagBuckle.position.set(side * 0.425, -0.12, -0.38);
    saddleGroup.add(bag, bagBuckle);
  });

  // Rolled Traveler Blanket strapped behind saddle cantle
  const bedrollMat = new THREE.MeshStandardMaterial({ map: palette.plaidTex, roughness: 0.85 });
  const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.46, 14), bedrollMat);
  bedroll.rotation.z = Math.PI / 2;
  bedroll.position.set(0, 0.08, -0.4);
  bedroll.castShadow = true;
  saddleGroup.add(bedroll);

  // Girth strap & silver buckle under belly
  const girth = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.03, 8, 28, Math.PI * 1.25), darkLeatherMat);
  girth.scale.set(0.84, 1.04, 1.0);
  girth.position.set(0, 1.48, 0.06);
  girth.rotation.z = Math.PI * 0.875;
  horseGroup.add(girth);

  [-1, 1].forEach((side) => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.58, 0.032), darkLeatherMat);
    strap.position.set(side * 0.48, 1.56, 0.02);
    strap.rotation.z = side * -0.08;
    horseGroup.add(strap);

    const iron = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.013, 8, 14), silverMat);
    iron.position.set(side * 0.5, 1.25, 0.02);
    iron.rotation.y = Math.PI / 2;
    horseGroup.add(iron);
  });

  // -------------------------------------------------------------
  // 6. DETAILED ADVENTURER RIDER
  // -------------------------------------------------------------
  const riderGroup = new THREE.Group();
  riderGroup.position.set(0, 1.98, -0.05);
  horseGroup.add(riderGroup);

  const hairMat = palette.getRiderHairMaterial(rider.hairColor);
  const outfitMat = palette.getRiderOutfitMaterial(rider.outfitColor);
  const skinMat = new THREE.MeshPhysicalMaterial({ color: 0xfad7c0, roughness: 0.52, sheen: 0.25 });
  const bootMat = new THREE.MeshPhysicalMaterial({
    color: 0x2b1a12,
    map: palette.leatherTex,
    roughness: 0.35,
    clearcoat: 0.22,
  });
  const breechesMat = new THREE.MeshStandardMaterial({ color: 0xebe3d3, roughness: 0.65 });

  const riderTorso = new THREE.Group();
  riderGroup.add(riderTorso);

  const tunicProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.195, 0.02),
    new THREE.Vector2(0.148, 0.14),
    new THREE.Vector2(0.185, 0.36),
    new THREE.Vector2(0.205, 0.5),
    new THREE.Vector2(0.09, 0.55),
    new THREE.Vector2(0.0, 0.55),
  ];
  const tunicGeo = new THREE.LatheGeometry(tunicProfile, 20);
  tunicGeo.scale(1.06, 1.0, 0.72);
  const bodyMesh = new THREE.Mesh(tunicGeo, outfitMat);
  bodyMesh.castShadow = true;
  riderTorso.add(bodyMesh);

  // Cream linen inner collar + leather belt & satchel
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.022, 8, 16), breechesMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.54, 0.01);
  riderTorso.add(collar);

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.022, 8, 18), darkLeatherMat);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1.06, 0.74, 1.0);
  belt.position.set(0, 0.15, 0);
  riderTorso.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.02), brassMat);
  buckle.position.set(0, 0.15, 0.12);
  riderTorso.add(buckle);

  // Flowing Traveler Cloak + Shoulder Hood
  const cloakGeo = new THREE.CylinderGeometry(0.17, 0.34, 0.6, 16, 1, true, Math.PI * 0.6, Math.PI * 0.8);
  const cloakMat = outfitMat.clone();
  cloakMat.side = THREE.DoubleSide;
  const cloakMesh = new THREE.Mesh(cloakGeo, cloakMat);
  cloakMesh.position.set(0, 0.25, -0.06);
  cloakMesh.rotation.x = 0.24;
  cloakMesh.castShadow = true;
  riderTorso.add(cloakMesh);

  const neckRider = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 12), skinMat);
  neckRider.position.set(0, 0.57, 0);
  riderTorso.add(neckRider);

  const riderHead = buildStylizedRiderHead(hairMat, skinMat, silverMat, 0x3b82f6);
  riderHead.position.set(0, 0.73, 0.01);
  riderTorso.add(riderHead);

  const broochMat = new THREE.MeshStandardMaterial({
    color: 0xa5f3fc,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.9,
    roughness: 0.1,
    metalness: 0.9,
  });
  const starBrooch = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), broochMat);
  starBrooch.position.set(0, 0.42, 0.145);
  riderTorso.add(starBrooch);

  const starLight = new THREE.PointLight(0x7df9ff, 0.85, 4.5);
  starLight.position.set(0, 0.42, 0.28);
  riderTorso.add(starLight);

  const buildRiderArm = (side: number) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.21, 0.46, 0.02);
    arm.rotation.x = 0.72;
    arm.rotation.z = side * -0.14;

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), outfitMat);
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.3, 6, 10), outfitMat);
    sleeve.position.set(0, -0.18, 0);
    sleeve.castShadow = true;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 6, 12), darkLeatherMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, -0.32, 0);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), darkLeatherMat);
    glove.position.set(0, -0.37, 0.02);
    arm.add(shoulder, sleeve, cuff, glove);
    riderTorso.add(arm);
    return arm;
  };

  const riderArmL = buildRiderArm(1);
  const riderArmR = buildRiderArm(-1);

  [-1, 1].forEach((side) => {
    const riderLeg = new THREE.Group();
    riderLeg.position.set(side * 0.23, 0.06, 0);
    riderLeg.rotation.set(0.32, 0, side * -0.26);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.26, 6, 10), breechesMat);
    thigh.position.set(0, -0.16, 0);
    thigh.castShadow = true;

    const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.34, 14), bootMat);
    bootShaft.position.set(0, -0.45, 0.05);
    bootShaft.rotation.x = -0.22;
    bootShaft.castShadow = true;

    const bootCuff = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.016, 8, 14), leatherMat);
    bootCuff.rotation.x = Math.PI / 2 - 0.22;
    bootCuff.position.set(0, -0.3, 0.02);

    const bootFoot = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.11, 6, 10), bootMat);
    bootFoot.rotation.x = Math.PI / 2;
    bootFoot.position.set(0, -0.62, 0.13);

    riderLeg.add(thigh, bootShaft, bootCuff, bootFoot);
    riderGroup.add(riderLeg);
  });

  return {
    group: root,
    horseMeshGroup: horseGroup,
    headNeckGroup,
    headGroup,
    maneGroup,
    tailGroup,
    tailJoint,
    legFL,
    legFR,
    legRL,
    legRR,
    riderGroup,
    riderTorso,
    riderHead,
    riderArmL,
    riderArmR,
    starBrooch,
    starLight,
  };
}

export interface StandaloneRiderRig {
  group: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  starBrooch: THREE.Mesh;
}

export function createStandaloneRider(
  rider: RiderProfile,
  palette: MaterialPalette
): StandaloneRiderRig {
  const root = new THREE.Group();
  root.name = 'StandaloneRiderRoot';
  root.add(createContactShadow(0.36, 0.36, 0.3));

  const hairMat = palette.getRiderHairMaterial(rider.hairColor);
  const outfitMat = palette.getRiderOutfitMaterial(rider.outfitColor);
  const skinMat = new THREE.MeshPhysicalMaterial({ color: 0xfad7c0, roughness: 0.52, sheen: 0.25 });
  const bootMat = new THREE.MeshPhysicalMaterial({
    color: 0x2b1a12,
    map: palette.leatherTex,
    roughness: 0.35,
    clearcoat: 0.22,
  });
  const darkLeatherMat = new THREE.MeshStandardMaterial({ color: 0x26140b, map: palette.leatherTex, roughness: 0.45 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.9 });
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.18, metalness: 0.92 });
  const breechesMat = new THREE.MeshStandardMaterial({ color: 0xebe3d3, roughness: 0.65 });

  const torso = new THREE.Group();
  torso.position.set(0, 0.84, 0);
  root.add(torso);

  const tunicProfile = [
    new THREE.Vector2(0.0, -0.02),
    new THREE.Vector2(0.195, 0.0),
    new THREE.Vector2(0.148, 0.14),
    new THREE.Vector2(0.185, 0.36),
    new THREE.Vector2(0.205, 0.5),
    new THREE.Vector2(0.09, 0.55),
    new THREE.Vector2(0.0, 0.55),
  ];
  const tunicGeo = new THREE.LatheGeometry(tunicProfile, 20);
  tunicGeo.scale(1.06, 1.0, 0.72);
  const bodyMesh = new THREE.Mesh(tunicGeo, outfitMat);
  bodyMesh.castShadow = true;
  torso.add(bodyMesh);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.022, 8, 16), breechesMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, 0.54, 0.01);
  torso.add(collar);

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.022, 8, 18), darkLeatherMat);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1.06, 0.74, 1.0);
  belt.position.set(0, 0.15, 0);
  torso.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.02), brassMat);
  buckle.position.set(0, 0.15, 0.12);
  torso.add(buckle);

  const cloakGeo = new THREE.CylinderGeometry(0.17, 0.35, 0.68, 16, 1, true, Math.PI * 0.6, Math.PI * 0.8);
  const cloakMat = outfitMat.clone();
  cloakMat.side = THREE.DoubleSide;
  const cloakMesh = new THREE.Mesh(cloakGeo, cloakMat);
  cloakMesh.position.set(0, 0.22, -0.06);
  cloakMesh.rotation.x = 0.14;
  cloakMesh.castShadow = true;
  torso.add(cloakMesh);

  const neckRider = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 12), skinMat);
  neckRider.position.set(0, 0.57, 0);
  torso.add(neckRider);

  const head = buildStylizedRiderHead(hairMat, skinMat, silverMat, 0x3b82f6);
  head.position.set(0, 0.73, 0.01);
  torso.add(head);

  const broochMat = new THREE.MeshStandardMaterial({
    color: 0xa5f3fc,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.9,
    roughness: 0.1,
    metalness: 0.9,
  });
  const starBrooch = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), broochMat);
  starBrooch.position.set(0, 0.42, 0.145);
  torso.add(starBrooch);

  function buildArm(side: number) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.22, 0.46, 0);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 10), outfitMat);
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.32, 6, 10), outfitMat);
    sleeve.position.set(0, -0.2, 0);
    sleeve.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), skinMat);
    hand.position.set(0, -0.41, 0);
    arm.add(shoulder, sleeve, hand);
    torso.add(arm);
    return arm;
  }

  const armL = buildArm(1);
  const armR = buildArm(-1);

  function buildStandingLeg(x: number) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.84, 0);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.26, 6, 10), breechesMat);
    thigh.position.set(0, -0.18, 0);
    thigh.castShadow = true;

    const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.058, 0.4, 14), bootMat);
    bootShaft.position.set(0, -0.56, 0);
    bootShaft.castShadow = true;

    const bootCuff = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12), darkLeatherMat);
    bootCuff.rotation.x = Math.PI / 2;
    bootCuff.position.set(0, -0.38, 0);

    const bootFoot = new THREE.Mesh(new THREE.CapsuleGeometry(0.054, 0.12, 6, 10), bootMat);
    bootFoot.rotation.x = Math.PI / 2;
    bootFoot.position.set(0, -0.785, 0.06);
    bootFoot.castShadow = true;

    leg.add(thigh, bootShaft, bootCuff, bootFoot);
    root.add(leg);
    return leg;
  }

  const legL = buildStandingLeg(0.11);
  const legR = buildStandingLeg(-0.11);

  return {
    group: root,
    torso,
    head,
    armL,
    armR,
    legL,
    legR,
    starBrooch,
  };
}

// -------------------------------------------------------------
// FELEK THE FOX
// -------------------------------------------------------------
export interface FoxRig {
  group: THREE.Group;
  tailGroup: THREE.Group;
  headGroup: THREE.Group;
  legFL: THREE.Group;
  legFR: THREE.Group;
  legRL: THREE.Group;
  legRR: THREE.Group;
}

export function createFoxModel(palette?: MaterialPalette): FoxRig {
  const root = new THREE.Group();
  root.name = 'FelekTheFox';
  root.add(createContactShadow(0.32, 0.55, 0.28));

  const furMat = new THREE.MeshPhysicalMaterial({
    color: 0xe45a1b,
    bumpMap: palette?.coatBumpTex,
    bumpScale: 0.008,
    roughness: 0.55,
    sheen: 0.6,
    sheenColor: new THREE.Color(0xffb078),
  });
  const whiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xfdfcf9,
    bumpMap: palette?.coatBumpTex,
    bumpScale: 0.006,
    roughness: 0.52,
    sheen: 0.5,
  });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a191e, roughness: 0.4 });
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x100c0a, roughness: 0.05, clearcoat: 1.0 });

  const foxBodyProfile = [
    new THREE.Vector2(0.0, -0.39),
    new THREE.Vector2(0.15, -0.33),
    new THREE.Vector2(0.205, -0.1),
    new THREE.Vector2(0.19, 0.16),
    new THREE.Vector2(0.215, 0.3),
    new THREE.Vector2(0.145, 0.39),
    new THREE.Vector2(0.0, 0.43),
  ];
  const bodyGeo = new THREE.LatheGeometry(foxBodyProfile, 22);
  bodyGeo.rotateX(Math.PI / 2);
  bodyGeo.scale(0.86, 1.0, 1.0);
  const body = new THREE.Mesh(bodyGeo, furMat);
  body.position.set(0, 0.44, 0);
  body.castShadow = true;
  root.add(body);

  const bib = new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 14), whiteMat);
  bib.scale.set(0.85, 1.15, 0.78);
  bib.position.set(0, 0.42, 0.28);
  root.add(bib);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.62, 0.38);
  root.add(headGroup);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.165, 18, 16), furMat);
  headMesh.scale.set(1.06, 0.92, 1.04);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  [-1, 1].forEach((side) => {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.098, 12, 10), whiteMat);
    cheek.scale.set(1.15, 0.85, 0.8);
    cheek.position.set(side * 0.11, -0.04, 0.05);
    headGroup.add(cheek);
  });

  const snoutTop = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.24, 14), furMat);
  snoutTop.rotation.x = Math.PI / 2;
  snoutTop.scale.set(0.95, 1.0, 0.65);
  snoutTop.position.set(0, -0.02, 0.21);
  headGroup.add(snoutTop);

  const snoutBottom = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.2, 14), whiteMat);
  snoutBottom.rotation.x = Math.PI / 2;
  snoutBottom.scale.set(0.9, 1.0, 0.55);
  snoutBottom.position.set(0, -0.055, 0.2);
  headGroup.add(snoutBottom);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), blackMat);
  nose.position.set(0, -0.025, 0.33);
  headGroup.add(nose);

  const catchMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), eyeMat);
    eye.position.set(side * 0.088, 0.05, 0.125);
    const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), catchMat);
    sparkle.position.set(side * 0.095, 0.062, 0.15);
    headGroup.add(eye, sparkle);
  });

  [-1, 1].forEach((side) => {
    const ear = new THREE.Group();
    ear.position.set(side * 0.105, 0.155, -0.01);
    ear.rotation.set(0.12, side * 0.2, side * -0.24);

    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.2, 12), furMat);
    outer.scale.set(1.0, 1.0, 0.6);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 12), blackMat);
    tip.scale.set(1.0, 1.0, 0.62);
    tip.position.set(0, 0.065, -0.004);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.14, 10), whiteMat);
    inner.scale.set(1.0, 1.0, 0.35);
    inner.position.set(0, -0.01, 0.018);

    ear.add(outer, tip, inner);
    headGroup.add(ear);
  });

  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.45, -0.34);
  root.add(tailGroup);

  const tailProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.075, 0.04),
    new THREE.Vector2(0.16, 0.22),
    new THREE.Vector2(0.17, 0.42),
    new THREE.Vector2(0.11, 0.56),
    new THREE.Vector2(0.0, 0.62),
  ];
  const tailBodyGeo = new THREE.LatheGeometry(tailProfile, 18);
  tailBodyGeo.rotateX(-Math.PI * 0.64);
  const tailBody = new THREE.Mesh(tailBodyGeo, furMat);
  tailBody.castShadow = true;
  tailGroup.add(tailBody);

  const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 14), whiteMat);
  tailTip.position.set(0, 0.24, -0.52);
  tailTip.rotation.x = -Math.PI * 0.64;
  tailGroup.add(tailTip);

  function buildFoxLeg(x: number, z: number) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.38, z);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.04, 0.16, 10), furMat);
    upper.position.set(0, -0.08, 0);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.2, 10), blackMat);
    sock.position.set(0, -0.25, 0);
    sock.castShadow = true;
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), whiteMat);
    paw.scale.set(0.95, 0.65, 1.25);
    paw.position.set(0, -0.355, 0.015);

    leg.add(upper, sock, paw);
    root.add(leg);
    return leg;
  }

  const legFL = buildFoxLeg(0.11, 0.22);
  const legFR = buildFoxLeg(-0.11, 0.22);
  const legRL = buildFoxLeg(0.11, -0.22);
  const legRR = buildFoxLeg(-0.11, -0.22);

  return {
    group: root,
    tailGroup,
    headGroup,
    legFL,
    legFR,
    legRL,
    legRR,
  };
}

// -------------------------------------------------------------
// MONSTERS (Troll, Orc, Goblin) — Textured & Beveled Silhouette Upgrades
// -------------------------------------------------------------
export function createMonsterModel(type: 'goblin' | 'orc' | 'troll', palette?: MaterialPalette): THREE.Group {
  const group = new THREE.Group();

  if (type === 'troll') {
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x626b60,
      map: palette?.mountainRockTex,
      bumpMap: palette?.mountainRockTex,
      bumpScale: 0.04,
      roughness: 0.88,
      flatShading: true,
    });
    const darkStoneMat = new THREE.MeshStandardMaterial({
      color: 0x454c43,
      map: palette?.mountainRockTex,
      roughness: 0.92,
      flatShading: true,
    });
    const mossMat = new THREE.MeshStandardMaterial({
      color: 0x3b632c,
      map: palette?.willowFoliageTex,
      roughness: 0.9,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x4b2f1c,
      map: palette?.barkTex,
      roughness: 0.8,
    });
    const leatherMat = new THREE.MeshStandardMaterial({
      color: 0x362012,
      map: palette?.leatherTex,
      roughness: 0.7,
    });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.4, metalness: 0.82 });
    const tuskMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.38 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffd000, emissive: 0xff9900, emissiveIntensity: 0.9 });

    const torsoGeo = displaceVertices(new THREE.IcosahedronGeometry(1.16, 2), 0.12, 2.2);
    torsoGeo.scale(1.12, 1.15, 0.9);
    const torso = new THREE.Mesh(torsoGeo, stoneMat);
    torso.position.set(0, 2.25, 0);
    torso.castShadow = true;
    group.add(torso);

    const loincloth = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.16, 0.78, 12), leatherMat);
    loincloth.position.set(0, 1.38, 0);
    group.add(loincloth);

    // Diagonal leather chest strap
    const chestStrap = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.08, 6, 20), leatherMat);
    chestStrap.position.set(0, 2.35, 0);
    chestStrap.rotation.set(Math.PI / 2 - 0.55, 0.4, 0);
    group.add(chestStrap);

    [-1, 1].forEach((side) => {
      const shoulderGeo = displaceVertices(new THREE.DodecahedronGeometry(0.62, 1), 0.14, 3.0);
      const shoulder = new THREE.Mesh(shoulderGeo, stoneMat);
      shoulder.position.set(side * 1.02, 2.75, -0.05);
      shoulder.castShadow = true;
      group.add(shoulder);

      const moss = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 8), mossMat);
      moss.scale.set(1.25, 0.52, 1.05);
      moss.position.set(side * 0.98, 3.12, -0.08);
      group.add(moss);

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.27, 1.4, 10), darkStoneMat);
      arm.position.set(side * 1.28, 1.95, 0.15);
      arm.rotation.z = side * -0.18;
      arm.castShadow = true;
      group.add(arm);

      const fist = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 1), stoneMat);
      fist.position.set(side * 1.4, 1.22, 0.25);
      group.add(fist);
    });

    const headGeo = displaceVertices(new THREE.IcosahedronGeometry(0.64, 1), 0.1, 3.5);
    headGeo.scale(0.95, 1.08, 1.02);
    const head = new THREE.Mesh(headGeo, stoneMat);
    head.position.set(0, 3.42, 0.36);
    head.castShadow = true;
    group.add(head);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.2, 0.34), darkStoneMat);
    brow.position.set(0, 3.62, 0.72);
    group.add(brow);

    const trollNose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 7), darkStoneMat);
    trollNose.rotation.x = Math.PI * 0.65;
    trollNose.position.set(0, 3.36, 0.92);
    group.add(trollNose);

    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeMat);
      eye.position.set(side * 0.22, 3.48, 0.85);
      group.add(eye);

      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.26, 6), tuskMat);
      tusk.position.set(side * 0.2, 3.15, 0.82);
      tusk.rotation.x = 0.2;
      group.add(tusk);
    });

    // Uprooted Tree Club with iron bands & spikes
    const clubGroup = new THREE.Group();
    clubGroup.position.set(1.42, 1.85, 0.55);
    clubGroup.rotation.set(0.35, 0, -0.32);
    const clubWood = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.12, 2.75, 10), woodMat);
    clubWood.castShadow = true;
    const ironBand1 = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 6, 12), ironMat);
    ironBand1.rotation.x = Math.PI / 2;
    ironBand1.position.y = 0.85;
    const ironBand2 = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 6, 12), ironMat);
    ironBand2.rotation.x = Math.PI / 2;
    ironBand2.position.y = 0.3;
    clubGroup.add(clubWood, ironBand1, ironBand2);
    for (let s = 0; s < 5; s++) {
      const ang = (s / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 5), ironMat);
      spike.position.set(Math.cos(ang) * 0.3, 0.85, Math.sin(ang) * 0.3);
      spike.rotation.z = -Math.cos(ang) * Math.PI / 2;
      spike.rotation.x = Math.sin(ang) * Math.PI / 2;
      clubGroup.add(spike);
    }
    group.add(clubGroup);

    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 1.35, 10), darkStoneMat);
      leg.position.set(side * 0.54, 0.68, 0);
      leg.castShadow = true;
      group.add(leg);
    });
  } else if (type === 'orc') {
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x2f353d, roughness: 0.38, metalness: 0.78 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.28, metalness: 0.88 });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x56643c,
      bumpMap: palette?.coatBumpTex,
      bumpScale: 0.008,
      roughness: 0.65,
    });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x4c1d1d, roughness: 0.8 });
    const shieldWoodMat = new THREE.MeshStandardMaterial({
      color: 0x452b19,
      map: palette?.woodTex,
      roughness: 0.72,
    });
    const tuskMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.4 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff0000, emissiveIntensity: 0.85 });

    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.36, 0.95, 12), armorMat);
    chest.scale.set(1.15, 1.0, 0.72);
    chest.position.set(0, 1.48, 0);
    chest.castShadow = true;
    group.add(chest);

    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.45, 0.46, 12), clothMat);
    waist.scale.set(1.1, 1.0, 0.75);
    waist.position.set(0, 0.95, 0);
    group.add(waist);

    [-1, 1].forEach((side) => {
      const pauldron = new THREE.Mesh(
        new THREE.SphereGeometry(0.27, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
        armorMat
      );
      pauldron.position.set(side * 0.54, 1.88, 0);
      pauldron.rotation.z = side * -0.4;
      group.add(pauldron);

      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 6), trimMat);
      spike.position.set(side * 0.66, 2.06, 0);
      spike.rotation.z = side * -0.5;
      group.add(spike);

      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.52, 6, 8), skinMat);
      arm.position.set(side * 0.6, 1.45, 0.08);
      arm.rotation.z = side * -0.15;
      arm.castShadow = true;
      group.add(arm);
    });

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), skinMat);
    head.position.set(0, 2.18, 0.06);
    head.castShadow = true;
    group.add(head);

    const helm = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
      armorMat
    );
    helm.position.set(0, 2.22, 0.06);
    group.add(helm);

    const nasalGuard = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.22, 0.04), trimMat);
    nasalGuard.position.set(0, 2.18, 0.39);
    group.add(nasalGuard);

    const helmCrest = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 6), trimMat);
    helmCrest.position.set(0, 2.66, 0.06);
    group.add(helmCrest);

    [-1, 1].forEach((side) => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 6), tuskMat);
      horn.position.set(side * 0.34, 2.42, 0.06);
      horn.rotation.z = side * -0.7;
      group.add(horn);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), eyeMat);
      eye.position.set(side * 0.12, 2.18, 0.34);
      group.add(eye);

      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.12, 6), tuskMat);
      tusk.position.set(side * 0.11, 2.02, 0.33);
      group.add(tusk);
    });

    // Bossed Wooden & Iron Round Shield
    const shieldGroup = new THREE.Group();
    shieldGroup.position.set(-0.72, 1.42, 0.28);
    shieldGroup.rotation.y = -0.35;
    const shieldBody = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.07, 18), shieldWoodMat);
    shieldBody.rotation.x = Math.PI / 2;
    const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.045, 8, 20), trimMat);
    const shieldBoss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), trimMat);
    shieldBoss.position.z = 0.04;
    shieldGroup.add(shieldBody, shieldRim, shieldBoss);
    group.add(shieldGroup);

    // Curved Beveled Orc Scimitar (`ExtrudeGeometry`)
    const swordGroup = new THREE.Group();
    swordGroup.position.set(0.68, 1.4, 0.34);
    swordGroup.rotation.set(0.6, 0, -0.25);
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8), clothMat);
    const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.06), trimMat);
    crossguard.position.y = 0.14;

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.045, 0);
    bladeShape.quadraticCurveTo(0.04, 0.45, 0.16, 0.92);
    bladeShape.lineTo(-0.02, 0.98);
    bladeShape.quadraticCurveTo(-0.06, 0.45, -0.045, 0);
    const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
      depth: 0.024,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.008,
      bevelThickness: 0.008,
    });
    const blade = new THREE.Mesh(bladeGeo, trimMat);
    blade.position.set(0, 0.16, -0.012);
    swordGroup.add(hilt, crossguard, blade);
    group.add(swordGroup);

    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.85, 10), armorMat);
      leg.position.set(side * 0.22, 0.425, 0);
      leg.castShadow = true;
      group.add(leg);
    });
  } else {
    const gobMat = new THREE.MeshStandardMaterial({ color: 0x4b7447, roughness: 0.68 });
    const ragMat = new THREE.MeshStandardMaterial({
      color: 0x4a2f1d,
      map: palette?.leatherTex,
      roughness: 0.82,
    });
    const staffWoodMat = new THREE.MeshStandardMaterial({ color: 0x462a16, map: palette?.barkTex, roughness: 0.85 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffb703, emissive: 0xff7b00, emissiveIntensity: 0.9 });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.15,
      roughness: 0.15,
    });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.42, 6, 12), ragMat);
    torso.position.set(0, 0.82, 0.04);
    torso.rotation.x = 0.22;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 12), gobMat);
    head.scale.set(1.06, 0.94, 1.0);
    head.position.set(0, 1.3, 0.12);
    head.castShadow = true;
    group.add(head);

    const gobNose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), gobMat);
    gobNose.rotation.x = Math.PI * 0.6;
    gobNose.position.set(0, 1.26, 0.36);
    group.add(gobNose);

    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.38, 8), gobMat);
      ear.scale.set(1.0, 1.0, 0.45);
      ear.position.set(side * 0.28, 1.36, 0.05);
      ear.rotation.z = side * -1.15;
      group.add(ear);

      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), eyeMat);
      eye.position.set(side * 0.095, 1.34, 0.3);
      group.add(eye);

      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.38, 4, 8), gobMat);
      arm.position.set(side * 0.28, 0.86, 0.1);
      arm.rotation.z = side * -0.18;
      group.add(arm);

      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.38, 4, 8), gobMat);
      leg.position.set(side * 0.13, 0.3, 0);
      leg.castShadow = true;
      group.add(leg);
    });

    const staffCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.4, 0.05, 0.16),
      new THREE.Vector3(0.38, 0.75, 0.19),
      new THREE.Vector3(0.42, 1.42, 0.17),
    ]);
    const staff = new THREE.Mesh(new THREE.TubeGeometry(staffCurve, 10, 0.036, 8, false), staffWoodMat);
    const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 12), ragMat);
    crownRing.position.set(0.42, 1.54, 0.17);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), crystalMat);
    gem.position.set(0.42, 1.54, 0.17);
    group.add(staff, crownRing, gem);
  }

  const ringGeo = new THREE.RingGeometry(2.0, 2.22, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff3344,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.04;
  group.add(ring);

  return group;
}

// -------------------------------------------------------------
// SCENERY: HOBBIT BURROW, ABANDONED STABLE, CAMP, LONELY MOUNTAIN
// -------------------------------------------------------------
export function createHobbitBurrow(palette?: MaterialPalette, doorColorHex = 0x248246): THREE.Group {
  const group = new THREE.Group();

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x4c8a38,
    bumpMap: palette?.coatBumpTex,
    bumpScale: 0.015,
    roughness: 0.82,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x623b22,
    map: palette?.woodTex,
    roughness: 0.65,
  });
  const doorMat = new THREE.MeshPhysicalMaterial({
    color: doorColorHex,
    map: palette?.woodTex,
    roughness: 0.36,
    clearcoat: 0.2,
  });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.18, metalness: 0.92 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.85 });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x8b8f87,
    map: palette?.stoneTex,
    bumpMap: palette?.stoneTex,
    bumpScale: 0.035,
    roughness: 0.86,
  });
  const creamPlasterMat = new THREE.MeshStandardMaterial({ color: 0xe9e0ca, roughness: 0.86 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffea9f, emissive: 0xffb733, emissiveIntensity: 0.68 });

  // Organically undulated Hobbit hillside mound
  const hillGeo = displaceVertices(
    new THREE.SphereGeometry(6.3, 32, 22, 0, Math.PI * 2, 0, Math.PI * 0.46),
    0.055,
    0.75,
    true
  );
  hillGeo.scale(1.45, 0.78, 1.38);
  const hill = new THREE.Mesh(hillGeo, grassMat);
  hill.castShadow = true;
  hill.receiveShadow = true;
  group.add(hill);

  // Curved cottage front facade + timber base beam
  const facade = new THREE.Mesh(
    new THREE.CylinderGeometry(3.7, 3.88, 2.95, 24, 1, false, -Math.PI * 0.38, Math.PI * 0.76),
    creamPlasterMat
  );
  facade.position.set(0, 1.3, 4.9);
  facade.castShadow = true;
  facade.receiveShadow = true;
  group.add(facade);

  // Stone retaining skirting + Threshold Step + Stepping Stone Garden Path
  const step = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.24, 1.0), stoneMat);
  step.position.set(0, 0.12, 5.5);
  step.receiveShadow = true;
  group.add(step);

  for (let s = 0; s < 5; s++) {
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.55 - s * 0.03, 0.58, 0.08, 9), stoneMat);
    slab.scale.set(1.25, 1.0, 0.82);
    slab.position.set((s % 2 === 0 ? 0.12 : -0.12), 0.04, 6.3 + s * 0.95);
    slab.receiveShadow = true;
    group.add(slab);
  }

  // Iconic Round Hobbit Door with fitted stone archway, timber ring, iron hinges & centered brass knob
  const doorArch = new THREE.Mesh(new THREE.TorusGeometry(1.26, 0.18, 12, 32), stoneMat);
  doorArch.position.set(0, 1.42, 5.26);
  group.add(doorArch);

  const doorFrame = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.075, 10, 30), woodMat);
  doorFrame.position.set(0, 1.42, 5.31);
  group.add(doorFrame);

  const door = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.1, 30), doorMat);
  door.rotation.x = Math.PI / 2;
  door.position.set(0, 1.42, 5.27);
  door.castShadow = true;
  group.add(door);

  [-0.36, 0.36].forEach((hy) => {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.075, 0.03), ironMat);
    hinge.position.set(-0.62, 1.42 + hy, 5.33);
    group.add(hinge);
  });

  const knobPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16), brassMat);
  knobPlate.rotation.x = Math.PI / 2;
  knobPlate.position.set(0, 1.42, 5.33);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), brassMat);
  knob.position.set(0, 1.42, 5.4);
  group.add(knobPlate, knob);

  // Two cozy Round Hobbit Windows with wooden shutters & flowerboxes
  const flowerMats = [0xf43f5e, 0xfbbf24, 0xc084fc].map(
    (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 })
  );
  [-2.15, 2.15].forEach((wx) => {
    const winGroup = new THREE.Group();
    winGroup.position.set(wx, 1.54, 4.65);
    winGroup.rotation.y = wx > 0 ? 0.36 : -0.36;

    const frameOuter = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.085, 8, 24), woodMat);
    const pane = new THREE.Mesh(new THREE.CircleGeometry(0.53, 24), glassMat);
    pane.position.z = 0.01;
    const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.04, 0.05), woodMat);
    mullionV.position.z = 0.025;
    const mullionH = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.045, 0.05), woodMat);
    mullionH.position.z = 0.025;

    const box = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.24, 0.34), woodMat);
    box.position.set(0, -0.64, 0.16);
    winGroup.add(frameOuter, pane, mullionV, mullionH, box);

    for (let f = -0.35; f <= 0.36; f += 0.23) {
      const fMat = flowerMats[Math.abs(Math.round(f * 10)) % flowerMats.length];
      const bloom = new THREE.Mesh(new THREE.DodecahedronGeometry(0.095, 0), fMat);
      bloom.position.set(f, -0.46, 0.18);
      winGroup.add(bloom);
    }

    group.add(winGroup);
  });

  // Wooden Garden Bench by the front facade
  const benchGroup = new THREE.Group();
  benchGroup.position.set(2.3, 0, 5.85);
  benchGroup.rotation.y = -0.22;
  const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.42), woodMat);
  benchSeat.position.y = 0.44;
  const benchBack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.36, 0.07), woodMat);
  benchBack.position.set(0, 0.72, -0.18);
  [-0.56, 0.56].forEach((lx) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.38), woodMat);
    leg.position.set(lx, 0.22, 0);
    benchGroup.add(leg);
  });
  benchGroup.add(benchSeat, benchBack);
  group.add(benchGroup);

  // Stone Chimney with clay pots & smoke puffs
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 2.25, 12), stoneMat);
  chimney.position.set(-1.9, 3.6, 1.4);
  chimney.castShadow = true;
  const chimneyCap = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.48, 0.24, 12), stoneMat);
  chimneyCap.position.set(-1.9, 4.78, 1.4);
  const chimneyPot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0xa14d36, roughness: 0.8 }));
  chimneyPot.position.set(-1.9, 5.05, 1.4);
  group.add(chimney, chimneyCap, chimneyPot);

  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 1,
    transparent: true,
    opacity: 0.42,
  });
  for (let s = 0; s < 3; s++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.24 + s * 0.1, 10, 8), smokeMat);
    puff.position.set(-1.9 + s * 0.22, 5.45 + s * 0.55, 1.4 - s * 0.12);
    group.add(puff);
  }

  // Wooden picket garden fence with horizontal rails
  [-1, 1].forEach((side) => {
    const startX = side * 1.65;
    const endX = side * 4.4;
    const midX = (startX + endX) / 2;
    const span = Math.abs(endX - startX);

    [0.32, 0.68].forEach((ry) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(span, 0.08, 0.06), woodMat);
      rail.position.set(midX, ry, 6.25);
      rail.castShadow = true;
      group.add(rail);
    });

    for (let k = 0; k < 4; k++) {
      const px = THREE.MathUtils.lerp(startX, endX, k / 3);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.95, 8), woodMat);
      post.position.set(px, 0.475, 6.25);
      post.castShadow = true;
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 8), woodMat);
      finial.position.set(px, 1.0, 6.25);
      group.add(post, finial);
    }
  });

  // Oak Rain Barrel & Stacked Firewood by left facade
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.35, 0.82, 12), woodMat);
  barrel.position.set(-2.95, 0.41, 5.25);
  barrel.castShadow = true;
  const hoop1 = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 6, 16), ironMat);
  hoop1.rotation.x = Math.PI / 2;
  hoop1.position.set(-2.95, 0.22, 5.25);
  const hoop2 = hoop1.clone();
  hoop2.position.y = 0.62;
  group.add(barrel, hoop1, hoop2);

  for (let l = 0; l < 5; l++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.72, 7), woodMat);
    log.rotation.z = Math.PI / 2;
    log.position.set(-3.75, 0.1 + Math.floor(l / 3) * 0.16, 4.9 + (l % 3) * 0.18);
    log.castShadow = true;
    group.add(log);
  }

  // Warm Glowing Garden Gate Lantern Post
  const gatePost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.25, 8), woodMat);
  gatePost.position.set(-1.58, 1.12, 6.32);
  gatePost.castShadow = true;
  const gateArm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.06), ironMat);
  gateArm.position.set(-1.38, 2.18, 6.32);
  const lanternGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.09, 0.26, 6),
    new THREE.MeshStandardMaterial({ color: 0xffe484, emissive: 0xffaa22, emissiveIntensity: 1.9 })
  );
  lanternGlass.position.set(-1.18, 1.98, 6.32);
  const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 6), ironMat);
  lanternCap.position.set(-1.18, 2.16, 6.32);
  group.add(gatePost, gateArm, lanternGlass, lanternCap);

  // Climbing moss/ivy tufts along facade trim
  const ivyMat = new THREE.MeshStandardMaterial({ color: 0x3b7a36, roughness: 0.75 });
  [
    { x: -1.45, y: 2.55, z: 5.15 },
    { x: 1.55, y: 2.48, z: 5.1 },
    { x: 3.1, y: 1.95, z: 4.15 },
  ].forEach((iv) => {
    const tuft = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), ivyMat);
    tuft.position.set(iv.x, iv.y, iv.z);
    tuft.scale.set(1.2, 0.85, 0.65);
    group.add(tuft);
  });

  return optimizeStaticGroup(group);
}

export function createAbandonedStable(palette?: MaterialPalette): THREE.Group {
  const group = new THREE.Group();

  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x62422b,
    map: palette?.woodTex,
    roughness: 0.72,
  });
  const darkWoodMat = new THREE.MeshStandardMaterial({
    color: 0x422b1b,
    map: palette?.woodTex,
    roughness: 0.78,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x7b807a,
    map: palette?.stoneTex,
    roughness: 0.9,
  });
  const thatchMat = new THREE.MeshStandardMaterial({
    color: 0x8f7952,
    map: palette?.thatchTex,
    bumpMap: palette?.thatchTex,
    bumpScale: 0.03,
    roughness: 0.88,
  });
  const hayMat = new THREE.MeshStandardMaterial({
    color: 0xd9b64e,
    map: palette?.thatchTex,
    roughness: 0.86,
  });
  const appleMat = new THREE.MeshPhysicalMaterial({ color: 0xdc2626, roughness: 0.22, clearcoat: 0.45 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.6 });
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xffaa00, emissiveIntensity: 1.05 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.85 });

  const postPositions = [
    [-3, -2], [3, -2],
    [-3, 2], [3, 2],
    [0, -2], [0, 2],
  ];
  postPositions.forEach(([x, z]) => {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.48), stoneMat);
    pier.position.set(x, 0.17, z);
    pier.receiveShadow = true;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.1, 0.28), woodMat);
    post.position.set(x, 1.7, z);
    post.castShadow = true;
    group.add(pier, post);
  });

  [-3, 3].forEach((x) => {
    const dir = x < 0 ? 1 : -1;
    [-2, 2].forEach((z) => {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.14), darkWoodMat);
      brace.position.set(x + dir * 0.32, 2.75, z);
      brace.rotation.z = (dir * -Math.PI) / 4;
      group.add(brace);
    });
  });

  [-2, 2].forEach((z) => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.26, 0.26), darkWoodMat);
    beam.position.set(0, 3.15, z);
    beam.castShadow = true;
    group.add(beam);
  });
  const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 5.1), darkWoodMat);
  ridgeBeam.position.set(0, 4.52, 0);
  group.add(ridgeBeam);

  // Overhanging Purlin Rafters + Slanted Textured Thatch Roof
  for (let rz = -2.1; rz <= 2.11; rz += 1.05) {
    const rafterL = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.12, 0.12), darkWoodMat);
    rafterL.position.set(-1.72, 3.72, rz);
    rafterL.rotation.z = 0.36;
    const rafterR = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.12, 0.12), darkWoodMat);
    rafterR.position.set(1.72, 3.72, rz);
    rafterR.rotation.z = -0.36;
    group.add(rafterL, rafterR);
  }

  const roofL = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.2, 5.0), thatchMat);
  roofL.position.set(-1.74, 3.86, 0);
  roofL.rotation.z = 0.36;
  roofL.castShadow = true;
  roofL.receiveShadow = true;

  const roofR = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.2, 5.0), thatchMat);
  roofR.position.set(1.74, 3.86, 0);
  roofR.rotation.z = -0.36;
  roofR.castShadow = true;
  roofR.receiveShadow = true;
  group.add(roofL, roofR);

  // Half-wall wooden stall railings & open stall dutch-gate
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.25, 0.14), woodMat);
  backWall.position.set(0, 0.68, -2.0);
  backWall.castShadow = true;
  group.add(backWall);

  [-3, 3].forEach((x) => {
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.25, 4.0), woodMat);
    sideWall.position.set(x, 0.68, 0);
    sideWall.castShadow = true;
    group.add(sideWall);
  });

  // Swung-open stall half-door with cross brace
  const dutchDoor = new THREE.Group();
  dutchDoor.position.set(-3, 0.68, 2.0);
  dutchDoor.rotation.y = -1.1;
  const doorPlanks = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.12, 0.1), woodMat);
  doorPlanks.position.x = 0.68;
  const doorBrace = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.12, 0.13), darkWoodMat);
  doorBrace.position.x = 0.68;
  doorBrace.rotation.z = 0.55;
  dutchDoor.add(doorPlanks, doorBrace);
  group.add(dutchDoor);

  // Tied Hay Bales + Leaning Wooden Ladder
  for (let b = 0; b < 4; b++) {
    const bx = -1.9 + (b % 2) * 1.15;
    const bz = -0.85 + Math.floor(b / 2) * 0.95;
    const bale = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.62, 0.74), hayMat);
    bale.position.set(bx, 0.31, bz);
    bale.rotation.y = (b % 2) * 0.12 - 0.06;
    bale.castShadow = true;
    const twine = new THREE.Mesh(new THREE.BoxGeometry(1.07, 0.64, 0.04), darkWoodMat);
    twine.position.set(bx, 0.31, bz);
    twine.rotation.y = bale.rotation.y;
    group.add(bale, twine);
  }

  const ladderGroup = new THREE.Group();
  ladderGroup.position.set(-2.55, 0, -1.35);
  ladderGroup.rotation.x = -0.25;
  [-0.24, 0.24].forEach((lx) => {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 3.0, 6), darkWoodMat);
    rail.position.set(lx, 1.5, 0);
    ladderGroup.add(rail);
  });
  for (let r = 0.35; r <= 2.6; r += 0.45) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.48, 6), woodMat);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(0, r, 0);
    ladderGroup.add(rung);
  }
  group.add(ladderGroup);

  // Hooped Wooden Water Barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.85, 16), woodMat);
  barrel.position.set(-2.35, 0.425, 1.4);
  barrel.castShadow = true;
  const hoop1 = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.025, 6, 16), ironMat);
  hoop1.rotation.x = Math.PI / 2;
  hoop1.position.set(-2.35, 0.65, 1.4);
  const hoop2 = hoop1.clone();
  hoop2.position.y = 0.22;
  group.add(barrel, hoop1, hoop2);

  // Carved Feed Trough with Apples & Leaves
  const trough = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.52, 0.68), darkWoodMat);
  trough.position.set(1.55, 0.42, -1.2);
  trough.castShadow = true;
  group.add(trough);

  for (let a = 0; a < 7; a++) {
    const ax = 0.82 + a * 0.24;
    const az = -1.2 + (a % 2 === 0 ? 0.08 : -0.08);
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 10), appleMat);
    apple.position.set(ax, 0.72, az);
    apple.castShadow = true;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 4), leafMat);
    leaf.position.set(ax + 0.03, 0.84, az);
    leaf.rotation.z = -0.6;
    group.add(apple, leaf);
  }

  // Wrought-iron hanging lantern cage
  const lanternChain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), ironMat);
  lanternChain.position.set(0, 2.9, 2.0);
  const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 6), ironMat);
  lanternCap.position.set(0, 2.66, 2.0);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.28, 6), lanternMat);
  lantern.position.set(0, 2.48, 2.0);
  const lanternLight = new THREE.PointLight(0xffaa33, 1.6, 9);
  lanternLight.position.set(0, 2.45, 2.0);
  group.add(lanternChain, lanternCap, lantern, lanternLight);

  return optimizeStaticGroup(group);
}

export function createCampfireSite(palette?: MaterialPalette): THREE.Group {
  const group = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x62666a,
    map: palette?.stoneTex,
    roughness: 0.92,
    flatShading: true,
  });
  const logMat = new THREE.MeshStandardMaterial({
    color: 0x4b2e1b,
    map: palette?.barkTex,
    roughness: 0.84,
  });
  const chestWoodMat = new THREE.MeshStandardMaterial({
    color: 0x5c3a22,
    map: palette?.woodTex,
    roughness: 0.7,
  });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.88 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.22, metalness: 0.88 });
  const canvasMat = new THREE.MeshStandardMaterial({
    color: 0xe9e0cc,
    map: palette?.canvasTex,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x265c3b, roughness: 0.62 });
  const plaidMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: palette?.plaidTex,
    roughness: 0.86,
  });
  const emberMat = new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff3300, emissiveIntensity: 1.5 });
  const flameMat = new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xff8800, emissiveIntensity: 1.7 });
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffe082, emissive: 0xffb300, emissiveIntensity: 1.3 });

  const ashBed = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 18),
    new THREE.MeshStandardMaterial({ color: 0x22201e, roughness: 1.0 })
  );
  ashBed.rotation.x = -Math.PI / 2;
  ashBed.position.y = 0.025;
  group.add(ashBed);

  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + (i % 3) * 0.025), stoneMat);
    stone.scale.set(1.15, 0.75, 1.0);
    stone.position.set(Math.cos(angle) * 0.76, 0.1, Math.sin(angle) * 0.76);
    stone.rotation.y = angle;
    stone.castShadow = true;
    group.add(stone);
  }

  for (let j = 0; j < 5; j++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.95, 8), logMat);
    log.position.set(0, 0.17, 0);
    log.rotation.x = 0.38;
    log.rotation.y = (j / 5) * Math.PI * 2;
    log.castShadow = true;
    group.add(log);
  }

  const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), emberMat);
  core.position.set(0, 0.25, 0);
  group.add(core);

  const flameGroup = new THREE.Group();
  flameGroup.name = 'CampFlames';
  const flameMain = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.68, 8), flameMat);
  flameMain.position.set(0, 0.56, 0);
  const flameSideL = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.46, 7), flameMat);
  flameSideL.position.set(0.14, 0.45, 0.06);
  flameSideL.rotation.z = -0.2;
  const flameSideR = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 7), emberMat);
  flameSideR.position.set(-0.14, 0.42, -0.06);
  flameSideR.rotation.z = 0.22;
  flameGroup.add(flameMain, flameSideL, flameSideR);
  group.add(flameGroup);

  // Iron Tripod + Suspended Tea Kettle with Spout & Handle
  for (let t = 0; t < 3; t++) {
    const ang = (t / 3) * Math.PI * 2 + 0.3;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.85, 6), ironMat);
    pole.position.set(Math.cos(ang) * 0.45, 0.85, Math.sin(ang) * 0.45);
    pole.lookAt(0, 1.75, 0);
    pole.rotateX(Math.PI / 2);
    group.add(pole);
  }
  const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), ironMat);
  kettle.scale.set(1.05, 0.82, 1.05);
  kettle.position.set(0, 1.08, 0);
  const kettleSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.18, 6), ironMat);
  kettleSpout.position.set(0.18, 1.12, 0);
  kettleSpout.rotation.z = -0.9;
  const kettleHandle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.015, 6, 12, Math.PI), ironMat);
  kettleHandle.position.set(0, 1.18, 0);
  group.add(kettle, kettleSpout, kettleHandle);

  const fireLight = new THREE.PointLight(0xff8833, 3.2, 16);
  fireLight.name = 'CampFireLight';
  fireLight.position.set(0, 0.88, 0);
  group.add(fireLight);

  // Sitting log bench with a steaming ceramic tea mug & folded map
  const bench = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.9, 10), logMat);
  bench.rotateZ(Math.PI / 2);
  bench.position.set(0, 0.2, -1.4);
  bench.castShadow = true;
  group.add(bench);

  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.048, 0.11, 10),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
  );
  mug.position.set(0.55, 0.45, -1.4);
  group.add(mug);

  // 2. Textured Canvas A-Frame Tent with Traveler Chest, Plaid Bedroll & Guy Stakes
  const tentGroup = new THREE.Group();
  tentGroup.position.set(2.85, 0, 0.4);
  tentGroup.rotation.y = -0.35;
  group.add(tentGroup);

  const poleFront = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.08, 8), logMat);
  poleFront.position.set(0, 1.04, 1.36);
  const poleBack = poleFront.clone();
  poleBack.position.z = -1.36;
  const ridgeBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.86, 8), logMat);
  ridgeBeam.rotation.x = Math.PI / 2;
  ridgeBeam.position.set(0, 2.02, 0);
  tentGroup.add(poleFront, poleBack, ridgeBeam);

  const panelGeo = new THREE.BoxGeometry(1.82, 0.06, 2.74);
  const sideL = new THREE.Mesh(panelGeo, canvasMat);
  sideL.position.set(0.69, 1.25, 0);
  sideL.rotation.z = -0.92;
  sideL.castShadow = true;
  sideL.receiveShadow = true;

  const sideR = new THREE.Mesh(panelGeo, canvasMat);
  sideR.position.set(-0.69, 1.25, 0);
  sideR.rotation.z = 0.92;
  sideR.castShadow = true;
  sideR.receiveShadow = true;
  tentGroup.add(sideL, sideR);

  const ridgeTrim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 2.78), trimMat);
  ridgeTrim.position.set(0, 2.03, 0);
  tentGroup.add(ridgeTrim);

  [
    [-1.32, -1.2], [1.32, -1.2],
    [-1.32, 1.2], [1.32, 1.2],
  ].forEach(([px, pz]) => {
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.015, 0.28, 6), logMat);
    peg.position.set(px, 0.1, pz);
    peg.rotation.z = px > 0 ? -0.35 : 0.35;
    tentGroup.add(peg);
  });

  const backPanel = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.98, 3), canvasMat);
  backPanel.position.set(0, 0.99, -1.33);
  backPanel.scale.set(1.0, 1.0, 0.08);
  tentGroup.add(backPanel);

  const floorMat = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.06, 2.58), trimMat);
  floorMat.position.set(0, 0.03, 0);
  floorMat.receiveShadow = true;
  tentGroup.add(floorMat);

  const sleepingBag = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.35, 6, 10), plaidMat);
  sleepingBag.rotation.x = Math.PI / 2;
  sleepingBag.scale.set(1.85, 0.42, 1.0);
  sleepingBag.position.set(0.22, 0.13, -0.15);
  tentGroup.add(sleepingBag);

  const pillow = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 6, 8), canvasMat);
  pillow.rotation.z = Math.PI / 2;
  pillow.scale.set(0.7, 1.0, 1.2);
  pillow.position.set(0.22, 0.21, -0.82);
  tentGroup.add(pillow);

  // Small wooden traveler's chest inside tent
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.32), chestWoodMat);
  chest.position.set(-0.6, 0.22, -0.75);
  const chestLock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.02), brassMat);
  chestLock.position.set(-0.6, 0.24, -0.585);
  tentGroup.add(chest, chestLock);

  [-1, 1].forEach((side) => {
    const flap = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.82, 8), trimMat);
    flap.position.set(side * 0.64, 0.96, 1.33);
    flap.rotation.z = side * 0.45;
    tentGroup.add(flap);
  });

  const tentLantern = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.24, 8), lanternMat);
  tentLantern.position.set(0, 1.75, 1.28);
  const tentLight = new THREE.PointLight(0xffcc66, 1.25, 6.5);
  tentLight.position.set(0, 1.65, 1.1);
  tentGroup.add(tentLantern, tentLight);

  return group;
}

export function createLonelyMountainModel(palette?: MaterialPalette): THREE.Group {
  const group = new THREE.Group();

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x4b515c,
    map: palette?.mountainRockTex,
    roughness: 0.92,
    flatShading: true,
  });
  const darkRockMat = new THREE.MeshStandardMaterial({
    color: 0x353a44,
    map: palette?.mountainRockTex,
    roughness: 0.95,
    flatShading: true,
  });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf4f8fc, roughness: 0.38, flatShading: true });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffb700,
    emissiveIntensity: 0.72,
    roughness: 0.2,
    metalness: 0.86,
  });

  const baseGeo = displaceVertices(new THREE.ConeGeometry(94, 188, 16, 4), 0.12, 0.045, true);
  const basePeak = new THREE.Mesh(baseGeo, rockMat);
  basePeak.position.set(0, 94, 0);
  group.add(basePeak);

  const snowGeo = displaceVertices(new THREE.ConeGeometry(41, 80, 16, 3), 0.1, 0.06, true);
  const snowCap = new THREE.Mesh(snowGeo, snowMat);
  snowCap.position.set(0, 148, 0);
  group.add(snowCap);

  [
    { x: -66, y: 62, z: -18, r: 58, h: 124 },
    { x: 62, y: 58, z: -22, r: 54, h: 116 },
    { x: -38, y: 46, z: 32, r: 34, h: 92 },
    { x: 40, y: 44, z: 30, r: 32, h: 88 },
  ].forEach((p) => {
    const spurGeo = displaceVertices(new THREE.ConeGeometry(p.r, p.h, 11, 3), 0.12, 0.05, true);
    const spur = new THREE.Mesh(spurGeo, darkRockMat);
    spur.position.set(p.x, p.y, p.z);
    group.add(spur);
    const spurSnow = new THREE.Mesh(new THREE.ConeGeometry(p.r * 0.42, p.h * 0.42, 11), snowMat);
    spurSnow.position.set(p.x, p.y + p.h * 0.3, p.z);
    group.add(spurSnow);
  });

  // Grand Stepped Dwarven Gate of Erebor (Extruded Trapezoid Portal + Kingly Sentinel Statues)
  const portalShape = new THREE.Shape();
  portalShape.moveTo(-15, 0);
  portalShape.lineTo(-12, 32);
  portalShape.lineTo(12, 32);
  portalShape.lineTo(15, 0);
  portalShape.closePath();
  const portalGeo = new THREE.ExtrudeGeometry(portalShape, {
    depth: 9,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 1.0,
    bevelThickness: 1.0,
  });
  const gateFrame = new THREE.Mesh(portalGeo, darkRockMat);
  gateFrame.position.set(0, 0, 52);
  group.add(gateFrame);

  const goldenDoor = new THREE.Mesh(new THREE.BoxGeometry(15, 22, 2), goldMat);
  goldenDoor.position.set(0, 11, 60.5);
  group.add(goldenDoor);

  // Carved Dwarven Sentinel Statues holding stone warhammers
  [-1, 1].forEach((side) => {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(7, 8, 7), rockMat);
    plinth.position.set(side * 15, 4, 61);
    const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 14, 4.5), rockMat);
    body.position.set(side * 15, 15, 61);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 4.5, 6), rockMat);
    crown.position.set(side * 15, 24, 61);
    const brazier = new THREE.Mesh(new THREE.OctahedronGeometry(2.1, 0), goldMat);
    brazier.position.set(side * 15, 28.5, 61);
    group.add(plinth, body, crown, brazier);
  });

  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(5.5, 0), goldMat);
  beacon.position.set(0, 190, 0);
  group.add(beacon);

  const beaconLight = new THREE.PointLight(0xffea75, 5.5, 210);
  beaconLight.position.set(0, 194, 0);
  group.add(beaconLight);

  return group;
}

export function createTree(type: 'apple' | 'willow' | 'pine', palette?: MaterialPalette): THREE.Group {
  const tree = new THREE.Group();

  const barkMat = new THREE.MeshStandardMaterial({
    color: type === 'willow' ? 0x4b433a : 0x5d3d28,
    map: palette?.barkTex,
    roughness: 0.88,
  });

  if (type === 'apple') {
    const foliageMat1 = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: palette?.appleFoliageTex,
      roughness: 0.68,
    });
    const foliageMat2 = new THREE.MeshStandardMaterial({
      color: 0xeaf7df,
      map: palette?.appleFoliageTex,
      roughness: 0.65,
    });
    const appleMat = new THREE.MeshPhysicalMaterial({ color: 0xe11d48, roughness: 0.22, clearcoat: 0.4 });
    const blossomMat = new THREE.MeshStandardMaterial({ color: 0xfce7f3, roughness: 0.5 });

    const trunkProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.48, 0.0),
      new THREE.Vector2(0.32, 0.45),
      new THREE.Vector2(0.25, 1.4),
      new THREE.Vector2(0.2, 2.2),
      new THREE.Vector2(0.0, 2.25),
    ];
    const trunk = new THREE.Mesh(new THREE.LatheGeometry(trunkProfile, 12), barkMat);
    trunk.castShadow = true;
    tree.add(trunk);

    [
      { x: 0.45, y: 2.0, z: 0.2, rz: -0.55, ry: 0.3 },
      { x: -0.42, y: 2.05, z: -0.25, rz: 0.52, ry: -0.4 },
      { x: 0.1, y: 2.0, z: 0.44, rz: 0.15, ry: 1.2 },
    ].forEach((b) => {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 1.15, 8), barkMat);
      branch.position.set(b.x, b.y, b.z);
      branch.rotation.set(0, b.ry, b.rz);
      tree.add(branch);
    });

    const clusters = [
      { x: 0, y: 3.15, z: 0, r: 1.38, mat: foliageMat1 },
      { x: 0.88, y: 2.75, z: 0.45, r: 0.96, mat: foliageMat2 },
      { x: -0.88, y: 2.8, z: -0.35, r: 0.94, mat: foliageMat2 },
      { x: 0.15, y: 2.85, z: -0.85, r: 0.9, mat: foliageMat1 },
      { x: -0.2, y: 2.8, z: 0.85, r: 0.92, mat: foliageMat2 },
    ];
    clusters.forEach((c) => {
      const puffGeo = displaceVertices(new THREE.IcosahedronGeometry(c.r, 1), 0.12, 2.5);
      const puff = new THREE.Mesh(puffGeo, c.mat);
      puff.position.set(c.x, c.y, c.z);
      puff.castShadow = true;
      tree.add(puff);
    });

    for (let i = 0; i < 8; i++) {
      const apple = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), appleMat);
      const angle = (i / 8) * Math.PI * 2;
      apple.position.set(Math.cos(angle) * 1.18, 2.35 + (i % 3) * 0.35, Math.sin(angle) * 1.18);
      tree.add(apple);

      if (i % 2 === 0) {
        const blossom = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08, 0), blossomMat);
        blossom.position.set(Math.cos(angle + 0.4) * 1.25, 2.95, Math.sin(angle + 0.4) * 1.25);
        tree.add(blossom);
      }
    }
  } else if (type === 'willow') {
    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: palette?.willowFoliageTex,
      roughness: 0.65,
    });
    const vineMat = new THREE.MeshStandardMaterial({
      color: 0xdff5ec,
      map: palette?.willowFoliageTex,
      roughness: 0.65,
    });

    const trunkProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.7, 0.0),
      new THREE.Vector2(0.45, 0.7),
      new THREE.Vector2(0.36, 2.2),
      new THREE.Vector2(0.3, 3.4),
      new THREE.Vector2(0.0, 3.45),
    ];
    const trunk = new THREE.Mesh(new THREE.LatheGeometry(trunkProfile, 12), barkMat);
    trunk.castShadow = true;
    tree.add(trunk);

    [
      { x: 0, y: 4.15, z: 0, sx: 1.45, sy: 0.75, sz: 1.45, r: 2.2 },
      { x: 0.9, y: 3.85, z: 0.6, sx: 1.1, sy: 0.7, sz: 1.1, r: 1.4 },
      { x: -0.9, y: 3.85, z: -0.5, sx: 1.1, sy: 0.7, sz: 1.1, r: 1.4 },
    ].forEach((c) => {
      const crownGeo = displaceVertices(new THREE.SphereGeometry(c.r, 14, 12), 0.1, 1.8);
      const crown = new THREE.Mesh(crownGeo, foliageMat);
      crown.position.set(c.x, c.y, c.z);
      crown.scale.set(c.sx, c.sy, c.sz);
      crown.castShadow = true;
      tree.add(crown);
    });

    // Curved drooping willow curtain branches
    for (let v = 0; v < 12; v++) {
      const ang = (v / 12) * Math.PI * 2;
      const rad = 1.65 + (v % 2) * 0.55;
      const vx = Math.cos(ang) * rad;
      const vz = Math.sin(ang) * rad;
      const vineCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(vx * 0.85, 3.65, vz * 0.85),
        new THREE.Vector3(vx * 1.05, 2.6, vz * 1.05),
        new THREE.Vector3(vx, 1.3 + (v % 3) * 0.22, vz),
      ]);
      const vine = new THREE.Mesh(new THREE.TubeGeometry(vineCurve, 6, 0.045, 5, false), vineMat);
      tree.add(vine);
    }

    const shroomMat = new THREE.MeshStandardMaterial({
      color: 0x5eead4,
      emissive: 0x14b8a6,
      emissiveIntensity: 0.85,
    });
    for (let m = 0; m < 2; m++) {
      const shroom = new THREE.Mesh(new THREE.CylinderGeometry(0.22 - m * 0.05, 0.05, 0.1, 8), shroomMat);
      shroom.position.set(0.42 * (m === 0 ? 1 : -0.8), 1.35 + m * 0.4, m * 0.25);
      shroom.rotation.z = m === 0 ? -Math.PI / 4 : Math.PI / 4;
      tree.add(shroom);
    }
  } else {
    const needleMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: palette?.pineFoliageTex,
      roughness: 0.72,
    });
    const snowDustMat = new THREE.MeshStandardMaterial({ color: 0xe6eff6, roughness: 0.52 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.4, 4.9, 10), barkMat);
    trunk.position.set(0, 2.45, 0);
    trunk.castShadow = true;
    tree.add(trunk);

    for (let c = 0; c < 6; c++) {
      const radius = 2.05 - c * 0.27;
      const height = 1.58 - c * 0.08;
      const coneGeo = displaceVertices(new THREE.ConeGeometry(radius, height, 11, 2), 0.1, 3.0, false);
      const cone = new THREE.Mesh(coneGeo, needleMat);
      cone.position.set(0, 2.2 + c * 0.82, 0);
      cone.rotation.y = c * 0.45;
      cone.castShadow = true;
      tree.add(cone);

      if (c >= 4) {
        const snowTip = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.52, height * 0.48, 11), snowDustMat);
        snowTip.position.set(0, 2.2 + c * 0.82 + height * 0.27, 0);
        snowTip.rotation.y = c * 0.45;
        tree.add(snowTip);
      }
    }
  }

  return tree;
}

// Stone & half-timbered Shire Cottage / Inn with pitched shingle roof, porch, glowing windows & chimney
export function createHobbitCottage(palette?: MaterialPalette, roofColorHex = 0x5c3c28): THREE.Group {
  const group = new THREE.Group();

  const plasterMat = new THREE.MeshStandardMaterial({ color: 0xf1e8d4, roughness: 0.85 });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x7b807a,
    map: palette?.stoneTex,
    roughness: 0.88,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x58361f,
    map: palette?.woodTex,
    roughness: 0.68,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColorHex,
    map: palette?.woodTex,
    roughness: 0.78,
  });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x4b7f38, roughness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xffe89e,
    emissive: 0xffb32c,
    emissiveIntensity: 0.95,
  });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.9 });

  // Cobblestone foundation base
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.65, 5.4), stoneMat);
  plinth.position.y = 0.325;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // Main timber-framed cottage walls
  const walls = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.8, 5.0), plasterMat);
  walls.position.y = 2.05;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  // Timber corner & cross beams
  [-3.18, 3.18].forEach((bx) => {
    [-2.48, 2.48].forEach((bz) => {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.85, 0.24), woodMat);
      col.position.set(bx, 2.05, bz);
      group.add(col);
    });
  });
  const beltBeam = new THREE.Mesh(new THREE.BoxGeometry(6.62, 0.2, 5.22), woodMat);
  beltBeam.position.y = 3.4;
  group.add(beltBeam);

  // Pitched A-frame Roof + mossy eaves
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-3.9, 0);
  roofShape.lineTo(0, 2.65);
  roofShape.lineTo(3.9, 0);
  roofShape.closePath();

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 5.9,
    bevelEnabled: false,
  });
  roofGeo.translate(0, 0, -2.95);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 3.45;
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  // Moss patches on roof
  [-1.6, 1.4].forEach((mx, idx) => {
    const moss = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), mossMat);
    moss.scale.set(1.4, 0.22, 1.8);
    moss.position.set(mx, 4.65 - idx * 0.2, idx === 0 ? 1.1 : -1.2);
    moss.rotation.z = mx > 0 ? -0.58 : 0.58;
    group.add(moss);
  });

  // Stone Chimney & Smoke
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.2, 0.95), stoneMat);
  chimney.position.set(2.1, 4.9, -1.1);
  chimney.castShadow = true;
  group.add(chimney);

  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.4,
    roughness: 1,
  });
  for (let s = 0; s < 3; s++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.28 + s * 0.12, 8, 8), smokeMat);
    puff.position.set(2.1 + s * 0.25, 6.8 + s * 0.65, -1.1 - s * 0.15);
    group.add(puff);
  }

  // Front Porch Canopy + Oak Door + Cobble Path
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 1.45), roofMat);
  porchRoof.position.set(0, 2.75, 3.05);
  porchRoof.rotation.x = 0.22;
  porchRoof.castShadow = true;
  group.add(porchRoof);

  [-1.0, 1.0].forEach((px) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.65, 8), woodMat);
    post.position.set(px, 1.325, 3.55);
    post.castShadow = true;
    group.add(post);
  });

  const frontDoor = new THREE.Mesh(new THREE.BoxGeometry(1.18, 2.05, 0.14), woodMat);
  frontDoor.position.set(0, 1.48, 2.52);
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), brassMat);
  handle.position.set(0.4, 1.42, 2.62);
  group.add(frontDoor, handle);

  // Glowing cottage windows (front & sides)
  [-1.95, 1.95].forEach((wx) => {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.0), glassMat);
    win.position.set(wx, 2.0, 2.52);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.15, 0.08), woodMat);
    frame.position.set(wx, 2.0, 2.49);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.14, 0.28), woodMat);
    sill.position.set(wx, 1.4, 2.58);
    group.add(frame, win, sill);
  });

  [-1, 1].forEach((side) => {
    const sideWin = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.95), glassMat);
    sideWin.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    sideWin.position.set(side * 3.22, 2.0, 0);
    group.add(sideWin);
  });

  // Glowing hanging porch lantern
  const porchLantern = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), glassMat);
  porchLantern.position.set(0.85, 2.35, 3.48);
  group.add(porchLantern);

  return optimizeStaticGroup(group);
}

// Village Stone Well with shingle gable roof, bucket & warm lantern
export function createVillageWell(palette?: MaterialPalette): THREE.Group {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x7b807a,
    map: palette?.stoneTex,
    roughness: 0.88,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x623b22,
    map: palette?.woodTex,
    roughness: 0.68,
  });
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x1d6f8a,
    roughness: 0.12,
    clearcoat: 0.9,
  });
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xffe484,
    emissive: 0xffaa22,
    emissiveIntensity: 1.8,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.45, 0.95, 16), stoneMat);
  base.position.y = 0.475;
  base.castShadow = true;
  base.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.26, 0.16, 10, 20), stoneMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.96;
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.12, 18), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.72;
  group.add(base, rim, water);

  [-1.08, 1.08].forEach((px) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 2.15, 8), woodMat);
    post.position.set(px, 1.85, 0);
    post.castShadow = true;
    group.add(post);
  });

  const windlass = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.35, 10), woodMat);
  windlass.rotation.z = Math.PI / 2;
  windlass.position.y = 1.92;
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.34, 10), woodMat);
  bucket.position.set(0.15, 1.32, 0);
  group.add(windlass, bucket);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.05, 4), woodMat);
  roof.position.y = 3.22;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), lanternMat);
  lantern.position.set(-0.92, 2.55, 0.25);
  group.add(lantern);

  return optimizeStaticGroup(group);
}

// Cozy Roadside / Village Lantern Post
export function createVillageLanternPost(palette?: MaterialPalette): THREE.Group {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x52341f,
    map: palette?.woodTex,
    roughness: 0.72,
  });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.85 });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffe484,
    emissive: 0xffaa22,
    emissiveIntensity: 2.2,
  });

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 3.25, 8), woodMat);
  post.position.y = 1.625;
  post.castShadow = true;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.08), ironMat);
  arm.position.set(0.32, 3.12, 0);
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.06), ironMat);
  brace.position.set(0.22, 2.86, 0);
  brace.rotation.z = 0.72;

  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.36, 6), glowMat);
  glass.position.set(0.62, 2.86, 0);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.18, 6), ironMat);
  cap.position.set(0.62, 3.1, 0);

  group.add(post, arm, brace, glass, cap);
  return optimizeStaticGroup(group);
}

// Hobbit Harvest Wagon loaded with hay bales & apple crates
export function createHobbitWagon(palette?: MaterialPalette): THREE.Group {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x6d4226,
    map: palette?.woodTex,
    roughness: 0.72,
  });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.8 });
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xd9a841, roughness: 0.92 });
  const appleMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35 });

  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 3.4), woodMat);
  bed.position.y = 0.76;
  bed.castShadow = true;
  group.add(bed);

  [-0.9, 0.9].forEach((sx) => {
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 3.4), woodMat);
    sideWall.position.set(sx, 1.15, 0);
    sideWall.castShadow = true;
    group.add(sideWall);
  });

  [
    { x: -1.04, z: -1.05 },
    { x: 1.04, z: -1.05 },
    { x: -1.04, z: 1.05 },
    { x: 1.04, z: 1.05 },
  ].forEach((w) => {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.065, 8, 16), woodMat);
    rim.rotation.y = Math.PI / 2;
    rim.position.set(w.x, 0.56, w.z);
    rim.castShadow = true;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 10), ironMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(w.x, 0.56, w.z);
    group.add(rim, hub);
  });

  // Golden hay bales + red apple crate
  const hay = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.72, 1.75), hayMat);
  hay.position.set(0, 1.22, -0.65);
  hay.castShadow = true;
  group.add(hay);

  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.48, 0.85), woodMat);
  crate.position.set(0.15, 1.1, 0.9);
  group.add(crate);

  for (let a = 0; a < 5; a++) {
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), appleMat);
    apple.position.set(-0.1 + (a % 3) * 0.22, 1.38, 0.72 + Math.floor(a / 3) * 0.28);
    group.add(apple);
  }

  // Hitch shafts
  [-0.45, 0.45].forEach((hx) => {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 6), woodMat);
    shaft.rotation.x = Math.PI / 2 + 0.15;
    shaft.position.set(hx, 0.58, 2.35);
    group.add(shaft);
  });

  return optimizeStaticGroup(group);
}

// Dense Forest Undergrowth & Thorny Thicket Bush (marks impassable woods)
export function createThicketBush(palette?: MaterialPalette): THREE.Group {
  const group = new THREE.Group();
  const bushMat = new THREE.MeshStandardMaterial({
    color: 0x224c28,
    map: palette?.willowFoliageTex,
    roughness: 0.88,
  });
  const darkBushMat = new THREE.MeshStandardMaterial({
    color: 0x1a3820,
    roughness: 0.9,
  });

  [
    { x: 0, y: 0.7, z: 0, r: 1.05, m: bushMat },
    { x: 0.72, y: 0.52, z: 0.42, r: 0.78, m: darkBushMat },
    { x: -0.68, y: 0.56, z: -0.36, r: 0.82, m: bushMat },
    { x: 0.25, y: 0.48, z: -0.68, r: 0.74, m: darkBushMat },
  ].forEach((p) => {
    const geo = displaceVertices(new THREE.IcosahedronGeometry(p.r, 1), 0.18, 2.8);
    const mesh = new THREE.Mesh(geo, p.m);
    mesh.position.set(p.x, p.y, p.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  return group;
}

// Wooden Stilt City of Dale / Esgaroth on the Long Lake (batched via optimizeStaticGroup for 60 FPS)
export function createDaleLakeCity(palette?: MaterialPalette): THREE.Group {
  const group = new THREE.Group();

  const darkWoodMat = new THREE.MeshStandardMaterial({
    color: 0x3f291a,
    map: palette?.woodTex,
    roughness: 0.85,
  });
  const plankWoodMat = new THREE.MeshStandardMaterial({
    color: 0x62422b,
    map: palette?.woodTex,
    roughness: 0.78,
  });
  const plasterMat = new THREE.MeshStandardMaterial({
    color: 0xdccbb0,
    roughness: 0.86,
  });
  const slateRoofMat = new THREE.MeshStandardMaterial({
    color: 0x33475b,
    map: palette?.stoneTex,
    roughness: 0.72,
  });
  const warmRoofMat = new THREE.MeshStandardMaterial({
    color: 0x763b28,
    map: palette?.woodTex,
    roughness: 0.76,
  });
  const tealRoofMat = new THREE.MeshStandardMaterial({
    color: 0x2b504a,
    map: palette?.woodTex,
    roughness: 0.76,
  });
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x6c7278,
    map: palette?.stoneTex,
    roughness: 0.9,
  });
  const glowWindowMat = new THREE.MeshStandardMaterial({
    color: 0xffe89e,
    emissive: 0xffa629,
    emissiveIntensity: 1.55,
    roughness: 0.2,
  });
  const goldAccentMat = new THREE.MeshStandardMaterial({
    color: 0xf5b942,
    emissive: 0x92400e,
    emissiveIntensity: 0.4,
    roughness: 0.28,
    metalness: 0.82,
  });
  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.35,
    roughness: 1.0,
  });

  // 1. Timber Boardwalk Platforms raised above lake level (+0.95) with underwater stilt pilings
  const platforms = [
    { x: 0, z: 0, w: 30, d: 36 },     // Central Great Hall Square
    { x: -1, z: -38, w: 25, d: 30 },  // North Merchant Quarter
    { x: 1, z: 38, w: 26, d: 30 },    // South Harbor Quarter
    { x: -13, z: -18, w: 10, d: 14 }, // Waterfront Fishermen Jetty
    { x: -13, z: 18, w: 10, d: 14 },  // Waterfront Dock Jetty
  ];

  platforms.forEach((p) => {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(p.w, 0.55, p.d), plankWoodMat);
    deck.position.set(p.x, 0.95, p.z);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);

    // Timber pilings extending deep into lakebed (-5.5 to +1.0)
    const stepX = 5.5;
    const stepZ = 6.0;
    for (let px = -p.w / 2 + 1.2; px <= p.w / 2 - 1.2; px += stepX) {
      for (let pz = -p.d / 2 + 1.2; pz <= p.d / 2 - 1.2; pz += stepZ) {
        const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 6.6, 6), darkWoodMat);
        piling.position.set(p.x + px, -2.3, p.z + pz);
        group.add(piling);
      }
    }
  });

  // 2. Arched Wooden Bridges connecting city islands & canals
  [
    { x: -2, z: -20.5, len: 9.0 },
    { x: 1, z: 20.5, len: 9.0 },
  ].forEach((br) => {
    const span = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.35, br.len), plankWoodMat);
    span.position.set(br.x, 1.55, br.z);
    span.castShadow = true;
    group.add(span);

    [-1.95, 1.95].forEach((rx) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, br.len), darkWoodMat);
      rail.position.set(br.x + rx, 2.05, br.z);
      group.add(rail);
    });
  });

  // Helper to build a Nordic / Middle-earth timber & stone stilt house
  const addDaleBuilding = (
    bx: number,
    bz: number,
    w: number,
    h: number,
    d: number,
    roofH: number,
    roofMat: THREE.Material,
    hasChimney = true,
    rotY = 0
  ) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(bx, 1.22, bz);
    bGroup.rotation.y = rotY;

    // Lower timber story
    const lowerH = h * 0.52;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, lowerH, d), darkWoodMat);
    lower.position.y = lowerH / 2;
    lower.castShadow = true;
    lower.receiveShadow = true;
    bGroup.add(lower);

    // Slightly overhanging upper plaster & half-timbered story
    const upperH = h * 0.48;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(w * 1.07, upperH, d * 1.07), plasterMat);
    upper.position.y = lowerH + upperH / 2;
    upper.castShadow = true;
    upper.receiveShadow = true;
    bGroup.add(upper);

    // Timber corner posts & floor belt beam
    const belt = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, 0.25, d * 1.1), darkWoodMat);
    belt.position.y = lowerH;
    bGroup.add(belt);

    // Steep pitched roof
    const rShape = new THREE.Shape();
    rShape.moveTo(-w * 0.62, 0);
    rShape.lineTo(0, roofH);
    rShape.lineTo(w * 0.62, 0);
    rShape.closePath();
    const rGeo = new THREE.ExtrudeGeometry(rShape, { depth: d * 1.18, bevelEnabled: false });
    rGeo.translate(0, 0, -(d * 1.18) / 2);
    const roof = new THREE.Mesh(rGeo, roofMat);
    roof.position.y = h;
    roof.castShadow = true;
    roof.receiveShadow = true;
    bGroup.add(roof);

    // Glowing windows on both +X/-X (lakeside road view!) and +/-Z faces
    [-1, 1].forEach((side) => {
      const winCount = Math.max(1, Math.floor(d / 3.2));
      for (let wi = 0; wi < winCount; wi++) {
        const wz = (wi - (winCount - 1) / 2) * 2.4;
        const winLow = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.95), glowWindowMat);
        winLow.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        winLow.position.set(side * (w / 2 + 0.03), lowerH * 0.55, wz);
        bGroup.add(winLow);

        const winUp = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.05), glowWindowMat);
        winUp.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        winUp.position.set(side * ((w * 1.07) / 2 + 0.03), lowerH + upperH * 0.52, wz);
        bGroup.add(winUp);
      }
    });

    [-1, 1].forEach((end) => {
      const endWin = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.1), glowWindowMat);
      endWin.rotation.y = end > 0 ? 0 : Math.PI;
      endWin.position.set(0, lowerH + upperH * 0.52, end * ((d * 1.07) / 2 + 0.03));
      bGroup.add(endWin);
    });

    if (hasChimney) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.75, roofH + 1.6, 0.75), stoneMat);
      ch.position.set(w * 0.25, h + roofH * 0.45, d * 0.2);
      bGroup.add(ch);
      for (let s = 0; s < 2; s++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.32 + s * 0.14, 7, 6), smokeMat);
        puff.position.set(w * 0.25 + s * 0.2, h + roofH + 1.4 + s * 0.7, d * 0.2);
        bGroup.add(puff);
      }
    }

    group.add(bGroup);
  };

  // 3. Populate Dale Town Districts (20 varied buildings facing waterfront & road)
  const cityBuildings: Array<[number, number, number, number, number, number, THREE.Material, boolean, number]> = [
    // Central Square around Great Hall
    [-8, -10, 4.8, 5.4, 6.2, 3.6, slateRoofMat, true, 0],
    [-8, 9, 4.6, 5.0, 5.8, 3.4, warmRoofMat, true, 0],
    [7, -11, 5.4, 6.2, 6.8, 4.0, tealRoofMat, true, 0],
    [8, 10, 5.2, 5.8, 6.4, 3.8, slateRoofMat, true, 0],
    [10, 0, 5.0, 6.5, 7.2, 4.2, warmRoofMat, true, 0],
    // North Quarter
    [-7, -30, 4.4, 4.8, 5.6, 3.2, warmRoofMat, true, 0.15],
    [-6, -44, 5.0, 5.6, 6.4, 3.6, slateRoofMat, false, -0.1],
    [5, -31, 5.2, 5.5, 6.6, 3.8, slateRoofMat, true, 0],
    [5, -45, 4.8, 6.0, 6.0, 3.5, tealRoofMat, true, 0.2],
    [-1, -38, 4.2, 4.4, 4.8, 3.0, warmRoofMat, false, Math.PI / 2],
    // South Harbor Quarter
    [-7, 30, 4.5, 5.0, 5.8, 3.4, tealRoofMat, true, -0.12],
    [-6, 44, 5.2, 5.8, 6.5, 3.8, warmRoofMat, true, 0.1],
    [6, 31, 5.0, 5.4, 6.2, 3.5, slateRoofMat, true, 0],
    [6, 45, 4.8, 6.2, 6.0, 3.8, warmRoofMat, false, -0.15],
    [0, 38, 4.2, 4.6, 5.0, 3.1, slateRoofMat, true, Math.PI / 2],
    // Waterfront Jetties
    [-13.5, -18, 3.8, 3.8, 4.5, 2.8, slateRoofMat, false, 0],
    [-13.5, 18, 3.8, 4.0, 4.6, 2.8, warmRoofMat, true, 0],
  ];

  cityBuildings.forEach((b) => addDaleBuilding(...b));

  // 4. Grand Master Hall & Bell Tower in the center (visible from far along the road!)
  const hallBase = new THREE.Mesh(new THREE.BoxGeometry(7.2, 2.4, 9.6), stoneMat);
  hallBase.position.set(-1.0, 2.4, 0);
  hallBase.castShadow = true;
  group.add(hallBase);

  const hallBody = new THREE.Mesh(new THREE.BoxGeometry(6.8, 5.8, 9.2), plasterMat);
  hallBody.position.set(-1.0, 6.5, 0);
  hallBody.castShadow = true;
  group.add(hallBody);

  const hallRoofShape = new THREE.Shape();
  hallRoofShape.moveTo(-4.3, 0);
  hallRoofShape.lineTo(0, 4.8);
  hallRoofShape.lineTo(4.3, 0);
  hallRoofShape.closePath();
  const hallRoofGeo = new THREE.ExtrudeGeometry(hallRoofShape, { depth: 10.4, bevelEnabled: false });
  hallRoofGeo.translate(0, 0, -5.2);
  const hallRoof = new THREE.Mesh(hallRoofGeo, slateRoofMat);
  hallRoof.position.set(-1.0, 9.4, 0);
  hallRoof.castShadow = true;
  group.add(hallRoof);

  // Bell / Watch Tower rising above the Great Hall
  const towerShaft = new THREE.Mesh(new THREE.BoxGeometry(3.8, 13.5, 3.8), darkWoodMat);
  towerShaft.position.set(-1.0, 8.0, 0);
  towerShaft.castShadow = true;
  group.add(towerShaft);

  const belfryGlow = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 2.8), glowWindowMat);
  belfryGlow.position.set(-1.0, 15.6, 0);
  group.add(belfryGlow);

  const towerSpire = new THREE.Mesh(new THREE.ConeGeometry(3.1, 5.5, 4), slateRoofMat);
  towerSpire.rotation.y = Math.PI / 4;
  towerSpire.position.set(-1.0, 19.3, 0);
  towerSpire.castShadow = true;
  group.add(towerSpire);

  const spireFinial = new THREE.Mesh(new THREE.OctahedronGeometry(0.65, 0), goldAccentMat);
  spireFinial.position.set(-1.0, 22.3, 0);
  group.add(spireFinial);

  // Great Hall side glowing arch windows
  [-2.6, 0, 2.6].forEach((wz) => {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), glowWindowMat);
    win.rotation.y = -Math.PI / 2;
    win.position.set(-4.45, 6.2, wz);
    group.add(win);
  });

  // 5. Harbor Lantern Posts along the waterfront decks
  [
    { x: -14.2, z: -12.5 },
    { x: -14.2, z: 0 },
    { x: -14.2, z: 12.5 },
    { x: -12.2, z: -36 },
    { x: -12.2, z: 36 },
  ].forEach((lp) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 3.2, 6), darkWoodMat);
    post.position.set(lp.x, 2.8, lp.z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), glowWindowMat);
    lamp.position.set(lp.x, 4.5, lp.z);
    group.add(post, lamp);
  });

  // 6. Moored Wooden River Boats & Barges floating beside Dale piers (local y = 0)
  [
    { x: -19.2, z: -16, rot: 0.12, scale: 1.15 },
    { x: -18.8, z: 16, rot: -0.22, scale: 1.0 },
    { x: -16.8, z: -34, rot: 0.35, scale: 0.95 },
    { x: -16.6, z: 35, rot: -0.18, scale: 1.1 },
    { x: -9.0, z: -20.5, rot: Math.PI / 2 + 0.1, scale: 0.85 },
  ].forEach((bt) => {
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.65 * bt.scale, 1.05 * bt.scale, 4.4 * bt.scale, 7), plankWoodMat);
    hull.rotation.x = Math.PI / 2;
    hull.scale.set(0.75, 1, 0.45);
    hull.position.set(bt.x, 0.08, bt.z);
    hull.rotation.y = bt.rot;
    hull.castShadow = true;

    const bowMast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6 * bt.scale, 6), darkWoodMat);
    bowMast.position.set(bt.x, 1.35 * bt.scale, bt.z);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), glowWindowMat);
    lantern.position.set(bt.x, 2.4 * bt.scale, bt.z);
    group.add(hull, bowMast, lantern);
  });

  // Warm ambient PointLights so Dale casts golden light across the dark lake at night
  const centerLight = new THREE.PointLight(0xffb44c, 4.2, 68);
  centerLight.position.set(-10, 8, 0);
  const northLight = new THREE.PointLight(0xffaa3c, 3.2, 54);
  northLight.position.set(-8, 6, -34);
  const southLight = new THREE.PointLight(0xffaa3c, 3.2, 54);
  southLight.position.set(-8, 6, 34);
  group.add(centerLight, northLight, southLight);

  return optimizeStaticGroup(group);
}

// Scenic Lakeshore Harbor Viewing Pier (projects out from western shore road toward Dale)
export function createLakeshorePier(palette?: MaterialPalette): THREE.Group {
  const group = new THREE.Group();
  const darkWoodMat = new THREE.MeshStandardMaterial({
    color: 0x452b19,
    map: palette?.woodTex,
    roughness: 0.82,
  });
  const plankMat = new THREE.MeshStandardMaterial({
    color: 0x6b472d,
    map: palette?.woodTex,
    roughness: 0.75,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xffe484,
    emissive: 0xffaa22,
    emissiveIntensity: 2.0,
  });

  // Pier deck at local y = 0 (placed flush with shore road at y = 18.0)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.35, 3.8), plankMat);
  deck.position.set(4.5, 0, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  // Pilings sinking down below water (local y = -6.5 to +1.0)
  [1.2, 4.5, 8.2].forEach((px) => {
    [-1.65, 1.65].forEach((pz) => {
      const piling = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7.2, 7), darkWoodMat);
      piling.position.set(px, -2.5, pz);
      piling.castShadow = true;
      group.add(piling);
    });
  });

  // Side railings + end barrier rail
  [-1.65, 1.65].forEach((pz) => {
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.14, 0.14), darkWoodMat);
    topRail.position.set(4.6, 0.95, pz);
    group.add(topRail);
  });
  const endRail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 3.5), darkWoodMat);
  endRail.position.set(8.2, 0.95, 0);
  group.add(endRail);

  // Glowing pier lantern at water tip
  const lanternPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 7), darkWoodMat);
  lanternPost.position.set(8.2, 1.8, -1.65);
  const lanternBulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), glowMat);
  lanternBulb.position.set(8.2, 3.05, -1.65);
  group.add(lanternPost, lanternBulb);

  // Moored wooden boat floating beside the pier (y = -2.0 corresponds to lake surface 16.0!)
  const boatHull = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.85, 3.4, 7), plankMat);
  boatHull.rotation.x = Math.PI / 2;
  boatHull.scale.set(0.85, 1, 0.48);
  boatHull.position.set(6.8, -1.9, 2.8);
  boatHull.rotation.y = 0.25;
  group.add(boatHull);

  return optimizeStaticGroup(group);
}

