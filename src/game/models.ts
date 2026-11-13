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

export function createHorseAndRider(
  horse: HorseProfile,
  rider: RiderProfile,
  palette: MaterialPalette
): HorseRig {
  const root = new THREE.Group();
  root.name = 'HorseAndRiderRoot';

  const horseGroup = new THREE.Group();
  root.add(horseGroup);

  // Materials
  const coatMat = palette.getHorseCoatMaterial(horse.coat);
  const maneMat = palette.getManeMaterial(horse.maneColor);
  const blanketMat = palette.getBlanketMaterial(horse.blanketColor);
  const hoofMat = new THREE.MeshStandardMaterial({ color: 0x1f1f23, roughness: 0.6, metalness: 0.2 });
  const horseshoeMat = new THREE.MeshStandardMaterial({ color: 0x99a2ad, roughness: 0.3, metalness: 0.8 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.45, metalness: 0.1 });
  const silverMat = new THREE.MeshStandardMaterial({ color: 0xdde2e8, roughness: 0.2, metalness: 0.9 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0f0e0c, roughness: 0.1, metalness: 0.1 });

  // 1. HORSE BODY (Torso / Barrel)
  const barrelGeo = new THREE.CylinderGeometry(0.55, 0.58, 1.6, 12);
  barrelGeo.rotateX(Math.PI / 2);
  const barrel = new THREE.Mesh(barrelGeo, coatMat);
  barrel.position.set(0, 1.45, 0);
  barrel.castShadow = true;
  barrel.receiveShadow = true;
  horseGroup.add(barrel);

  // Flank / chest curve
  const chestGeo = new THREE.SphereGeometry(0.58, 10, 10);
  const chest = new THREE.Mesh(chestGeo, coatMat);
  chest.position.set(0, 1.45, 0.7);
  chest.scale.set(0.95, 1.05, 1.0);
  chest.castShadow = true;
  horseGroup.add(chest);

  const rumpGeo = new THREE.SphereGeometry(0.62, 10, 10);
  const rump = new THREE.Mesh(rumpGeo, coatMat);
  rump.position.set(0, 1.48, -0.72);
  rump.scale.set(0.95, 1.05, 1.1);
  rump.castShadow = true;
  horseGroup.add(rump);

  // 2. NECK & HEAD GROUP (pivots from shoulder)
  const headNeckGroup = new THREE.Group();
  headNeckGroup.position.set(0, 1.65, 0.75);
  horseGroup.add(headNeckGroup);

  // Neck
  const neckGeo = new THREE.CylinderGeometry(0.3, 0.44, 1.15, 10);
  neckGeo.rotateX(-Math.PI * 0.28);
  const neck = new THREE.Mesh(neckGeo, coatMat);
  neck.position.set(0, 0.45, 0.32);
  neck.castShadow = true;
  headNeckGroup.add(neck);

  // Mane on neck
  const maneGroup = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const maneLock = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.38, 5),
      maneMat
    );
    maneLock.position.set(0, 0.2 + i * 0.12, 0.22 + i * 0.08);
    maneLock.rotation.x = -Math.PI * 0.35;
    maneGroup.add(maneLock);
  }
  headNeckGroup.add(maneGroup);

  // Head group (pivots at top of neck)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.88, 0.65);
  headNeckGroup.add(headGroup);

  // Forehead & muzzle
  const skullGeo = new THREE.BoxGeometry(0.38, 0.42, 0.52);
  const skull = new THREE.Mesh(skullGeo, coatMat);
  skull.position.set(0, 0, 0.1);
  skull.castShadow = true;
  headGroup.add(skull);

  const muzzleGeo = new THREE.BoxGeometry(0.3, 0.32, 0.5);
  const muzzle = new THREE.Mesh(muzzleGeo, coatMat);
  muzzle.position.set(0, -0.15, 0.45);
  muzzle.rotation.x = 0.35;
  muzzle.castShadow = true;
  headGroup.add(muzzle);

  // Nostrils
  const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x3d2c2c, roughness: 0.8 });
  const nostrilL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), nostrilMat);
  nostrilL.position.set(0.1, -0.22, 0.68);
  const nostrilR = nostrilL.clone();
  nostrilR.position.x = -0.1;
  headGroup.add(nostrilL, nostrilR);

  // Eyes
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), eyeMat);
  eyeL.position.set(0.19, 0.08, 0.18);
  const eyeR = eyeL.clone();
  eyeR.position.x = -0.19;
  headGroup.add(eyeL, eyeR);

  // Ears
  const earGeo = new THREE.ConeGeometry(0.07, 0.26, 5);
  const earL = new THREE.Mesh(earGeo, coatMat);
  earL.position.set(0.14, 0.26, -0.05);
  earL.rotation.z = -0.15;
  earL.rotation.x = -0.2;
  const earR = earGeo ? earL.clone() : earL;
  earR.position.x = -0.14;
  earR.rotation.z = 0.15;
  headGroup.add(earL, earR);

  // Forelock mane
  const forelock = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), maneMat);
  forelock.position.set(0, 0.18, 0.28);
  forelock.rotation.x = 0.5;
  headGroup.add(forelock);

  // Bridle & Reins
  const bridleMat = leatherMat;
  const browband = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04), bridleMat);
  browband.position.set(0, 0.12, 0.22);
  headGroup.add(browband);

  const starMedallion = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), silverMat);
  starMedallion.rotation.x = Math.PI / 2;
  starMedallion.position.set(0, 0.12, 0.25);
  headGroup.add(starMedallion);

  // 3. TAIL (multi-part flowing tail)
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 1.7, -1.1);
  horseGroup.add(tailGroup);

  const tailJoint = new THREE.Group();
  tailGroup.add(tailJoint);

  const tailGeo1 = new THREE.CylinderGeometry(0.14, 0.18, 0.65, 7);
  const tailMesh1 = new THREE.Mesh(tailGeo1, maneMat);
  tailMesh1.position.set(0, -0.3, -0.12);
  tailMesh1.rotation.x = 0.35;
  tailMesh1.castShadow = true;
  tailJoint.add(tailMesh1);

  const tailGeo2 = new THREE.CylinderGeometry(0.18, 0.12, 0.8, 7);
  const tailMesh2 = new THREE.Mesh(tailGeo2, maneMat);
  tailMesh2.position.set(0, -0.85, -0.25);
  tailMesh2.rotation.x = 0.2;
  tailMesh2.castShadow = true;
  tailJoint.add(tailMesh2);

  // 4. ARTICULATED LEGS
  function buildLeg(isFront: boolean, isLeft: boolean) {
    const legRoot = new THREE.Group();
    const xPos = (isLeft ? 1 : -1) * (isFront ? 0.36 : 0.38);
    const zPos = isFront ? 0.65 : -0.7;
    legRoot.position.set(xPos, 1.35, zPos);
    horseGroup.add(legRoot);

    const upperLeg = new THREE.Group();
    legRoot.add(upperLeg);

    const upperLength = isFront ? 0.65 : 0.72;
    const upperGeo = new THREE.CylinderGeometry(0.14, 0.11, upperLength, 8);
    const upperMesh = new THREE.Mesh(upperGeo, coatMat);
    upperMesh.position.set(0, -upperLength / 2, 0);
    upperMesh.castShadow = true;
    upperLeg.add(upperMesh);

    // Knee / Hock joint
    const kneeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), coatMat);
    kneeMesh.position.set(0, -upperLength, 0);
    upperLeg.add(kneeMesh);

    // Lower leg
    const lowerLeg = new THREE.Group();
    lowerLeg.position.set(0, -upperLength, 0);
    upperLeg.add(lowerLeg);

    const lowerLength = isFront ? 0.65 : 0.6;
    const lowerGeo = new THREE.CylinderGeometry(0.1, 0.08, lowerLength, 8);
    const lowerMesh = new THREE.Mesh(lowerGeo, coatMat);
    lowerMesh.position.set(0, -lowerLength / 2, 0);
    lowerMesh.castShadow = true;
    lowerLeg.add(lowerMesh);

    // Fetlock & Hoof
    const hoofGroup = new THREE.Group();
    hoofGroup.position.set(0, -lowerLength, 0);
    lowerLeg.add(hoofGroup);

    const hoofGeo = new THREE.CylinderGeometry(0.09, 0.12, 0.14, 8);
    const hoofMesh = new THREE.Mesh(hoofGeo, hoofMat);
    hoofMesh.position.set(0, -0.07, 0.02);
    hoofMesh.castShadow = true;
    hoofGroup.add(hoofMesh);

    const shoeGeo = new THREE.TorusGeometry(0.1, 0.02, 6, 8, Math.PI * 1.5);
    shoeGeo.rotateX(Math.PI / 2);
    const shoeMesh = new THREE.Mesh(shoeGeo, horseshoeMat);
    shoeMesh.position.set(0, -0.13, 0.02);
    hoofGroup.add(shoeMesh);

    return { upper: upperLeg, lower: lowerLeg, hoof: hoofMesh };
  }

  const legFL = buildLeg(true, true);
  const legFR = buildLeg(true, false);
  const legRL = buildLeg(false, true);
  const legRR = buildLeg(false, false);

  // 5. SADDLE, BLANKET & STIRRUPS
  const blanketGeo = new THREE.CylinderGeometry(0.57, 0.59, 0.9, 10, 1, false, Math.PI * 0.1, Math.PI * 0.8);
  blanketGeo.rotateZ(Math.PI / 2);
  const blanket = new THREE.Mesh(blanketGeo, blanketMat);
  blanket.position.set(0, 1.48, -0.05);
  blanket.castShadow = true;
  horseGroup.add(blanket);

  const saddleSeatGeo = new THREE.BoxGeometry(0.55, 0.22, 0.65);
  const saddle = new THREE.Mesh(saddleSeatGeo, leatherMat);
  saddle.position.set(0, 1.95, -0.05);
  saddle.castShadow = true;
  horseGroup.add(saddle);

  // Stirrup leathers & irons
  const stirrupIronGeo = new THREE.TorusGeometry(0.07, 0.015, 6, 8);
  const stirrupL = new THREE.Mesh(stirrupIronGeo, silverMat);
  stirrupL.position.set(0.48, 1.25, -0.02);
  const stirrupR = stirrupL.clone();
  stirrupR.position.x = -0.48;
  horseGroup.add(stirrupL, stirrupR);

  // 6. RIDER MODEL (Hobbit/Girl Adventurer)
  const riderGroup = new THREE.Group();
  riderGroup.position.set(0, 1.95, -0.05);
  horseGroup.add(riderGroup);

  const hairMat = palette.getRiderHairMaterial(rider.hairColor);
  const outfitMat = palette.getRiderOutfitMaterial(rider.outfitColor);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xfad6bf, roughness: 0.6 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x241711, roughness: 0.4 });

  const riderTorso = new THREE.Group();
  riderGroup.add(riderTorso);

  // Torso / Jacket
  const bodyGeo = new THREE.BoxGeometry(0.42, 0.55, 0.3);
  const bodyMesh = new THREE.Mesh(bodyGeo, outfitMat);
  bodyMesh.position.set(0, 0.35, 0);
  bodyMesh.castShadow = true;
  riderTorso.add(bodyMesh);

  // Cloak / Jacket tails draping back
  const cloakGeo = new THREE.BoxGeometry(0.44, 0.45, 0.08);
  const cloakMesh = new THREE.Mesh(cloakGeo, outfitMat);
  cloakMesh.position.set(0, 0.2, -0.16);
  cloakMesh.rotation.x = 0.2;
  riderTorso.add(cloakMesh);

  // Head & Neck
  const riderHead = new THREE.Group();
  riderHead.position.set(0, 0.72, 0);
  riderTorso.add(riderHead);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), skinMat);
  headMesh.castShadow = true;
  riderHead.add(headMesh);

  // Rider Eyes
  const riderEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eyeMat);
  riderEyeL.position.set(0.07, 0.03, 0.16);
  const riderEyeR = riderEyeL.clone();
  riderEyeR.position.x = -0.07;
  riderHead.add(riderEyeL, riderEyeR);

  // Hair & Braid
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.65), hairMat);
  hairCap.position.set(0, 0.04, -0.02);
  riderHead.add(hairCap);

  // Long flowing braid / ponytail
  const braidGeo = new THREE.CylinderGeometry(0.06, 0.03, 0.6, 6);
  const braid = new THREE.Mesh(braidGeo, hairMat);
  braid.position.set(0, -0.18, -0.2);
  braid.rotation.x = -0.3;
  riderHead.add(braid);

  // Elven Star Brooch on chest (glowing)
  const broochGeo = new THREE.OctahedronGeometry(0.06, 0);
  const broochMat = new THREE.MeshStandardMaterial({
    color: 0x99f6ff,
    emissive: 0x44d7ff,
    emissiveIntensity: 0.8,
    roughness: 0.1,
    metalness: 0.9,
  });
  const starBrooch = new THREE.Mesh(broochGeo, broochMat);
  starBrooch.position.set(0, 0.45, 0.17);
  riderTorso.add(starBrooch);

  const starLight = new THREE.PointLight(0x7df9ff, 0.8, 4);
  starLight.position.set(0, 0.45, 0.3);
  riderTorso.add(starLight);

  // Arms holding reins
  const armGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.45, 6);
  armGeo.rotateZ(Math.PI / 8);

  const riderArmL = new THREE.Group();
  riderArmL.position.set(0.24, 0.48, 0.05);
  riderArmL.rotation.x = 0.65;
  const armMeshL = new THREE.Mesh(armGeo, outfitMat);
  armMeshL.position.set(0, -0.2, 0);
  riderArmL.add(armMeshL);
  // Hand
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), skinMat);
  handL.position.set(0.08, -0.4, 0);
  riderArmL.add(handL);
  riderTorso.add(riderArmL);

  const riderArmR = new THREE.Group();
  riderArmR.position.set(-0.24, 0.48, 0.05);
  riderArmR.rotation.x = 0.65;
  const armMeshR = new THREE.Mesh(armGeo, outfitMat);
  armMeshR.position.set(0, -0.2, 0);
  riderArmR.add(armMeshR);
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), skinMat);
  handR.position.set(-0.08, -0.4, 0);
  riderArmR.add(handR);
  riderTorso.add(riderArmR);

  // Legs in stirrups (sitting on saddle)
  const riderLegL = new THREE.Group();
  riderLegL.position.set(0.26, 0.15, 0);
  riderLegL.rotation.x = 0.45;
  riderLegL.rotation.z = -0.2;
  const thighL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.45, 6), outfitMat);
  thighL.position.set(0, -0.2, 0);
  riderLegL.add(thighL);
  const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.22), bootMat);
  bootL.position.set(0, -0.45, 0.06);
  riderLegL.add(bootL);
  riderGroup.add(riderLegL);

  const riderLegR = new THREE.Group();
  riderLegR.position.set(-0.26, 0.15, 0);
  riderLegR.rotation.x = 0.45;
  riderLegR.rotation.z = 0.2;
  const thighR = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.45, 6), outfitMat);
  thighR.position.set(0, -0.2, 0);
  riderLegR.add(thighR);
  const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.22), bootMat);
  bootR.position.set(0, -0.45, 0.06);
  riderLegR.add(bootR);
  riderGroup.add(riderLegR);

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

  const hairMat = palette.getRiderHairMaterial(rider.hairColor);
  const outfitMat = palette.getRiderOutfitMaterial(rider.outfitColor);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xfad6bf, roughness: 0.6 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x241711, roughness: 0.4 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0f0e0c, roughness: 0.1, metalness: 0.1 });

  // Torso group (hip pivot at y = 0.85)
  const torso = new THREE.Group();
  torso.position.set(0, 0.85, 0);
  root.add(torso);

  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.3), outfitMat);
  bodyMesh.position.set(0, 0.3, 0);
  bodyMesh.castShadow = true;
  torso.add(bodyMesh);

  const cloakMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.08), outfitMat);
  cloakMesh.position.set(0, 0.2, -0.16);
  cloakMesh.rotation.x = 0.12;
  torso.add(cloakMesh);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 0.68, 0);
  torso.add(head);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), skinMat);
  headMesh.castShadow = true;
  head.add(headMesh);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eyeMat);
  eyeL.position.set(0.07, 0.03, 0.16);
  const eyeR = eyeL.clone();
  eyeR.position.x = -0.07;
  head.add(eyeL, eyeR);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.65),
    hairMat
  );
  hairCap.position.set(0, 0.04, -0.02);
  head.add(hairCap);

  const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.6, 6), hairMat);
  braid.position.set(0, -0.18, -0.2);
  braid.rotation.x = -0.25;
  head.add(braid);

  // Star brooch
  const broochMat = new THREE.MeshStandardMaterial({
    color: 0x99f6ff,
    emissive: 0x44d7ff,
    emissiveIntensity: 0.8,
    roughness: 0.1,
    metalness: 0.9,
  });
  const starBrooch = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), broochMat);
  starBrooch.position.set(0, 0.4, 0.17);
  torso.add(starBrooch);

  // Arms
  const armGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.48, 6);
  const armL = new THREE.Group();
  armL.position.set(0.26, 0.48, 0);
  const armMeshL = new THREE.Mesh(armGeo, outfitMat);
  armMeshL.position.set(0, -0.22, 0);
  armMeshL.castShadow = true;
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), skinMat);
  handL.position.set(0, -0.46, 0);
  armL.add(armMeshL, handL);
  torso.add(armL);

  const armR = new THREE.Group();
  armR.position.set(-0.26, 0.48, 0);
  const armMeshR = new THREE.Mesh(armGeo, outfitMat);
  armMeshR.position.set(0, -0.22, 0);
  armMeshR.castShadow = true;
  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), skinMat);
  handR.position.set(0, -0.46, 0);
  armR.add(armMeshR, handR);
  torso.add(armR);

  // Standing Legs
  function buildStandingLeg(x: number) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.85, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.45, 6), outfitMat);
    thigh.position.set(0, -0.22, 0);
    thigh.castShadow = true;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.2), bootMat);
    boot.position.set(0, -0.63, 0.03);
    boot.castShadow = true;
    leg.add(thigh, boot);
    root.add(leg);
    return leg;
  }

  const legL = buildStandingLeg(0.12);
  const legR = buildStandingLeg(-0.12);

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
// FELEK THE FOX (Cute stylized friendly fox)
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

  const furMat = new THREE.MeshStandardMaterial({ color: 0xdf5a1a, roughness: 0.55 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xfcfcfc, roughness: 0.5 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4 });

  // Body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.65, 8), furMat);
  body.rotateX(Math.PI / 2);
  body.position.set(0, 0.42, 0);
  body.castShadow = true;
  root.add(body);

  // White chest bib
  const bib = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 8, 0, Math.PI, 0, Math.PI * 0.5), whiteMat);
  bib.position.set(0, 0.44, 0.2);
  bib.rotation.x = Math.PI * 0.4;
  root.add(bib);

  // Head
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.58, 0.35);
  root.add(headGroup);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), furMat);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Cheeks
  const cheekL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), whiteMat);
  cheekL.position.set(0.12, -0.03, 0.08);
  const cheekR = cheekL.clone();
  cheekR.position.x = -0.12;
  headGroup.add(cheekL, cheekR);

  // Snout
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), whiteMat);
  snout.position.set(0, -0.04, 0.22);
  snout.rotation.x = Math.PI / 2;
  headGroup.add(snout);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), blackMat);
  nose.position.set(0, -0.04, 0.33);
  headGroup.add(nose);

  // Cute dark eyes
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), blackMat);
  eyeL.position.set(0.09, 0.06, 0.12);
  const eyeR = eyeL.clone();
  eyeR.position.x = -0.09;
  headGroup.add(eyeL, eyeR);

  // Perky triangular ears
  const earGeo = new THREE.ConeGeometry(0.07, 0.2, 4);
  const earL = new THREE.Mesh(earGeo, furMat);
  earL.position.set(0.11, 0.18, -0.02);
  earL.rotation.z = -0.2;
  const earBackL = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), blackMat);
  earBackL.position.set(0, 0, -0.02);
  earL.add(earBackL);
  const earR = earL.clone();
  earR.position.x = -0.11;
  earR.rotation.z = 0.2;
  headGroup.add(earL, earR);

  // Big Bushy Tail
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.48, -0.32);
  root.add(tailGroup);

  const tailBase = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.45, 8), furMat);
  tailBase.position.set(0, 0.1, -0.2);
  tailBase.rotation.x = -Math.PI * 0.7;
  tailGroup.add(tailBase);

  const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 8), whiteMat);
  tailTip.position.set(0, 0.22, -0.42);
  tailTip.rotation.x = -Math.PI * 0.7;
  tailGroup.add(tailTip);

  // Legs (articulated)
  function buildFoxLeg(x: number, z: number) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.36, z);
    const paw = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.36, 6), blackMat);
    paw.position.set(0, -0.18, 0);
    paw.castShadow = true;
    leg.add(paw);
    root.add(leg);
    return leg;
  }

  const legFL = buildFoxLeg(0.12, 0.2);
  const legFR = buildFoxLeg(-0.12, 0.2);
  const legRL = buildFoxLeg(0.12, -0.22);
  const legRR = buildFoxLeg(-0.12, -0.22);

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
// MONSTERS (Troll, Orc, Goblin)
// -------------------------------------------------------------
export function createMonsterModel(type: 'goblin' | 'orc' | 'troll'): THREE.Group {
  const group = new THREE.Group();

  if (type === 'troll') {
    // Massive Mossy Stone Troll
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5b6358, roughness: 0.85 });
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x3d5c2e, roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x422817, roughness: 0.7 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffd000, emissive: 0xff9900, emissiveIntensity: 0.6 });

    // Torso
    const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 1), stoneMat);
    torso.position.set(0, 2.2, 0);
    torso.castShadow = true;
    group.add(torso);

    // Moss layer on shoulders
    const mossPatch = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 6), mossMat);
    mossPatch.position.set(0, 2.8, -0.3);
    group.add(mossPatch);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.8), stoneMat);
    head.position.set(0, 3.2, 0.4);
    head.castShadow = true;
    group.add(head);

    // Eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), eyeMat);
    eyeL.position.set(0.24, 3.3, 0.8);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.24;
    group.add(eyeL, eyeR);

    // Big club in hand
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 2.8, 6), woodMat);
    club.position.set(1.4, 2.0, 0.5);
    club.rotation.z = -0.4;
    club.castShadow = true;
    group.add(club);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.4, 6);
    const legL = new THREE.Mesh(legGeo, stoneMat);
    legL.position.set(0.55, 0.7, 0);
    legL.castShadow = true;
    const legR = legL.clone();
    legR.position.x = -0.55;
    group.add(legL, legR);

  } else if (type === 'orc') {
    // Spiky Armored Orc
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x5a6341, roughness: 0.65 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.7 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.5), armorMat);
    torso.position.set(0, 1.4, 0);
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), skinMat);
    head.position.set(0, 2.15, 0);
    group.add(head);

    // Horned helmet
    const helm = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.35, 6), armorMat);
    helm.position.set(0, 2.4, 0);
    group.add(helm);

    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), eyeMat);
    eyeL.position.set(0.14, 2.18, 0.3);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.14;
    group.add(eyeL, eyeR);

    // Shield
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 8), armorMat);
    shield.rotation.x = Math.PI / 2;
    shield.position.set(-0.65, 1.4, 0.25);
    group.add(shield);

    // Sword
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.04), armorMat);
    sword.position.set(0.65, 1.3, 0.2);
    sword.rotation.z = -0.3;
    group.add(sword);

    const legGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.9, 6);
    const legL = new THREE.Mesh(legGeo, armorMat);
    legL.position.set(0.24, 0.45, 0);
    const legR = legL.clone();
    legR.position.x = -0.24;
    group.add(legL, legR);

  } else {
    // Cave Goblin
    const gobMat = new THREE.MeshStandardMaterial({ color: 0x486b45, roughness: 0.7 });
    const ragMat = new THREE.MeshStandardMaterial({ color: 0x3d281a, roughness: 0.8 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 0.8 });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.7, 6), ragMat);
    torso.position.set(0, 0.85, 0);
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 7), gobMat);
    head.position.set(0, 1.35, 0.05);
    group.add(head);

    // Long goblin ears
    const earGeo = new THREE.ConeGeometry(0.08, 0.35, 4);
    const earL = new THREE.Mesh(earGeo, gobMat);
    earL.position.set(0.24, 1.4, -0.02);
    earL.rotation.z = -Math.PI / 3;
    const earR = earL.clone();
    earR.position.x = -0.24;
    earR.rotation.z = Math.PI / 3;
    group.add(earL, earR);

    // Big shiny eyes
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 5), eyeMat);
    eyeL.position.set(0.1, 1.38, 0.22);
    const eyeR = eyeL.clone();
    eyeR.position.x = -0.1;
    group.add(eyeL, eyeR);

    // Staff
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5), ragMat);
    staff.position.set(0.38, 0.8, 0.15);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), eyeMat);
    gem.position.set(0.38, 1.55, 0.15);
    group.add(staff, gem);

    const legGeo = new THREE.CylinderGeometry(0.1, 0.08, 0.55, 5);
    const legL = new THREE.Mesh(legGeo, gobMat);
    legL.position.set(0.14, 0.28, 0);
    const legR = legL.clone();
    legR.position.x = -0.14;
    group.add(legL, legR);
  }

  // Soft warning telegraph circle on the ground
  const ringGeo = new THREE.RingGeometry(2.0, 2.2, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff3344,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
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

  const grassMat = new THREE.MeshStandardMaterial({ color: 0x4e8538, roughness: 0.75 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2a16, roughness: 0.6 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x226b3a, roughness: 0.4 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.2, metalness: 0.9 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7d76, roughness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffe89e, emissive: 0xffb733, emissiveIntensity: 0.5 });

  // Turf hill mound
  const hill = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), grassMat);
  hill.position.set(0, 0, 0);
  hill.scale.set(1.4, 0.8, 1.4);
  hill.castShadow = true;
  hill.receiveShadow = true;
  group.add(hill);

  // Stone retaining front wall facade
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 2.8, 12, 1, false, -Math.PI * 0.35, Math.PI * 0.7), stoneMat);
  wall.position.set(0, 1.2, 5.0);
  wall.castShadow = true;
  group.add(wall);

  // Iconic Round Hobbit Door
  const doorArch = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.12, 8, 20), stoneMat);
  doorArch.position.set(0, 1.4, 5.25);
  group.add(doorArch);

  const door = new THREE.Mesh(new THREE.CircleGeometry(1.15, 20), doorMat);
  door.position.set(0, 1.4, 5.26);
  group.add(door);

  // Center brass knob
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), brassMat);
  knob.position.set(0, 1.4, 5.35);
  group.add(knob);

  // Round window
  const windowArch = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 8, 16), stoneMat);
  windowArch.position.set(2.2, 1.5, 4.8);
  const windowGlass = new THREE.Mesh(new THREE.CircleGeometry(0.52, 16), glassMat);
  windowGlass.position.set(2.2, 1.5, 4.82);
  group.add(windowArch, windowGlass);

  // Brick Chimney
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.7), stoneMat);
  chimney.position.set(-1.8, 3.5, 1.5);
  chimney.castShadow = true;
  group.add(chimney);

  // Wooden fence
  for (let i = -3; i <= 3; i++) {
    if (Math.abs(i) <= 1) continue; // Door passage
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 5), woodMat);
    post.position.set(i * 1.2, 0.45, 6.2);
    post.castShadow = true;
    group.add(post);
  }

  return group;
}

export function createAbandonedStable(): THREE.Group {
  const group = new THREE.Group();

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4f3724, roughness: 0.7 });
  const thatchMat = new THREE.MeshStandardMaterial({ color: 0x7c694a, roughness: 0.85 });
  const hayMat = new THREE.MeshStandardMaterial({ color: 0xc4a747, roughness: 0.8 });
  const appleMat = new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.35, emissive: 0x330000 });
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffaa00, emissiveIntensity: 0.9 });

  // Main posts
  const postGeo = new THREE.BoxGeometry(0.3, 3.2, 0.3);
  const postPositions = [
    [-3, 1.6, -2], [3, 1.6, -2],
    [-3, 1.6, 2], [3, 1.6, 2],
    [0, 1.6, -2], [0, 1.6, 2],
  ];
  postPositions.forEach(([x, y, z]) => {
    const post = new THREE.Mesh(postGeo, woodMat);
    post.position.set(x, y, z);
    post.castShadow = true;
    group.add(post);
  });

  // Crossbeams
  const beamLong = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.25, 0.25), woodMat);
  beamLong.position.set(0, 3.1, -2);
  const beamLong2 = beamLong.clone();
  beamLong2.position.z = 2;
  group.add(beamLong, beamLong2);

  // Slanted Roof with weathered holes
  const roofL = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.15, 4.6), thatchMat);
  roofL.position.set(-1.6, 3.8, 0);
  roofL.rotation.z = 0.35;
  roofL.castShadow = true;

  const roofR = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.15, 4.6), thatchMat);
  roofR.position.set(1.6, 3.8, 0);
  roofR.rotation.z = -0.35;
  roofR.castShadow = true;
  group.add(roofL, roofR);

  // Hay bales on floor
  for (let b = 0; b < 4; b++) {
    const bale = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), hayMat);
    bale.position.set(-1.8 + (b % 2) * 1.1, 0.35, -0.8 + Math.floor(b / 2) * 1.0);
    bale.castShadow = true;
    group.add(bale);
  }

  // Feed trough with juicy apples!
  const trough = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.6), woodMat);
  trough.position.set(1.6, 0.45, -1.2);
  group.add(trough);

  // Apples inside trough
  for (let a = 0; a < 6; a++) {
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 7), appleMat);
    apple.position.set(1.0 + a * 0.22, 0.7, -1.2 + (a % 2 === 0 ? 0.06 : -0.06));
    apple.castShadow = true;
    group.add(apple);
  }

  // Warm hanging lantern
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.35, 6), lanternMat);
  lantern.position.set(0, 2.5, 2.0);
  const lanternLight = new THREE.PointLight(0xffaa33, 1.5, 8);
  lanternLight.position.set(0, 2.4, 2.0);
  group.add(lantern, lanternLight);

  return group;
}

export function createCampfireSite(): THREE.Group {
  const group = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5d61, roughness: 0.9 });
  const logMat = new THREE.MeshStandardMaterial({ color: 0x3d2616, roughness: 0.8 });
  const tentMat = new THREE.MeshStandardMaterial({ color: 0xbdb7ab, roughness: 0.6 });
  const emberMat = new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff3300, emissiveIntensity: 1.2 });

  // Stone ring
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + Math.random() * 0.05), stoneMat);
    stone.position.set(Math.cos(angle) * 0.75, 0.12, Math.sin(angle) * 0.75);
    stone.castShadow = true;
    group.add(stone);
  }

  // Fire logs
  for (let j = 0; j < 4; j++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), logMat);
    log.position.set(0, 0.18, 0);
    log.rotation.x = 0.3;
    log.rotation.y = (j / 4) * Math.PI * 2;
    group.add(log);
  }

  // Glowing fire core
  const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), emberMat);
  core.position.set(0, 0.3, 0);
  group.add(core);

  const fireLight = new THREE.PointLight(0xff7722, 2.5, 12);
  fireLight.position.set(0, 0.6, 0);
  group.add(fireLight);

  // Cozy Canvas Tent (A-frame)
  const tentGeo = new THREE.ConeGeometry(1.6, 2.2, 4);
  tentGeo.rotateY(Math.PI / 4);
  const tent = new THREE.Mesh(tentGeo, tentMat);
  tent.position.set(2.4, 1.1, 1.2);
  tent.scale.set(1.2, 1.0, 1.6);
  tent.castShadow = true;
  group.add(tent);

  // Bedroll
  const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x4a5d4e }));
  bedroll.rotateZ(Math.PI / 2);
  bedroll.position.set(2.4, 0.16, -0.6);
  group.add(bedroll);

  return group;
}

export function createLonelyMountainModel(): THREE.Group {
  const group = new THREE.Group();

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4f59, roughness: 0.95 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf5f8fc, roughness: 0.4 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0xffb700,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.8,
  });

  // Massive mountain body
  const basePeak = new THREE.Mesh(new THREE.ConeGeometry(90, 180, 12), rockMat);
  basePeak.position.set(0, 90, 0);
  group.add(basePeak);

  // Snow cap
  const snowCap = new THREE.Mesh(new THREE.ConeGeometry(38, 75, 12), snowMat);
  snowCap.position.set(0, 145, 0);
  group.add(snowCap);

  // Side ridges
  const ridgeL = new THREE.Mesh(new THREE.ConeGeometry(60, 120, 8), rockMat);
  ridgeL.position.set(-65, 60, -20);
  const ridgeR = new THREE.Mesh(new THREE.ConeGeometry(55, 110, 8), rockMat);
  ridgeR.position.set(60, 55, -25);
  group.add(ridgeL, ridgeR);

  // Grand Dwarven Gate of Erebor
  const gateArch = new THREE.Mesh(new THREE.BoxGeometry(22, 28, 6), rockMat);
  gateArch.position.set(0, 14, 55);
  group.add(gateArch);

  // Carved Dwarven Sentinel Pillars
  const pillarGeo = new THREE.CylinderGeometry(2.5, 3.2, 24, 6);
  const pillarL = new THREE.Mesh(pillarGeo, rockMat);
  pillarL.position.set(-12, 12, 58);
  const pillarR = pillarL.clone();
  pillarR.position.x = 12;
  group.add(pillarL, pillarR);

  // Golden Celestial Beacon at the Peak
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(5, 0), goldMat);
  beacon.position.set(0, 182, 0);
  group.add(beacon);

  const beaconLight = new THREE.PointLight(0xffea75, 5, 200);
  beaconLight.position.set(0, 185, 0);
  group.add(beaconLight);

  return group;
}

export function createTree(type: 'apple' | 'willow' | 'pine'): THREE.Group {
  const tree = new THREE.Group();

  if (type === 'apple') {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x543825, roughness: 0.8 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x3d7a2e, roughness: 0.65 });
    const appleMat = new THREE.MeshStandardMaterial({ color: 0xd92626, roughness: 0.3 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.2, 7), trunkMat);
    trunk.position.set(0, 1.1, 0);
    trunk.castShadow = true;
    tree.add(trunk);

    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 1), foliageMat);
    crown.position.set(0, 2.8, 0);
    crown.castShadow = true;
    tree.add(crown);

    // Scattered apples
    for (let i = 0; i < 5; i++) {
      const apple = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 5), appleMat);
      const angle = (i / 5) * Math.PI * 2;
      apple.position.set(Math.cos(angle) * 1.1, 2.4 + (i % 2) * 0.4, Math.sin(angle) * 1.1);
      tree.add(apple);
    }

  } else if (type === 'willow') {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3e3832, roughness: 0.9 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x225e4d, roughness: 0.6 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 3.5, 8), trunkMat);
    trunk.position.set(0, 1.75, 0);
    trunk.castShadow = true;
    tree.add(trunk);

    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 8), foliageMat);
    crown.position.set(0, 4.0, 0);
    crown.scale.set(1.3, 0.8, 1.3);
    crown.castShadow = true;
    tree.add(crown);

    // Glowing fairy mushroom on trunk
    const shroom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.05, 0.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x14b8a6, emissiveIntensity: 0.7 })
    );
    shroom.position.set(0.4, 1.4, 0);
    shroom.rotation.z = -Math.PI / 4;
    tree.add(shroom);

  } else {
    // Pine
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2216, roughness: 0.85 });
    const needleMat = new THREE.MeshStandardMaterial({ color: 0x1d4732, roughness: 0.7 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 4.5, 6), trunkMat);
    trunk.position.set(0, 2.25, 0);
    trunk.castShadow = true;
    tree.add(trunk);

    for (let c = 0; c < 3; c++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8 - c * 0.4, 2.0, 7), needleMat);
      cone.position.set(0, 3.0 + c * 1.2, 0);
      cone.castShadow = true;
      tree.add(cone);
    }
  }

  return tree;
}
