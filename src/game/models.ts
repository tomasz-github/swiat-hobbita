import * as THREE from 'three';
import { HorseProfile, RiderProfile } from './types';
import { MaterialPalette } from './materials';

export interface HorseRig {
  group: THREE.Group;
  horseMeshGroup: THREE.Group;
  headNeckGroup: THREE.Group;
  headGroup: THREE.Group;
  maneGroup: THREE.Group;
  tailGroup: THREE.Group;
  tailJoint: THREE.Group;
  // Articulated legs: [frontLeft, frontRight, rearLeft, rearRight]
  legFL: { upper: THREE.Group; lower: THREE.Group; hoof: THREE.Mesh };
  legFR: { upper: THREE.Group; lower: THREE.Group; hoof: THREE.Mesh };
  legRL: { upper: THREE.Group; lower: THREE.Group; hoof: THREE.Mesh };
  legRR: { upper: THREE.Group; lower: THREE.Group; hoof: THREE.Mesh };
  // Rider parts
  riderGroup: THREE.Group;
  riderTorso: THREE.Group;
  riderHead: THREE.Group;
  riderArmL: THREE.Group;
  riderArmR: THREE.Group;
  starBrooch: THREE.Mesh;
  starLight: THREE.PointLight;
}

// Helper: build a smooth tapered, elliptically cross-sectioned tube along a 3D curve
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
    // Keep lateral axis cleanly aligned with world X for symmetrical equine neck
    N.set(1, 0, 0);
    B.crossVectors(frames.tangents[i], N).normalize();

    const rx = radiusXFn(t);
    const ry = radiusYFn(t);

    for (let j = 0; j <= radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      // Slight crest ridge along top of neck (sin > 0)
      const crestBoost = sin > 0 ? Math.pow(sin, 2) * 0.18 * ry * (1 - t * 0.35) : 0;

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

// Helper: create a soft radial contact shadow disc (zero Z-fighting, prevents floating look)
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

// Shared detailed Rider builder helper for both Mounted and Dismounted states
function buildStylizedRiderHead(
  hairMat: THREE.Material,
  skinMat: THREE.Material,
  eyeIrisColor: number
): THREE.Group {
  const head = new THREE.Group();

  // Slightly oval sculpted cranium/face
  const faceGeo = new THREE.SphereGeometry(0.168, 22, 18);
  faceGeo.scale(0.92, 1.06, 0.96);
  const face = new THREE.Mesh(faceGeo, skinMat);
  face.castShadow = true;
  head.add(face);

  // Cute sculpted nose
  const noseGeo = new THREE.ConeGeometry(0.024, 0.055, 8);
  noseGeo.rotateX(Math.PI * 0.38);
  const nose = new THREE.Mesh(noseGeo, skinMat);
  nose.position.set(0, -0.008, 0.165);
  head.add(nose);

  // Soft rosy cheeks
  const cheekMat = new THREE.MeshStandardMaterial({ color: 0xf4979c, roughness: 0.75 });
  const cheekGeo = new THREE.SphereGeometry(0.032, 10, 10);
  cheekGeo.scale(1.2, 0.75, 0.5);
  const cheekL = new THREE.Mesh(cheekGeo, cheekMat);
  cheekL.position.set(0.085, -0.025, 0.132);
  const cheekR = cheekL.clone();
  cheekR.position.x = -0.085;
  head.add(cheekL, cheekR);

  // Gentle warm smile
  const lipMat = new THREE.MeshStandardMaterial({ color: 0xd96b78, roughness: 0.5 });
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.007, 6, 12, Math.PI), lipMat);
  lip.rotation.z = Math.PI;
  lip.position.set(0, -0.058, 0.15);
  head.add(lip);

  // Expressive eyes (sclera + iris + pupil + highlight + eyebrow)
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.2 });
  const irisMat = new THREE.MeshStandardMaterial({ color: eyeIrisColor, roughness: 0.18 });
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

  // Layered hair cap
  const hairCrown = new THREE.Mesh(
    new THREE.SphereGeometry(0.182, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.66),
    hairMat
  );
  hairCrown.scale.set(0.98, 1.06, 1.02);
  hairCrown.position.set(0, 0.032, -0.018);
  hairCrown.castShadow = true;
  head.add(hairCrown);

  // Soft side-swept bangs framing forehead
  const bangGeo = new THREE.SphereGeometry(0.09, 12, 10);
  bangGeo.scale(1.15, 0.55, 0.65);
  const bangL = new THREE.Mesh(bangGeo, hairMat);
  bangL.position.set(0.085, 0.115, 0.105);
  bangL.rotation.set(0.3, 0.25, -0.45);
  const bangR = new THREE.Mesh(bangGeo, hairMat);
  bangR.position.set(-0.085, 0.115, 0.105);
  bangR.rotation.set(0.3, -0.25, 0.45);
  head.add(bangL, bangR);

  // Side locks behind ears
  const lockGeo = new THREE.CapsuleGeometry(0.034, 0.16, 4, 10);
  const lockL = new THREE.Mesh(lockGeo, hairMat);
  lockL.position.set(0.145, -0.05, 0.02);
  lockL.rotation.z = 0.12;
  const lockR = lockL.clone();
  lockR.position.x = -0.145;
  lockR.rotation.z = -0.12;
  head.add(lockL, lockR);

  // Flowing multi-segment braided ponytail with golden ribbon tie
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

  // Ground contact shadow directly beneath horse
  horseGroup.add(createContactShadow(0.85, 1.45, 0.34));

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
    roughness: 0.42,
    metalness: 0.08,
    clearcoat: 0.25,
    clearcoatRoughness: 0.4,
  });
  const horseshoeMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.22,
    metalness: 0.88,
  });
  const leatherMat = new THREE.MeshPhysicalMaterial({
    color: 0x422313,
    roughness: 0.38,
    metalness: 0.08,
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,
  });
  const darkLeatherMat = new THREE.MeshPhysicalMaterial({
    color: 0x26140b,
    roughness: 0.44,
    metalness: 0.06,
  });
  const silverMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.18,
    metalness: 0.92,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.22,
    metalness: 0.88,
  });

  // -------------------------------------------------------------
  // 1. SCULPTED EQUINE BODY (Lathe profile + muscle contours)
  // -------------------------------------------------------------
  // Profile along Z (from tail dock -1.16 to chest front +1.05), rotated to Z axis
  const torsoProfile = [
    new THREE.Vector2(0.0, -1.18),
    new THREE.Vector2(0.24, -1.14),
    new THREE.Vector2(0.45, -0.96),
    new THREE.Vector2(0.55, -0.68), // Muscular hindquarters
    new THREE.Vector2(0.51, -0.34), // Flank / loin taper
    new THREE.Vector2(0.52, 0.0),   // Mid-barrel
    new THREE.Vector2(0.56, 0.36),  // Deep heart girth / ribcage
    new THREE.Vector2(0.55, 0.68),  // Chest / shoulder base
    new THREE.Vector2(0.42, 0.92),  // Chest breastbone
    new THREE.Vector2(0.18, 1.06),
    new THREE.Vector2(0.0, 1.1),
  ];
  const barrelGeo = new THREE.LatheGeometry(torsoProfile, 28);
  barrelGeo.rotateX(Math.PI / 2);
  // Sleek warmblood proportions: slightly narrower side-to-side, deeper vertically
  barrelGeo.scale(0.82, 1.04, 1.0);
  const barrel = new THREE.Mesh(barrelGeo, coatMat);
  barrel.position.set(0, 1.46, -0.02);
  barrel.castShadow = true;
  barrel.receiveShadow = true;
  horseGroup.add(barrel);

  // Subtle Withers ridge where neck meets back
  const withersGeo = new THREE.SphereGeometry(0.32, 18, 14);
  withersGeo.scale(0.75, 0.85, 1.35);
  const withers = new THREE.Mesh(withersGeo, coatMat);
  withers.position.set(0, 1.84, 0.45);
  withers.castShadow = true;
  horseGroup.add(withers);

  // Sculpted pectoral chest muscles & shoulder blades
  const pectoralGeo = new THREE.SphereGeometry(0.34, 16, 14);
  pectoralGeo.scale(0.95, 1.05, 0.95);
  const chest = new THREE.Mesh(pectoralGeo, coatMat);
  chest.position.set(0, 1.42, 0.78);
  chest.castShadow = true;
  horseGroup.add(chest);

  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), coatMat);
    shoulder.scale.set(0.58, 1.22, 0.92);
    shoulder.position.set(side * 0.28, 1.46, 0.58);
    shoulder.rotation.x = 0.25;
    shoulder.castShadow = true;
    horseGroup.add(shoulder);

    // Muscular hindquarters / croup cheek
    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 14), coatMat);
    haunch.scale.set(0.62, 1.18, 1.05);
    haunch.position.set(side * 0.26, 1.48, -0.72);
    haunch.castShadow = true;
    horseGroup.add(haunch);
  });

  // -------------------------------------------------------------
  // 2. ARCHED EQUINE NECK, FLOWING MANE & SCULPTED HEAD
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
    20,
    20,
    (t) => THREE.MathUtils.lerp(0.25, 0.135, t),
    (t) => THREE.MathUtils.lerp(0.35, 0.175, t)
  );
  const neck = new THREE.Mesh(neckGeo, coatMat);
  neck.castShadow = true;
  neck.receiveShadow = true;
  headNeckGroup.add(neck);

  // Flowing, wavy multi-strand mane along right side of crest
  const maneGroup = new THREE.Group();
  headNeckGroup.add(maneGroup);

  for (let i = 0; i < 11; i++) {
    const t = 0.08 + (i / 10) * 0.84;
    const basePt = neckCurve.getPointAt(t);
    const lockLen = 0.34 + Math.sin(t * Math.PI) * 0.22;
    const strandCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, basePt.y + 0.14 - t * 0.04, basePt.z - 0.03),
      new THREE.Vector3(-0.11 - (i % 2) * 0.03, basePt.y + 0.02, basePt.z - 0.04),
      new THREE.Vector3(-0.17 - Math.sin(i * 1.1) * 0.035, basePt.y - lockLen * 0.65, basePt.z - 0.09),
      new THREE.Vector3(-0.14, basePt.y - lockLen, basePt.z - 0.14),
    ]);
    const strandGeo = new THREE.TubeGeometry(strandCurve, 10, 0.052 - Math.abs(t - 0.5) * 0.02, 7, false);
    const strand = new THREE.Mesh(strandGeo, maneMat);
    strand.castShadow = true;
    maneGroup.add(strand);
  }

  // Head group (pivots cleanly at the poll)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.86, 0.48);
  headGroup.rotation.x = 0.48; // Refined natural head carriage (~28° downward)
  headNeckGroup.add(headGroup);

  // Sculpted Cranium & Forehead
  const craniumGeo = new THREE.SphereGeometry(0.185, 22, 18);
  craniumGeo.scale(0.88, 0.96, 1.16);
  const cranium = new THREE.Mesh(craniumGeo, coatMat);
  cranium.position.set(0, 0.03, 0.08);
  cranium.castShadow = true;
  headGroup.add(cranium);

  // Cheekbones / Jowls (gives graceful equine jaw curve)
  [-1, 1].forEach((side) => {
    const jowl = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), coatMat);
    jowl.scale.set(0.68, 0.95, 1.18);
    jowl.position.set(side * 0.095, -0.065, 0.04);
    jowl.castShadow = true;
    headGroup.add(jowl);
  });

  // Tapered Nasal Bridge (smooth cone-cylinder, ZERO boxy cubes!)
  const bridgeGeo = new THREE.CylinderGeometry(0.092, 0.145, 0.42, 22);
  bridgeGeo.rotateX(Math.PI / 2);
  bridgeGeo.scale(0.86, 0.96, 1.0);
  const bridge = new THREE.Mesh(bridgeGeo, coatMat);
  bridge.position.set(0, -0.025, 0.31);
  bridge.rotation.x = 0.12;
  bridge.castShadow = true;
  headGroup.add(bridge);

  // Soft Velvet Muzzle & Chin
  const muzzleGeo = new THREE.SphereGeometry(0.106, 18, 16);
  muzzleGeo.scale(0.9, 0.84, 1.08);
  const muzzle = new THREE.Mesh(muzzleGeo, muzzleMat);
  muzzle.position.set(0, -0.068, 0.52);
  muzzle.castShadow = true;
  headGroup.add(muzzle);

  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), muzzleMat);
  chin.scale.set(0.9, 0.72, 1.0);
  chin.position.set(0, -0.125, 0.46);
  headGroup.add(chin);

  // Sculpted Flared Nostrils
  const nostrilInnerMat = new THREE.MeshStandardMaterial({ color: 0x1a1012, roughness: 0.9 });
  [-1, 1].forEach((side) => {
    const nostrilRing = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.01, 8, 12), muzzleMat);
    nostrilRing.position.set(side * 0.066, -0.056, 0.56);
    nostrilRing.rotation.y = side * 0.65;
    headGroup.add(nostrilRing);

    const nostrilHole = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), nostrilInnerMat);
    nostrilHole.position.set(side * 0.062, -0.058, 0.555);
    headGroup.add(nostrilHole);
  });

  // Facial White Blaze / Star marking down the forehead and nose
  const starGeo = new THREE.SphereGeometry(0.055, 12, 10);
  starGeo.scale(0.85, 1.35, 0.25);
  const foreheadStar = new THREE.Mesh(starGeo, whiteMarkingMat);
  foreheadStar.position.set(0, 0.095, 0.235);
  foreheadStar.rotation.x = -0.35;
  headGroup.add(foreheadStar);

  const blazeGeo = new THREE.CapsuleGeometry(0.025, 0.24, 4, 10);
  blazeGeo.rotateX(Math.PI / 2);
  blazeGeo.scale(0.95, 0.35, 1.0);
  const blaze = new THREE.Mesh(blazeGeo, whiteMarkingMat);
  blaze.position.set(0, 0.052, 0.37);
  blaze.rotation.x = 0.2;
  headGroup.add(blaze);

  // Expressive Horse Eyes with iris, glossy cornea & catchlight + eyelid ridge
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x3b2110, roughness: 0.2 });
  const pupilMat = new THREE.MeshPhysicalMaterial({
    color: 0x09080a,
    roughness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const catchMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  [-1, 1].forEach((side) => {
    const eyePivot = new THREE.Group();
    eyePivot.position.set(side * 0.132, 0.068, 0.165);
    eyePivot.rotation.y = side * 0.72;

    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.044, 14, 12), irisMat);
    sclera.scale.set(1.0, 0.88, 0.72);
    eyePivot.add(sclera);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.033, 12, 10), pupilMat);
    pupil.position.set(0, 0, 0.015);
    pupil.scale.set(0.95, 0.85, 0.68);
    eyePivot.add(pupil);

    const catchlight = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 6), catchMat);
    catchlight.position.set(side * 0.008, 0.012, 0.036);
    eyePivot.add(catchlight);

    // Sculpted upper eyelid brow
    const eyelid = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.011, 6, 12, Math.PI), coatMat);
    eyelid.position.set(0, 0.008, 0.01);
    eyelid.rotation.x = -0.35;
    eyePivot.add(eyelid);

    headGroup.add(eyePivot);
  });

  // Sculpted Alert Ears (outer curved shell + soft pink-cream inner recess)
  const earInnerMat = new THREE.MeshStandardMaterial({ color: 0xd8b4ac, roughness: 0.7 });
  const earOuterProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.062, 0.02),
    new THREE.Vector2(0.068, 0.09),
    new THREE.Vector2(0.048, 0.18),
    new THREE.Vector2(0.018, 0.25),
    new THREE.Vector2(0.0, 0.27),
  ];
  const earOuterGeo = new THREE.LatheGeometry(earOuterProfile, 14);
  earOuterGeo.scale(0.85, 1.0, 0.65);

  [-1, 1].forEach((side) => {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.105, 0.18, -0.02);
    earGroup.rotation.set(0.18, side * 0.22, side * -0.18);

    const earOuter = new THREE.Mesh(earOuterGeo, coatMat);
    earOuter.castShadow = true;
    earGroup.add(earOuter);

    const earInner = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.18, 10), earInnerMat);
    earInner.scale.set(0.9, 1.0, 0.35);
    earInner.position.set(0, 0.12, 0.025);
    earGroup.add(earInner);

    headGroup.add(earGroup);
  });

  // Sweeping Wavy Forelock between the ears
  const forelockCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.21, 0.04),
    new THREE.Vector3(0.02, 0.22, 0.15),
    new THREE.Vector3(0.035, 0.12, 0.255),
    new THREE.Vector3(0.015, 0.01, 0.27),
  ]);
  const forelock = new THREE.Mesh(new THREE.TubeGeometry(forelockCurve, 10, 0.045, 8, false), maneMat);
  forelock.castShadow = true;
  headGroup.add(forelock);

  // Detailed Bridle (Crownpiece, Browband + Elven Star, Cheekpieces, Noseband, Snaffle Bit Rings)
  const browbandCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.155, 0.12, 0.08),
    new THREE.Vector3(0, 0.15, 0.235),
    new THREE.Vector3(0.155, 0.12, 0.08),
  ]);
  const browband = new THREE.Mesh(new THREE.TubeGeometry(browbandCurve, 14, 0.014, 8, false), leatherMat);
  headGroup.add(browband);

  // Crownpiece behind ears
  const crownCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.155, 0.12, 0.08),
    new THREE.Vector3(-0.13, 0.19, -0.06),
    new THREE.Vector3(0, 0.21, -0.09),
    new THREE.Vector3(0.13, 0.19, -0.06),
    new THREE.Vector3(0.155, 0.12, 0.08),
  ]);
  headGroup.add(new THREE.Mesh(new THREE.TubeGeometry(crownCurve, 14, 0.013, 6, false), leatherMat));

  // Silver & Cyan Star Medallion on browband
  const gemMat = new THREE.MeshStandardMaterial({
    color: 0x99f6ff,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.7,
    roughness: 0.1,
    metalness: 0.85,
  });
  const starMedallion = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.015, 8), silverMat);
  starMedallion.rotation.x = Math.PI / 2 - 0.35;
  starMedallion.position.set(0, 0.145, 0.242);
  headGroup.add(starMedallion);

  const browGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), gemMat);
  browGem.position.set(0, 0.148, 0.252);
  headGroup.add(browGem);

  // Noseband (Cavesson) wrapping around muzzle
  const noseband = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.013, 8, 22), leatherMat);
  noseband.scale.set(0.86, 1.02, 1.0);
  noseband.position.set(0, -0.042, 0.38);
  noseband.rotation.x = 0.12;
  headGroup.add(noseband);

  // Cheekpieces + Silver Bit Rings
  [-1, 1].forEach((side) => {
    const cheekCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.15, 0.12, 0.08),
      new THREE.Vector3(side * 0.135, 0.01, 0.27),
      new THREE.Vector3(side * 0.105, -0.085, 0.45),
    ]);
    headGroup.add(new THREE.Mesh(new THREE.TubeGeometry(cheekCurve, 10, 0.011, 6, false), leatherMat));

    const bitRing = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 8, 14), silverMat);
    bitRing.rotation.y = Math.PI / 2;
    bitRing.position.set(side * 0.102, -0.095, 0.455);
    headGroup.add(bitRing);
  });

  // Curved Leather Reins stretching back toward rider's hands
  [-1, 1].forEach((side) => {
    const reinCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.105, -0.098, 0.45),
      new THREE.Vector3(side * 0.22, -0.25, 0.15),
      new THREE.Vector3(side * 0.25, -0.35, -0.35),
      new THREE.Vector3(side * 0.18, -0.22, -0.68),
    ]);
    const rein = new THREE.Mesh(new THREE.TubeGeometry(reinCurve, 16, 0.009, 6, false), darkLeatherMat);
    headGroup.add(rein);
  });

  // -------------------------------------------------------------
  // 3. FLOWING MULTI-STRAND TAIL
  // -------------------------------------------------------------
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.72, -1.12);
  horseGroup.add(tailGroup);

  const tailJoint = new THREE.Group();
  tailGroup.add(tailJoint);

  // Docked tailbone arch
  const dockCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.05),
    new THREE.Vector3(0, -0.05, -0.14),
    new THREE.Vector3(0, -0.24, -0.24),
  ]);
  const dock = new THREE.Mesh(new THREE.TubeGeometry(dockCurve, 8, 0.085, 10, false), maneMat);
  dock.castShadow = true;
  tailJoint.add(dock);

  // Lush layered hair strands draping from tailbone
  const tailOffsets = [
    { x: 0, z: -0.02, r: 0.11, len: 1.18 },
    { x: 0.06, z: 0.02, r: 0.085, len: 1.08 },
    { x: -0.06, z: 0.02, r: 0.085, len: 1.08 },
    { x: 0, z: -0.07, r: 0.09, len: 1.24 },
  ];
  tailOffsets.forEach((off, idx) => {
    const strandCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(off.x * 0.4, -0.1, -0.14),
      new THREE.Vector3(off.x, -0.45, -0.28 + off.z),
      new THREE.Vector3(off.x * 1.3, -0.82, -0.33 + off.z + (idx % 2) * 0.03),
      new THREE.Vector3(off.x * 0.8, -off.len, -0.26 + off.z),
    ]);
    const tGeo = new THREE.TubeGeometry(strandCurve, 14, off.r, 10, false);
    const tMesh = new THREE.Mesh(tGeo, maneMat);
    tMesh.castShadow = true;
    tailJoint.add(tMesh);
  });

  // -------------------------------------------------------------
  // 4. ANATOMICAL ARTICULATED LEGS (Shoulder/Thigh -> Knee/Hock -> Cannon -> Fetlock -> Pastern -> Hoof & Shoe)
  // -------------------------------------------------------------
  function buildLeg(isFront: boolean, isLeft: boolean) {
    const legRoot = new THREE.Group();
    const xPos = (isLeft ? 1 : -1) * (isFront ? 0.29 : 0.31);
    const zPos = isFront ? 0.62 : -0.72;
    legRoot.position.set(xPos, 1.32, zPos);
    horseGroup.add(legRoot);

    const upperLeg = new THREE.Group();
    legRoot.add(upperLeg);

    const upperLength = 0.54;
    // Muscular tapered forearm (front) / gaskin thigh (rear)
    const upperProfile = isFront
      ? [
          new THREE.Vector2(0.085, 0),
          new THREE.Vector2(0.098, 0.14),
          new THREE.Vector2(0.128, 0.34),
          new THREE.Vector2(0.152, 0.54),
        ]
      : [
          new THREE.Vector2(0.09, 0),
          new THREE.Vector2(0.115, 0.18),
          new THREE.Vector2(0.165, 0.38),
          new THREE.Vector2(0.205, 0.54),
        ];
    const upperGeo = new THREE.LatheGeometry(upperProfile, 16);
    upperGeo.translate(0, -upperLength, 0);
    if (!isFront) {
      upperGeo.scale(0.88, 1.0, 1.15);
    }
    const upperMesh = new THREE.Mesh(upperGeo, coatMat);
    upperMesh.castShadow = true;
    upperLeg.add(upperMesh);

    // Sculpted Knee (front) / Hock (rear)
    const jointSphere = new THREE.Mesh(new THREE.SphereGeometry(0.088, 14, 12), coatMat);
    jointSphere.scale.set(0.95, 1.12, isFront ? 1.0 : 1.25);
    jointSphere.position.set(0, -upperLength, isFront ? 0 : -0.02);
    upperLeg.add(jointSphere);

    // Lower leg pivot (cannon + fetlock + pastern + hoof)
    const lowerLeg = new THREE.Group();
    lowerLeg.position.set(0, -upperLength, 0);
    upperLeg.add(lowerLeg);

    const lowerLength = 0.52;
    const lowerMat = horse.coat === 'bulany' ? pointsMat : coatMat;

    // Upper cannon bone
    const cannonTopGeo = new THREE.CylinderGeometry(0.072, 0.062, lowerLength * 0.55, 14);
    const cannonTop = new THREE.Mesh(cannonTopGeo, lowerMat);
    cannonTop.position.set(0, -lowerLength * 0.275, 0);
    cannonTop.castShadow = true;
    lowerLeg.add(cannonTop);

    // White stocking / sock (or dark point) on lower cannon & fetlock
    const sockMat = pointsMat;
    const cannonBotGeo = new THREE.CylinderGeometry(0.062, 0.064, lowerLength * 0.45, 14);
    const cannonBot = new THREE.Mesh(cannonBotGeo, sockMat);
    cannonBot.position.set(0, -lowerLength * 0.775, 0);
    cannonBot.castShadow = true;
    lowerLeg.add(cannonBot);

    // Fetlock joint
    const fetlock = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), sockMat);
    fetlock.position.set(0, -lowerLength, 0);
    lowerLeg.add(fetlock);

    // Angled Pastern leading forward to hoof
    const pastern = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.068, 0.16, 12), sockMat);
    pastern.position.set(0, -lowerLength - 0.065, 0.032);
    pastern.rotation.x = -0.38;
    pastern.castShadow = true;
    lowerLeg.add(pastern);

    // Hoof group at ground level (total depth below legRoot 1.32 is 0.54 + 0.52 + 0.14 + 0.12 = 1.32 -> y = 0!)
    const hoofGroup = new THREE.Group();
    hoofGroup.position.set(0, -lowerLength - 0.14, 0.065);
    lowerLeg.add(hoofGroup);

    const hoofGeo = new THREE.CylinderGeometry(0.078, 0.105, 0.12, 16);
    const hoofMesh = new THREE.Mesh(hoofGeo, hoofMat);
    hoofMesh.position.set(0, -0.06, 0.01);
    hoofMesh.rotation.x = -0.12;
    hoofMesh.castShadow = true;
    hoofGroup.add(hoofMesh);

    const shoeGeo = new THREE.TorusGeometry(0.092, 0.016, 8, 14, Math.PI * 1.45);
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
  // 5. QUILTED SADDLE PAD, SCULPTED SADDLE, GIRTH & STIRRUPS
  // -------------------------------------------------------------
  const blanketGeo = new THREE.CylinderGeometry(0.56, 0.58, 0.94, 24, 1, false, Math.PI * 0.12, Math.PI * 0.76);
  blanketGeo.rotateZ(Math.PI / 2);
  blanketGeo.scale(0.84, 1.05, 1.0);
  const blanket = new THREE.Mesh(blanketGeo, blanketMat);
  blanket.position.set(0, 1.49, -0.05);
  blanket.castShadow = true;
  blanket.receiveShadow = true;
  horseGroup.add(blanket);

  // Sculpted English/Adventure Saddle
  const saddleGroup = new THREE.Group();
  saddleGroup.position.set(0, 1.94, -0.04);
  horseGroup.add(saddleGroup);

  const saddleBase = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.34, 8, 16), leatherMat);
  saddleBase.rotation.x = Math.PI / 2;
  saddleBase.scale.set(1.18, 0.55, 1.0);
  saddleBase.castShadow = true;
  saddleGroup.add(saddleBase);

  // Raised Cantle (back rim of saddle) & Pommel (front arch)
  const cantle = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.048, 10, 18, Math.PI), leatherMat);
  cantle.position.set(0, 0.08, -0.24);
  cantle.rotation.x = -0.45;
  saddleGroup.add(cantle);

  const pommel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.042, 10, 16, Math.PI), leatherMat);
  pommel.position.set(0, 0.05, 0.23);
  pommel.rotation.x = 0.25;
  saddleGroup.add(pommel);

  // Contoured Saddle Flaps & Padded Knee Rolls
  [-1, 1].forEach((side) => {
    const flapGeo = new THREE.CylinderGeometry(0.32, 0.28, 0.04, 16);
    flapGeo.rotateZ(Math.PI / 2);
    flapGeo.scale(1.0, 1.15, 0.95);
    const flap = new THREE.Mesh(flapGeo, leatherMat);
    flap.position.set(side * 0.41, -0.22, -0.02);
    flap.rotation.z = side * -0.22;
    flap.castShadow = true;
    saddleGroup.add(flap);

    const kneeRoll = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.22, 6, 10), darkLeatherMat);
    kneeRoll.position.set(side * 0.44, -0.18, 0.14);
    kneeRoll.rotation.set(0.35, 0, side * -0.22);
    saddleGroup.add(kneeRoll);
  });

  // Girth strap wrapping under horse's belly + brass buckle
  const girth = new THREE.Mesh(new THREE.TorusGeometry(0.54, 0.03, 8, 28, Math.PI * 1.25), darkLeatherMat);
  girth.scale.set(0.84, 1.04, 1.0);
  girth.position.set(0, 1.48, 0.06);
  girth.rotation.z = Math.PI * 0.875;
  horseGroup.add(girth);

  // Stirrup leathers & silver irons
  [-1, 1].forEach((side) => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.58, 0.032), darkLeatherMat);
    strap.position.set(side * 0.48, 1.56, 0.02);
    strap.rotation.z = side * -0.08;
    horseGroup.add(strap);

    const iron = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.013, 8, 14), silverMat);
    iron.position.set(side * 0.5, 1.25, 0.02);
    iron.rotation.y = Math.PI / 2;
    horseGroup.add(iron);
  });

  // -------------------------------------------------------------
  // 6. RIDER MODEL (Detailed Adventurer in Riding Tunic & Boots)
  // -------------------------------------------------------------
  const riderGroup = new THREE.Group();
  riderGroup.position.set(0, 1.98, -0.05);
  horseGroup.add(riderGroup);

  const hairMat = palette.getRiderHairMaterial(rider.hairColor);
  const outfitMat = palette.getRiderOutfitMaterial(rider.outfitColor);
  const skinMat = new THREE.MeshPhysicalMaterial({ color: 0xfad7c0, roughness: 0.52, sheen: 0.25 });
  const bootMat = new THREE.MeshPhysicalMaterial({ color: 0x2b1a12, roughness: 0.36, clearcoat: 0.2 });
  const breechesMat = new THREE.MeshStandardMaterial({ color: 0xebe3d3, roughness: 0.65 });

  const riderTorso = new THREE.Group();
  riderGroup.add(riderTorso);

  // Tailored Riding Tunic (Lathe waist + flared hem)
  const tunicProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.19, 0.02),
    new THREE.Vector2(0.15, 0.14), // Slim waist
    new THREE.Vector2(0.185, 0.36), // Chest/bust
    new THREE.Vector2(0.20, 0.50),  // Shoulders
    new THREE.Vector2(0.09, 0.55),  // Collar
    new THREE.Vector2(0.0, 0.55),
  ];
  const tunicGeo = new THREE.LatheGeometry(tunicProfile, 18);
  tunicGeo.scale(1.06, 1.0, 0.72);
  const bodyMesh = new THREE.Mesh(tunicGeo, outfitMat);
  bodyMesh.castShadow = true;
  riderTorso.add(bodyMesh);

  // Leather belt & brass buckle
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.022, 8, 18), darkLeatherMat);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1.06, 0.74, 1.0);
  belt.position.set(0, 0.15, 0);
  riderTorso.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.02), brassMat);
  buckle.position.set(0, 0.15, 0.12);
  riderTorso.add(buckle);

  // Draped flowing Traveler Cloak
  const cloakGeo = new THREE.CylinderGeometry(0.17, 0.32, 0.58, 14, 1, true, Math.PI * 0.62, Math.PI * 0.76);
  const cloakMat = outfitMat.clone();
  cloakMat.side = THREE.DoubleSide;
  const cloakMesh = new THREE.Mesh(cloakGeo, cloakMat);
  cloakMesh.position.set(0, 0.25, -0.06);
  cloakMesh.rotation.x = 0.22;
  cloakMesh.castShadow = true;
  riderTorso.add(cloakMesh);

  // Neck
  const neckRider = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 12), skinMat);
  neckRider.position.set(0, 0.57, 0);
  riderTorso.add(neckRider);

  // Head
  const riderHead = buildStylizedRiderHead(hairMat, skinMat, 0x3b82f6);
  riderHead.position.set(0, 0.73, 0.01);
  riderTorso.add(riderHead);

  // Glowing Elven Star Brooch on chest
  const broochGeo = new THREE.OctahedronGeometry(0.055, 0);
  const broochMat = new THREE.MeshStandardMaterial({
    color: 0xa5f3fc,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.9,
    roughness: 0.1,
    metalness: 0.9,
  });
  const starBrooch = new THREE.Mesh(broochGeo, broochMat);
  starBrooch.position.set(0, 0.42, 0.145);
  riderTorso.add(starBrooch);

  const starLight = new THREE.PointLight(0x7df9ff, 0.85, 4.5);
  starLight.position.set(0, 0.42, 0.28);
  riderTorso.add(starLight);

  // Articulated Arms holding reins
  const buildRiderArm = (side: number) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.21, 0.46, 0.02);
    arm.rotation.x = 0.72;
    arm.rotation.z = side * -0.14;

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), outfitMat);
    arm.add(shoulder);

    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.3, 6, 10), outfitMat);
    sleeve.position.set(0, -0.18, 0);
    sleeve.castShadow = true;
    arm.add(sleeve);

    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), darkLeatherMat);
    glove.position.set(0, -0.37, 0.02);
    arm.add(glove);

    riderTorso.add(arm);
    return arm;
  };

  const riderArmL = buildRiderArm(1);
  const riderArmR = buildRiderArm(-1);

  // Legs in riding breeches + tall cuffed leather boots inside stirrups
  [-1, 1].forEach((side) => {
    const riderLeg = new THREE.Group();
    riderLeg.position.set(side * 0.23, 0.06, 0);
    riderLeg.rotation.set(0.32, 0, side * -0.26);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.26, 6, 10), breechesMat);
    thigh.position.set(0, -0.16, 0);
    thigh.castShadow = true;
    riderLeg.add(thigh);

    const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.34, 12), bootMat);
    bootShaft.position.set(0, -0.45, 0.05);
    bootShaft.rotation.x = -0.22;
    bootShaft.castShadow = true;
    riderLeg.add(bootShaft);

    const bootCuff = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.015, 6, 12), leatherMat);
    bootCuff.rotation.x = Math.PI / 2 - 0.22;
    bootCuff.position.set(0, -0.3, 0.02);
    riderLeg.add(bootCuff);

    const bootFoot = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.11, 6, 10), bootMat);
    bootFoot.rotation.x = Math.PI / 2;
    bootFoot.position.set(0, -0.62, 0.13);
    riderLeg.add(bootFoot);

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
  const bootMat = new THREE.MeshPhysicalMaterial({ color: 0x2b1a12, roughness: 0.36, clearcoat: 0.2 });
  const darkLeatherMat = new THREE.MeshStandardMaterial({ color: 0x26140b, roughness: 0.45 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.22, metalness: 0.88 });
  const breechesMat = new THREE.MeshStandardMaterial({ color: 0xebe3d3, roughness: 0.65 });

  // Torso group (hip pivot at y = 0.84)
  const torso = new THREE.Group();
  torso.position.set(0, 0.84, 0);
  root.add(torso);

  const tunicProfile = [
    new THREE.Vector2(0.0, -0.02),
    new THREE.Vector2(0.19, 0.0),
    new THREE.Vector2(0.15, 0.14),
    new THREE.Vector2(0.185, 0.36),
    new THREE.Vector2(0.2, 0.5),
    new THREE.Vector2(0.09, 0.55),
    new THREE.Vector2(0.0, 0.55),
  ];
  const tunicGeo = new THREE.LatheGeometry(tunicProfile, 18);
  tunicGeo.scale(1.06, 1.0, 0.72);
  const bodyMesh = new THREE.Mesh(tunicGeo, outfitMat);
  bodyMesh.castShadow = true;
  torso.add(bodyMesh);

  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.022, 8, 18), darkLeatherMat);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1.06, 0.74, 1.0);
  belt.position.set(0, 0.15, 0);
  torso.add(belt);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.055, 0.02), brassMat);
  buckle.position.set(0, 0.15, 0.12);
  torso.add(buckle);

  const cloakGeo = new THREE.CylinderGeometry(0.17, 0.34, 0.68, 14, 1, true, Math.PI * 0.62, Math.PI * 0.76);
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

  const head = buildStylizedRiderHead(hairMat, skinMat, 0x3b82f6);
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

    const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.058, 0.4, 12), bootMat);
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
// FELEK THE FOX (Organic, fluffy stylized fox)
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

export function createFoxModel(): FoxRig {
  const root = new THREE.Group();
  root.name = 'FelekTheFox';
  root.add(createContactShadow(0.32, 0.55, 0.28));

  const furMat = new THREE.MeshPhysicalMaterial({
    color: 0xe45a1b,
    roughness: 0.58,
    sheen: 0.55,
    sheenColor: new THREE.Color(0xffb078),
  });
  const whiteMat = new THREE.MeshPhysicalMaterial({ color: 0xfdfcf9, roughness: 0.55, sheen: 0.5 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x1a191e, roughness: 0.4 });
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x100c0a, roughness: 0.05, clearcoat: 1.0 });

  // Sleek tapered fox torso
  const foxBodyProfile = [
    new THREE.Vector2(0.0, -0.38),
    new THREE.Vector2(0.15, -0.32),
    new THREE.Vector2(0.20, -0.1),
    new THREE.Vector2(0.19, 0.16),
    new THREE.Vector2(0.21, 0.3),
    new THREE.Vector2(0.14, 0.39),
    new THREE.Vector2(0.0, 0.42),
  ];
  const bodyGeo = new THREE.LatheGeometry(foxBodyProfile, 18);
  bodyGeo.rotateX(Math.PI / 2);
  bodyGeo.scale(0.86, 1.0, 1.0);
  const body = new THREE.Mesh(bodyGeo, furMat);
  body.position.set(0, 0.44, 0);
  body.castShadow = true;
  root.add(body);

  // Fluffy white chest ruff
  const bib = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 12), whiteMat);
  bib.scale.set(0.85, 1.15, 0.78);
  bib.position.set(0, 0.42, 0.28);
  root.add(bib);

  // Head
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.62, 0.38);
  root.add(headGroup);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 14), furMat);
  headMesh.scale.set(1.06, 0.92, 1.04);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Fluffy white fox cheek ruffs
  [-1, 1].forEach((side) => {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.098, 12, 10), whiteMat);
    cheek.scale.set(1.15, 0.85, 0.8);
    cheek.position.set(side * 0.11, -0.04, 0.05);
    headGroup.add(cheek);
  });

  // Tapered fox snout (orange bridge + white underside + dark button nose)
  const snoutTop = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.24, 12), furMat);
  snoutTop.rotation.x = Math.PI / 2;
  snoutTop.scale.set(0.95, 1.0, 0.65);
  snoutTop.position.set(0, -0.02, 0.21);
  headGroup.add(snoutTop);

  const snoutBottom = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.2, 12), whiteMat);
  snoutBottom.rotation.x = Math.PI / 2;
  snoutBottom.scale.set(0.9, 1.0, 0.55);
  snoutBottom.position.set(0, -0.055, 0.2);
  headGroup.add(snoutBottom);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 10), blackMat);
  nose.position.set(0, -0.025, 0.33);
  headGroup.add(nose);

  // Expressive eyes with tiny catchlights
  const catchMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), eyeMat);
    eye.position.set(side * 0.088, 0.05, 0.125);
    const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), catchMat);
    sparkle.position.set(side * 0.095, 0.062, 0.15);
    headGroup.add(eye, sparkle);
  });

  // Large pointed fox ears with dark outer tips & cream inner fur
  [-1, 1].forEach((side) => {
    const ear = new THREE.Group();
    ear.position.set(side * 0.105, 0.155, -0.01);
    ear.rotation.set(0.12, side * 0.2, side * -0.24);

    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.2, 10), furMat);
    outer.scale.set(1.0, 1.0, 0.6);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 10), blackMat);
    tip.scale.set(1.0, 1.0, 0.62);
    tip.position.set(0, 0.065, -0.004);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.14, 8), whiteMat);
    inner.scale.set(1.0, 1.0, 0.35);
    inner.position.set(0, -0.01, 0.018);

    ear.add(outer, tip, inner);
    headGroup.add(ear);
  });

  // Lush sculpted bushy fox tail (Lathe profile + fluffy white tip)
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.45, -0.34);
  root.add(tailGroup);

  const tailProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.075, 0.04),
    new THREE.Vector2(0.155, 0.22),
    new THREE.Vector2(0.165, 0.42),
    new THREE.Vector2(0.11, 0.56),
    new THREE.Vector2(0.0, 0.62),
  ];
  const tailBodyGeo = new THREE.LatheGeometry(tailProfile, 16);
  tailBodyGeo.rotateX(-Math.PI * 0.64);
  const tailBody = new THREE.Mesh(tailBodyGeo, furMat);
  tailBody.castShadow = true;
  tailGroup.add(tailBody);

  const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.24, 14), whiteMat);
  tailTip.position.set(0, 0.24, -0.52);
  tailTip.rotation.x = -Math.PI * 0.64;
  tailGroup.add(tailTip);

  // Articulated slender legs with black socks & white paw tips
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
// MONSTERS (Troll, Orc, Goblin) — Detailed Fantasy Silhouettes
// -------------------------------------------------------------
export function createMonsterModel(type: 'goblin' | 'orc' | 'troll'): THREE.Group {
  const group = new THREE.Group();

  if (type === 'troll') {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5c6359, roughness: 0.88, flatShading: true });
    const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0x41473f, roughness: 0.92, flatShading: true });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x3b632c, roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x482c1a, roughness: 0.78 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.4, metalness: 0.8 });
    const tuskMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.4 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffd000, emissive: 0xff9900, emissiveIntensity: 0.85 });

    // Craggy boulder torso & belt loincloth
    const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), stoneMat);
    torso.scale.set(1.12, 1.15, 0.9);
    torso.position.set(0, 2.25, 0);
    torso.castShadow = true;
    group.add(torso);

    const loincloth = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.75, 10), woodMat);
    loincloth.position.set(0, 1.38, 0);
    group.add(loincloth);

    // Mossy boulder shoulders
    [-1, 1].forEach((side) => {
      const shoulder = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 1), stoneMat);
      shoulder.position.set(side * 1.02, 2.75, -0.05);
      shoulder.castShadow = true;
      group.add(shoulder);

      const moss = new THREE.Mesh(new THREE.SphereGeometry(0.46, 8, 6), mossMat);
      moss.scale.set(1.2, 0.55, 1.0);
      moss.position.set(side * 0.98, 3.12, -0.08);
      group.add(moss);

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 1.4, 8), darkStoneMat);
      arm.position.set(side * 1.28, 1.95, 0.15);
      arm.rotation.z = side * -0.18;
      arm.castShadow = true;
      group.add(arm);
    });

    // Sculpted Troll Head with heavy brow ridge, big nose & ivory tusks
    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(0.64, 1), stoneMat);
    head.scale.set(0.95, 1.08, 1.02);
    head.position.set(0, 3.42, 0.36);
    head.castShadow = true;
    group.add(head);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.2, 0.34), darkStoneMat);
    brow.position.set(0, 3.62, 0.72);
    group.add(brow);

    const trollNose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 6), darkStoneMat);
    trollNose.rotation.x = Math.PI * 0.65;
    trollNose.position.set(0, 3.36, 0.92);
    group.add(trollNose);

    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeMat);
      eye.position.set(side * 0.22, 3.48, 0.85);
      group.add(eye);

      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.24, 6), tuskMat);
      tusk.position.set(side * 0.2, 3.15, 0.82);
      tusk.rotation.x = 0.2;
      group.add(tusk);
    });

    // Massive Gnarled Tree Club with iron bands
    const clubGroup = new THREE.Group();
    clubGroup.position.set(1.42, 1.85, 0.55);
    clubGroup.rotation.set(0.35, 0, -0.32);
    const clubWood = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.12, 2.75, 8), woodMat);
    clubWood.castShadow = true;
    const ironBand1 = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 6, 10), ironMat);
    ironBand1.rotation.x = Math.PI / 2;
    ironBand1.position.y = 0.85;
    const ironBand2 = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 10), ironMat);
    ironBand2.rotation.x = Math.PI / 2;
    ironBand2.position.y = 0.3;
    clubGroup.add(clubWood, ironBand1, ironBand2);
    group.add(clubGroup);

    // Pillar stone legs
    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 1.35, 8), darkStoneMat);
      leg.position.set(side * 0.54, 0.68, 0);
      leg.castShadow = true;
      group.add(leg);
    });
  } else if (type === 'orc') {
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x2d323a, roughness: 0.42, metalness: 0.72 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.32, metalness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x56643c, roughness: 0.65 });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x451a1a, roughness: 0.8 });
    const tuskMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.4 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff0000, emissiveIntensity: 0.85 });

    // Tapered Armored Breastplate + Leather Waist Skirt
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.36, 0.95, 10), armorMat);
    chest.scale.set(1.15, 1.0, 0.72);
    chest.position.set(0, 1.48, 0);
    chest.castShadow = true;
    group.add(chest);

    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.44, 0.45, 10), clothMat);
    waist.scale.set(1.1, 1.0, 0.75);
    waist.position.set(0, 0.95, 0);
    group.add(waist);

    // Spiked Shoulder Pauldrons & Arms
    [-1, 1].forEach((side) => {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), armorMat);
      pauldron.position.set(side * 0.54, 1.88, 0);
      pauldron.rotation.z = side * -0.4;
      group.add(pauldron);

      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), trimMat);
      spike.position.set(side * 0.66, 2.04, 0);
      spike.rotation.z = side * -0.5;
      group.add(spike);

      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.52, 6, 8), skinMat);
      arm.position.set(side * 0.6, 1.45, 0.08);
      arm.rotation.z = side * -0.15;
      arm.castShadow = true;
      group.add(arm);
    });

    // Head + Horned Iron Helm + Tusks
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), skinMat);
    head.position.set(0, 2.18, 0.06);
    head.castShadow = true;
    group.add(head);

    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), armorMat);
    helm.position.set(0, 2.22, 0.06);
    group.add(helm);

    const helmCrest = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 6), trimMat);
    helmCrest.position.set(0, 2.66, 0.06);
    group.add(helmCrest);

    [-1, 1].forEach((side) => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 6), tuskMat);
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

    // Bossed Round Shield
    const shieldGroup = new THREE.Group();
    shieldGroup.position.set(-0.72, 1.42, 0.28);
    shieldGroup.rotation.y = -0.35;
    const shieldBody = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.07, 16), armorMat);
    shieldBody.rotation.x = Math.PI / 2;
    const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.04, 8, 18), trimMat);
    const shieldBoss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), trimMat);
    shieldBoss.position.z = 0.04;
    shieldGroup.add(shieldBody, shieldRim, shieldBoss);
    group.add(shieldGroup);

    // Jagged Orc Scimitar
    const swordGroup = new THREE.Group();
    swordGroup.position.set(0.68, 1.4, 0.34);
    swordGroup.rotation.set(0.6, 0, -0.25);
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8), clothMat);
    const crossguard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 0.06), trimMat);
    crossguard.position.y = 0.14;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.95, 0.03), trimMat);
    blade.position.y = 0.64;
    swordGroup.add(hilt, crossguard, blade);
    group.add(swordGroup);

    // Armored Greaves Legs
    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.85, 10), armorMat);
      leg.position.set(side * 0.22, 0.425, 0);
      leg.castShadow = true;
      group.add(leg);
    });
  } else {
    // Hunched Cave Goblin with tattered vest, bat ears & glowing crystal staff
    const gobMat = new THREE.MeshStandardMaterial({ color: 0x4b7447, roughness: 0.68 });
    const ragMat = new THREE.MeshStandardMaterial({ color: 0x442b1a, roughness: 0.85 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffb703, emissive: 0xff7b00, emissiveIntensity: 0.9 });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.1,
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
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.36, 8), gobMat);
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

    // Gnarled Staff with Caged Glowing Gem
    const staffCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.4, 0.05, 0.16),
      new THREE.Vector3(0.38, 0.75, 0.19),
      new THREE.Vector3(0.42, 1.42, 0.17),
    ]);
    const staff = new THREE.Mesh(new THREE.TubeGeometry(staffCurve, 10, 0.036, 6, false), ragMat);
    const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 12), ragMat);
    crownRing.position.set(0.42, 1.54, 0.17);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), crystalMat);
    gem.position.set(0.42, 1.54, 0.17);
    group.add(staff, crownRing, gem);
  }

  // Soft warning telegraph circle on the ground
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
export function createHobbitBurrow(): THREE.Group {
  const group = new THREE.Group();

  const grassMat = new THREE.MeshStandardMaterial({ color: 0x4c8a38, roughness: 0.78 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4e2d18, roughness: 0.62 });
  const doorMat = new THREE.MeshPhysicalMaterial({ color: 0x1e723d, roughness: 0.36, clearcoat: 0.18 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.9 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.45, metalness: 0.8 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7b7f78, roughness: 0.85 });
  const creamPlasterMat = new THREE.MeshStandardMaterial({ color: 0xe7dec8, roughness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffea9f, emissive: 0xffb733, emissiveIntensity: 0.65 });

  // Lush rounded turf mound
  const hill = new THREE.Mesh(
    new THREE.SphereGeometry(6.2, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.46),
    grassMat
  );
  hill.scale.set(1.45, 0.78, 1.38);
  hill.castShadow = true;
  hill.receiveShadow = true;
  group.add(hill);

  // Curved plaster/stone cottage front facade
  const facade = new THREE.Mesh(
    new THREE.CylinderGeometry(3.7, 3.85, 2.9, 20, 1, false, -Math.PI * 0.38, Math.PI * 0.76),
    creamPlasterMat
  );
  facade.position.set(0, 1.28, 4.9);
  facade.castShadow = true;
  facade.receiveShadow = true;
  group.add(facade);

  // Stone threshold step
  const step = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.95), stoneMat);
  step.position.set(0, 0.11, 5.5);
  step.receiveShadow = true;
  group.add(step);

  // Iconic Round Hobbit Door with stone arch, wood trim, iron hinges & centered brass knob
  const doorArch = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.16, 10, 28), stoneMat);
  doorArch.position.set(0, 1.42, 5.26);
  group.add(doorArch);

  const doorFrame = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.07, 8, 28), woodMat);
  doorFrame.position.set(0, 1.42, 5.31);
  group.add(doorFrame);

  const door = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.08, 0.1, 28), doorMat);
  door.rotation.x = Math.PI / 2;
  door.position.set(0, 1.42, 5.27);
  door.castShadow = true;
  group.add(door);

  // Vertical plank grooves on door
  for (let p = -0.7; p <= 0.71; p += 0.35) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.65, 0.02), woodMat);
    seam.position.set(p, 1.42, 5.325);
    group.add(seam);
  }

  // Wrought-iron hinge straps
  [-0.36, 0.36].forEach((hy) => {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.07, 0.03), ironMat);
    hinge.position.set(-0.62, 1.42 + hy, 5.33);
    group.add(hinge);
  });

  // Centered brass knob & backplate
  const knobPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16), brassMat);
  knobPlate.rotation.x = Math.PI / 2;
  knobPlate.position.set(0, 1.42, 5.33);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), brassMat);
  knob.position.set(0, 1.42, 5.4);
  group.add(knobPlate, knob);

  // Two cozy multi-pane round Hobbit Windows with flowerboxes
  const flowerColors = [0xf43f5e, 0xfbbf24, 0xc084fc];
  [-2.15, 2.15].forEach((wx) => {
    const wz = 4.65;
    const wy = 1.52;
    const rotY = wx > 0 ? 0.36 : -0.36;

    const winGroup = new THREE.Group();
    winGroup.position.set(wx, wy, wz);
    winGroup.rotation.y = rotY;

    const frameOuter = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.085, 8, 22), woodMat);
    const pane = new THREE.Mesh(new THREE.CircleGeometry(0.53, 22), glassMat);
    pane.position.z = 0.01;
    const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.04, 0.05), woodMat);
    mullionV.position.z = 0.025;
    const mullionH = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.045, 0.05), woodMat);
    mullionH.position.z = 0.025;

    // Window flowerbox
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.22, 0.32), woodMat);
    box.position.set(0, -0.62, 0.16);
    winGroup.add(frameOuter, pane, mullionV, mullionH, box);

    for (let f = -0.35; f <= 0.36; f += 0.23) {
      const fMat = new THREE.MeshStandardMaterial({
        color: flowerColors[Math.abs(Math.round(f * 10)) % flowerColors.length],
        roughness: 0.6,
      });
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 8), fMat);
      bloom.position.set(f, -0.45, 0.18);
      winGroup.add(bloom);
    }

    group.add(winGroup);
  });

  // Stone Chimney with flared cap & subtle curling smoke puffs
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 2.2, 10), stoneMat);
  chimney.position.set(-1.9, 3.6, 1.4);
  chimney.castShadow = true;
  const chimneyCap = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.48, 0.25, 10), stoneMat);
  chimneyCap.position.set(-1.9, 4.75, 1.4);
  group.add(chimney, chimneyCap);

  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 1,
    transparent: true,
    opacity: 0.45,
  });
  for (let s = 0; s < 3; s++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.24 + s * 0.1, 10, 8), smokeMat);
    puff.position.set(-1.9 + s * 0.2, 5.2 + s * 0.55, 1.4 - s * 0.12);
    group.add(puff);
  }

  // Wooden picket garden fence with horizontal rails!
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

  return group;
}

export function createAbandonedStable(): THREE.Group {
  const group = new THREE.Group();

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x523723, roughness: 0.72 });
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x382415, roughness: 0.78 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.9 });
  const thatchMat = new THREE.MeshStandardMaterial({ color: 0x84704c, roughness: 0.88 });
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xd4b24c, roughness: 0.85 });
  const appleMat = new THREE.MeshPhysicalMaterial({ color: 0xdc2626, roughness: 0.25, clearcoat: 0.4 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.6 });
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xffaa00, emissiveIntensity: 1.0 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.85 });

  // Stone foundation piers & main timber posts with diagonal knee-braces
  const postPositions = [
    [-3, -2], [3, -2],
    [-3, 2], [3, 2],
    [0, -2], [0, 2],
  ];
  postPositions.forEach(([x, z]) => {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.32, 0.46), stoneMat);
    pier.position.set(x, 0.16, z);
    pier.receiveShadow = true;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.1, 0.28), woodMat);
    post.position.set(x, 1.7, z);
    post.castShadow = true;
    group.add(pier, post);
  });

  // Diagonal timber knee-braces on outer posts
  [-3, 3].forEach((x) => {
    const dir = x < 0 ? 1 : -1;
    [-2, 2].forEach((z) => {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.14), darkWoodMat);
      brace.position.set(x + dir * 0.32, 2.75, z);
      brace.rotation.z = dir * -Math.PI / 4;
      group.add(brace);
    });
  });

  // Top beams + Gable A-trusses
  [-2, 2].forEach((z) => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.26, 0.26), darkWoodMat);
    beam.position.set(0, 3.15, z);
    beam.castShadow = true;
    group.add(beam);
  });
  const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 4.9), darkWoodMat);
  ridgeBeam.position.set(0, 4.5, 0);
  group.add(ridgeBeam);

  // Slanted shingled/thatched gable roof panels + plank rafters
  const roofL = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.18, 4.9), thatchMat);
  roofL.position.set(-1.72, 3.82, 0);
  roofL.rotation.z = 0.36;
  roofL.castShadow = true;
  roofL.receiveShadow = true;

  const roofR = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.18, 4.9), thatchMat);
  roofR.position.set(1.72, 3.82, 0);
  roofR.rotation.z = -0.36;
  roofR.castShadow = true;
  roofR.receiveShadow = true;
  group.add(roofL, roofR);

  // Half-wall wooden stall railings along back & sides
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(6.0, 1.15, 0.14), woodMat);
  backWall.position.set(0, 0.65, -2.0);
  backWall.castShadow = true;
  group.add(backWall);

  [-3, 3].forEach((x) => {
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 4.0), woodMat);
    sideWall.position.set(x, 0.65, 0);
    sideWall.castShadow = true;
    group.add(sideWall);
  });

  // Tied Hay Bales on floor
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

  // Wooden Water Barrel beside front post
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.85, 14), woodMat);
  barrel.position.set(-2.35, 0.425, 1.4);
  barrel.castShadow = true;
  const hoop1 = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.025, 6, 16), ironMat);
  hoop1.rotation.x = Math.PI / 2;
  hoop1.position.set(-2.35, 0.65, 1.4);
  const hoop2 = hoop1.clone();
  hoop2.position.y = 0.22;
  group.add(barrel, hoop1, hoop2);

  // Carved Feed Trough with glossy Apples + tiny stems & leaves
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

  // Wrought-iron hanging lantern cage + warm light
  const lanternChain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), ironMat);
  lanternChain.position.set(0, 2.9, 2.0);
  const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 6), ironMat);
  lanternCap.position.set(0, 2.66, 2.0);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.28, 6), lanternMat);
  lantern.position.set(0, 2.48, 2.0);
  const lanternLight = new THREE.PointLight(0xffaa33, 1.6, 9);
  lanternLight.position.set(0, 2.45, 2.0);
  group.add(lanternChain, lanternCap, lantern, lanternLight);

  return group;
}

export function createCampfireSite(): THREE.Group {
  const group = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5c6064, roughness: 0.92, flatShading: true });
  const logMat = new THREE.MeshStandardMaterial({ color: 0x412817, roughness: 0.82 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.45, metalness: 0.85 });
  const canvasMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.78, side: THREE.DoubleSide });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x265c3b, roughness: 0.62 });
  const plaidMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.85 });
  const emberMat = new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff3300, emissiveIntensity: 1.5 });
  const flameMat = new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xff8800, emissiveIntensity: 1.7 });
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffe082, emissive: 0xffb300, emissiveIntensity: 1.3 });

  // 1. Stone Campfire Ring & Ash Bed
  const ashBed = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 16),
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

  // Split firewood logs
  for (let j = 0; j < 5; j++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.95, 8), logMat);
    log.position.set(0, 0.17, 0);
    log.rotation.x = 0.38;
    log.rotation.y = (j / 5) * Math.PI * 2;
    log.castShadow = true;
    group.add(log);
  }

  // Glowing embers + Animated Flames group
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

  // Iron Tripod & Suspended Tea Kettle over the campfire!
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
  group.add(kettle);

  const fireLight = new THREE.PointLight(0xff8833, 3.2, 16);
  fireLight.name = 'CampFireLight';
  fireLight.position.set(0, 0.88, 0);
  group.add(fireLight);

  // Sitting log bench beside fire
  const bench = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.9, 10), logMat);
  bench.rotateZ(Math.PI / 2);
  bench.position.set(0, 0.2, -1.4);
  bench.castShadow = true;
  group.add(bench);

  // 2. Cozy Hobbit Traveler A-Frame Tent
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

  // Green Shire embroidered ridge & corner wooden stakes
  const ridgeTrim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 2.78), trimMat);
  ridgeTrim.position.set(0, 2.03, 0);
  tentGroup.add(ridgeTrim);

  [
    [-1.28, -1.2], [1.28, -1.2],
    [-1.28, 1.2], [1.28, 1.2],
  ].forEach(([px, pz]) => {
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.015, 0.28, 6), logMat);
    peg.position.set(px, 0.1, pz);
    peg.rotation.z = px > 0 ? -0.35 : 0.35;
    tentGroup.add(peg);
  });

  // Back wall triangle
  const backPanel = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.98, 3), canvasMat);
  backPanel.position.set(0, 0.99, -1.33);
  backPanel.scale.set(1.0, 1.0, 0.08);
  tentGroup.add(backPanel);

  // Cozy floor mat, plaid sleeping quilt & pillow inside tent
  const floorMat = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.06, 2.58), trimMat);
  floorMat.position.set(0, 0.03, 0);
  floorMat.receiveShadow = true;
  tentGroup.add(floorMat);

  const sleepingBag = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.35, 6, 10), plaidMat);
  sleepingBag.rotation.x = Math.PI / 2;
  sleepingBag.scale.set(1.85, 0.42, 1.0);
  sleepingBag.position.set(0.18, 0.13, -0.15);
  tentGroup.add(sleepingBag);

  const pillow = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.35, 6, 8), canvasMat);
  pillow.rotation.z = Math.PI / 2;
  pillow.scale.set(0.7, 1.0, 1.2);
  pillow.position.set(0.18, 0.21, -0.82);
  tentGroup.add(pillow);

  // Rolled-up front doorway flaps + hanging lantern
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

export function createLonelyMountainModel(): THREE.Group {
  const group = new THREE.Group();

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x454a54, roughness: 0.92, flatShading: true });
  const darkRockMat = new THREE.MeshStandardMaterial({ color: 0x2f333b, roughness: 0.95, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf4f8fc, roughness: 0.38, flatShading: true });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffb700,
    emissiveIntensity: 0.7,
    roughness: 0.2,
    metalness: 0.85,
  });

  // Main jagged central peak + snow crown
  const basePeak = new THREE.Mesh(new THREE.ConeGeometry(92, 185, 14), rockMat);
  basePeak.position.set(0, 92.5, 0);
  group.add(basePeak);

  const snowCap = new THREE.Mesh(new THREE.ConeGeometry(39, 78, 14), snowMat);
  snowCap.position.set(0, 147, 0);
  group.add(snowCap);

  // Flanking crag spires & snow-dusted ridges
  [
    { x: -66, y: 62, z: -18, r: 58, h: 124 },
    { x: 62, y: 58, z: -22, r: 54, h: 116 },
    { x: -38, y: 46, z: 32, r: 34, h: 92 },
    { x: 40, y: 44, z: 30, r: 32, h: 88 },
  ].forEach((p) => {
    const spur = new THREE.Mesh(new THREE.ConeGeometry(p.r, p.h, 9), darkRockMat);
    spur.position.set(p.x, p.y, p.z);
    group.add(spur);
    const spurSnow = new THREE.Mesh(new THREE.ConeGeometry(p.r * 0.42, p.h * 0.42, 9), snowMat);
    spurSnow.position.set(p.x, p.y + p.h * 0.3, p.z);
    group.add(spurSnow);
  });

  // Grand Dwarven Gate of Erebor (Carved Archway, Golden Gates, Runic Trim, Sentinel Pillars)
  const gateFrame = new THREE.Mesh(new THREE.BoxGeometry(26, 32, 8), darkRockMat);
  gateFrame.position.set(0, 16, 56);
  group.add(gateFrame);

  const goldenDoor = new THREE.Mesh(new THREE.BoxGeometry(15, 22, 2), goldMat);
  goldenDoor.position.set(0, 11, 59.6);
  group.add(goldenDoor);

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(28, 3.5, 9.5), rockMat);
  lintel.position.set(0, 31, 57);
  group.add(lintel);

  [-1, 1].forEach((side) => {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.3, 28, 8), rockMat);
    pillar.position.set(side * 13.5, 14, 60);
    const brazier = new THREE.Mesh(new THREE.OctahedronGeometry(2.2, 0), goldMat);
    brazier.position.set(side * 13.5, 29.5, 60);
    group.add(pillar, brazier);
  });

  // Golden Celestial Beacon at the Summit
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(5.5, 0), goldMat);
  beacon.position.set(0, 187, 0);
  group.add(beacon);

  const beaconLight = new THREE.PointLight(0xffea75, 5.5, 210);
  beaconLight.position.set(0, 190, 0);
  group.add(beaconLight);

  return group;
}

export function createTree(type: 'apple' | 'willow' | 'pine'): THREE.Group {
  const tree = new THREE.Group();

  if (type === 'apple') {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3c26, roughness: 0.84 });
    const foliageMat1 = new THREE.MeshStandardMaterial({ color: 0x3b7d2c, roughness: 0.68 });
    const foliageMat2 = new THREE.MeshStandardMaterial({ color: 0x4b9235, roughness: 0.65 });
    const appleMat = new THREE.MeshPhysicalMaterial({ color: 0xe11d48, roughness: 0.25, clearcoat: 0.35 });

    // Tapered flared trunk + forked branches
    const trunkProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.46, 0.0),
      new THREE.Vector2(0.32, 0.45),
      new THREE.Vector2(0.25, 1.4),
      new THREE.Vector2(0.2, 2.2),
      new THREE.Vector2(0.0, 2.25),
    ];
    const trunk = new THREE.Mesh(new THREE.LatheGeometry(trunkProfile, 10), trunkMat);
    trunk.castShadow = true;
    tree.add(trunk);

    [
      { x: 0.45, y: 2.0, z: 0.2, rz: -0.55, ry: 0.3 },
      { x: -0.42, y: 2.05, z: -0.25, rz: 0.52, ry: -0.4 },
    ].forEach((b) => {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 1.1, 7), trunkMat);
      branch.position.set(b.x, b.y, b.z);
      branch.rotation.set(0, b.ry, b.rz);
      tree.add(branch);
    });

    // Multi-cluster lush rounded orchard canopy
    const clusters = [
      { x: 0, y: 3.15, z: 0, r: 1.35, mat: foliageMat1 },
      { x: 0.85, y: 2.75, z: 0.45, r: 0.95, mat: foliageMat2 },
      { x: -0.85, y: 2.8, z: -0.35, r: 0.92, mat: foliageMat2 },
      { x: 0.15, y: 2.85, z: -0.82, r: 0.88, mat: foliageMat1 },
      { x: -0.2, y: 2.8, z: 0.82, r: 0.9, mat: foliageMat2 },
    ];
    clusters.forEach((c) => {
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(c.r, 1), c.mat);
      puff.position.set(c.x, c.y, c.z);
      puff.castShadow = true;
      tree.add(puff);
    });

    // Glossy hanging apples
    for (let i = 0; i < 7; i++) {
      const apple = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), appleMat);
      const angle = (i / 7) * Math.PI * 2;
      apple.position.set(Math.cos(angle) * 1.15, 2.35 + (i % 3) * 0.35, Math.sin(angle) * 1.15);
      tree.add(apple);
    }
  } else if (type === 'willow') {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3f3831, roughness: 0.9 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x246350, roughness: 0.65 });
    const vineMat = new THREE.MeshStandardMaterial({ color: 0x2f7d63, roughness: 0.65 });

    const trunkProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.68, 0.0),
      new THREE.Vector2(0.45, 0.7),
      new THREE.Vector2(0.36, 2.2),
      new THREE.Vector2(0.3, 3.4),
      new THREE.Vector2(0.0, 3.45),
    ];
    const trunk = new THREE.Mesh(new THREE.LatheGeometry(trunkProfile, 10), trunkMat);
    trunk.castShadow = true;
    tree.add(trunk);

    // Multi-layered wide weeping canopy
    [
      { x: 0, y: 4.15, z: 0, sx: 1.45, sy: 0.75, sz: 1.45, r: 2.2 },
      { x: 0.9, y: 3.85, z: 0.6, sx: 1.1, sy: 0.7, sz: 1.1, r: 1.4 },
      { x: -0.9, y: 3.85, z: -0.5, sx: 1.1, sy: 0.7, sz: 1.1, r: 1.4 },
    ].forEach((c) => {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(c.r, 12, 10), foliageMat);
      crown.position.set(c.x, c.y, c.z);
      crown.scale.set(c.sx, c.sy, c.sz);
      crown.castShadow = true;
      tree.add(crown);
    });

    // Hanging weeping willow curtain strands
    for (let v = 0; v < 10; v++) {
      const ang = (v / 10) * Math.PI * 2;
      const rad = 1.65 + (v % 2) * 0.55;
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 2.3 + (v % 3) * 0.35, 5), vineMat);
      vine.position.set(Math.cos(ang) * rad, 2.55, Math.sin(ang) * rad);
      tree.add(vine);
    }

    // Glowing bioluminescent fairy mushrooms on trunk
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
    // Detailed 5-tier Alpine Pine
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2316, roughness: 0.88 });
    const needleMat = new THREE.MeshStandardMaterial({ color: 0x1c4932, roughness: 0.72 });
    const snowDustMat = new THREE.MeshStandardMaterial({ color: 0xe6eff6, roughness: 0.55 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.38, 4.8, 8), trunkMat);
    trunk.position.set(0, 2.4, 0);
    trunk.castShadow = true;
    tree.add(trunk);

    for (let c = 0; c < 5; c++) {
      const radius = 1.95 - c * 0.32;
      const height = 1.65 - c * 0.1;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 9), needleMat);
      cone.position.set(0, 2.4 + c * 0.92, 0);
      cone.rotation.y = c * 0.4;
      cone.castShadow = true;
      tree.add(cone);

      // Subtle snow tip on upper boughs
      if (c >= 3) {
        const snowTip = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.52, height * 0.48, 9), snowDustMat);
        snowTip.position.set(0, 2.4 + c * 0.92 + height * 0.27, 0);
        snowTip.rotation.y = c * 0.4;
        tree.add(snowTip);
      }
    }
  }

  return tree;
}
