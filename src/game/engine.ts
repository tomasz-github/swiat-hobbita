import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  HorseProfile,
  RiderProfile,
  Gait,
  ActiveMonster,
  AbandonedStable,
  FoxActor,
} from './types';
import { MaterialPalette, createStarParticleTexture } from './materials';
import {
  createHorseAndRider,
  createStandaloneRider,
  createFoxModel,
  createMonsterModel,
  createHobbitBurrow,
  createHobbitCottage,
  createVillageWell,
  createVillageLanternPost,
  createHobbitWagon,
  createThicketBush,
  createAbandonedStable,
  createCampfireSite,
  createLonelyMountainModel,
  createTree,
  HorseRig,
  StandaloneRiderRig,
  FoxRig,
} from './models';
import {
  getTerrainHeight,
  getRoadCenter,
  createWorldTerrain,
  createInstancedFlora,
  createInstancedRocks,
  WORLD_LENGTH,
  WORLD_WIDTH,
  WORLD_MILESTONES,
} from './terrain';
import { soundEngine } from './audio';

export type CruisingGait = 'walk' | 'trot' | 'canter' | 'gallop';

export interface GameEngineCallbacks {
  onSpeedChange: (speedKmh: number, gait: Gait) => void;
  onTargetGaitChange: (gait: CruisingGait) => void;
  onDismountChange: (isDismounted: boolean) => void;
  onCampChange: (isCamped: boolean) => void;
  onOpenCampMenu: () => void;
  onPositionUpdate: (pos: { x: number; y: number; z: number; heading: number }) => void;
  onTimeChange: (timeOfDay: number, timeLabel: string) => void;
  onStaminaChange: (stamina: number, maxStamina: number) => void;
  onApplesChange: (apples: number) => void;
  onStarsChange: (stars: number) => void;
  onInteractPrompt: (prompt: string | null) => void;
  onMilestoneReached: (name: string, description: string) => void;
  onVictory: () => void;
}

export class GameEngine {
  private container: HTMLElement;
  private callbacks: GameEngineCallbacks;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean = false;
  private frameId: number = 0;
  private isDestroyed: boolean = false;

  // Scene Rigs
  private horseRig!: HorseRig;
  private standaloneRiderRig!: StandaloneRiderRig;
  private foxRig!: FoxRig;
  private foxActor: FoxActor = {
    x: 0,
    z: 60,
    targetX: 0,
    targetZ: 60,
    rotation: 0,
    isFriendlyPetted: false,
    state: 'trot',
    animTime: 0,
  };
  private materialPalette: MaterialPalette;

  // Monsters
  private monsters: ActiveMonster[] = [];
  private monsterMeshes: Map<string, THREE.Group> = new Map();

  // Stables & Camp
  private stables: AbandonedStable[] = [
    { id: 'stable_1', x: getRoadCenter(460) + 14, z: 460, name: 'Opuszczona Stajnia pod Dębem', applesRemaining: 5, rested: false },
    { id: 'stable_2', x: getRoadCenter(1350) + 7.5, z: 1350, name: 'Górska Przystań Kucyków', applesRemaining: 6, rested: false },
  ];
  private campObject: THREE.Group | null = null;
  private campPos = new THREE.Vector3();
  public isCamped: boolean = false;
  public isDismounted: boolean = false;

  // Particle systems & Star Burst ('Błysk') VFX
  private starParticles!: THREE.Points;
  private starParticlePositions!: Float32Array;
  private starParticleVelocities!: Float32Array;
  private starShockwaveRing!: THREE.Mesh;
  private starShockwaveRingMat!: THREE.MeshBasicMaterial;
  private starAuraSphere!: THREE.Mesh;
  private starAuraMat!: THREE.MeshBasicMaterial;
  private starBurstLight!: THREE.PointLight;
  private starCastOrigin = new THREE.Vector3();
  private starBurstActive: boolean = false;
  private starBurstTimer: number = 0;
  private readonly starBurstDuration: number = 1.6;

  // Fireflies for night
  private fireflyParticles!: THREE.Points;

  // Sky dome, Sun, Moon, Stars & Clouds
  private skyDomeGroup!: THREE.Group;
  private sunGroup!: THREE.Group;
  private sunCoreMat!: THREE.MeshBasicMaterial;
  private sunHaloMat!: THREE.SpriteMaterial;
  private moonGroup!: THREE.Group;
  private moonMat!: THREE.MeshBasicMaterial;
  private starField!: THREE.Points;
  private starFieldMat!: THREE.PointsMaterial;
  private cloudsGroup!: THREE.Group;
  private cloudMat!: THREE.MeshStandardMaterial;
  private clouds: Array<{ mesh: THREE.Group; speed: number; baseY: number }> = [];

  // Static circular colliders for buildings, dense thickets & tree trunks
  private colliders: Array<{ x: number; z: number; r: number }> = [];
  private lookTargetVec = new THREE.Vector3();

  // Lighting & Day/Night
  private dirSunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private skyFog!: THREE.Fog;
  private timeOfDay: number = 0.35; // 0.0 to 1.0 (0.2 dawn, 0.4 day, 0.7 dusk, 0.9 night)
  private timeCycleSpeed: number = 0.003; // Smooth progression

  // Player / Horse Physics State
  private horsePos = new THREE.Vector3(0, 0, 40);
  private horseHeading: number = 0; // Radians, 0 is facing +Z towards Lonely Mountain
  private riderPos = new THREE.Vector3(0, 0, 40);
  private riderHeading: number = 0;
  private riderSpeed: number = 0;
  private riderStridePhase: number = 0;
  private currentSpeed: number = 0; // m/s
  private targetSpeed: number = 0;
  private selectedGait: CruisingGait = 'canter'; // Default cruising gait with W = Galop!
  private turnInput: number = 0;
  private stridePhase: number = 0;
  private isJumping: boolean = false;
  private jumpVelocityY: number = 0;
  private jumpYOffset: number = 0;
  private idleTime: number = 0;

  // Stats
  private stamina: number = 100;
  private maxStamina: number = 100;
  private applesCollected: number = 3;
  private starShards: number = 0;

  // Camera settings
  private cameraDistance: number = 7.5;
  private cameraHeight: number = 3.6;
  private cameraPitch: number = 0.18;
  private cameraYawOffset: number = 0;
  private isDraggingMouse: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private cameraPreset: 'close' | 'standard' | 'cinematic' = 'standard';

  // Key states
  private keysHeld: Record<string, boolean> = {
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    Space: false,
    ShiftLeft: false,
    ShiftRight: false,
  };

  // Profiles
  private horseProfile: HorseProfile;
  private riderProfile: RiderProfile;

  constructor(
    container: HTMLElement,
    horseProfile: HorseProfile,
    riderProfile: RiderProfile,
    callbacks: GameEngineCallbacks
  ) {
    this.container = container;
    this.horseProfile = horseProfile;
    this.riderProfile = riderProfile;
    this.callbacks = callbacks;

    this.detectSoftwareGl();
    this.initRenderer();
    const maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy() || 4);
    this.materialPalette = new MaterialPalette(maxAniso);
    this.initScene();
    this.initLighting();
    this.initSkyAndClouds();
    this.initWorld();
    this.initParticles();
    this.initInputListeners();
    this.startLoop();
  }

  private detectSoftwareGl() {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) {
        this.isSoftwareGl = true;
        return;
      }
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      this.isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      this.isSoftwareGl = true;
    }
  }

  private initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(54, width / height, 0.3, 2200);
    this.camera.position.set(0, 5, 25);
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.skyFog = new THREE.Fog(0xcce2ff, 45, 450);
    this.scene.fog = this.skyFog;
    this.scene.background = new THREE.Color(0xcce2ff);

    // Mandatory RoomEnvironment for rich PBR reflections on coats & metals
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();
  }

  private initLighting() {
    this.hemiLight = new THREE.HemisphereLight(0xfff7e6, 0x48753e, 0.7);
    this.scene.add(this.hemiLight);

    this.dirSunLight = new THREE.DirectionalLight(0xfffaed, 1.8);
    this.dirSunLight.position.set(35, 70, 30);
    this.dirSunLight.castShadow = !this.isSoftwareGl;

    if (!this.isSoftwareGl) {
      this.dirSunLight.shadow.mapSize.width = 1024;
      this.dirSunLight.shadow.mapSize.height = 1024;
      this.dirSunLight.shadow.camera.near = 0.5;
      this.dirSunLight.shadow.camera.far = 180;
      const d = 26;
      this.dirSunLight.shadow.camera.left = -d;
      this.dirSunLight.shadow.camera.right = d;
      this.dirSunLight.shadow.camera.top = d;
      this.dirSunLight.shadow.camera.bottom = -d;
      this.dirSunLight.shadow.bias = -0.0005;
      this.dirSunLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.dirSunLight);
  }

  private initSkyAndClouds() {
    const glowTex = createStarParticleTexture();
    this.skyDomeGroup = new THREE.Group();
    this.scene.add(this.skyDomeGroup);

    // 1. Twinkling Night Starfield Dome (fog: false so stars remain vivid)
    const starCount = 1100;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    const sWhite = new THREE.Color(0xffffff);
    const sBlue = new THREE.Color(0xbfe3ff);
    const sGold = new THREE.Color(0xffe8a3);

    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.06 + Math.random() * 0.94); // upper sky hemisphere
      const r = 720 + Math.random() * 80;
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.cos(phi);
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const c = i % 5 === 0 ? sGold : i % 3 === 0 ? sBlue : sWhite;
      starCol[i * 3] = c.r;
      starCol[i * 3 + 1] = c.g;
      starCol[i * 3 + 2] = c.b;
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    this.starFieldMat = new THREE.PointsMaterial({
      size: 6.2,
      sizeAttenuation: true,
      vertexColors: true,
      map: glowTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.starField = new THREE.Points(starGeo, this.starFieldMat);
    this.starField.frustumCulled = false;
    this.skyDomeGroup.add(this.starField);

    // 2. Orbiting Sun with Corona Halo
    this.sunGroup = new THREE.Group();
    this.sunCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff4c2, fog: false });
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(26, 20, 16), this.sunCoreMat);
    this.sunHaloMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffd27d,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const sunHalo = new THREE.Sprite(this.sunHaloMat);
    sunHalo.scale.set(175, 175, 1);
    this.sunGroup.add(sunDisc, sunHalo);
    this.skyDomeGroup.add(this.sunGroup);

    // 3. Orbiting Pale Moon at Night
    this.moonGroup = new THREE.Group();
    this.moonMat = new THREE.MeshBasicMaterial({ color: 0xe6f0ff, fog: false });
    const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(18, 18, 14), this.moonMat);
    const moonHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    moonHalo.scale.set(95, 95, 1);
    this.moonGroup.add(moonDisc, moonHalo);
    this.skyDomeGroup.add(this.moonGroup);

    // 4. Drifting Stylized Volumetric 3D Clouds across the Sky
    this.cloudsGroup = new THREE.Group();
    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0.92,
      fog: false,
    });

    const puffGeo = new THREE.SphereGeometry(1, 12, 10);
    for (let c = 0; c < 34; c++) {
      const cloud = new THREE.Group();
      const puffCount = 5 + (c % 3);
      for (let p = 0; p < puffCount; p++) {
        const puff = new THREE.Mesh(puffGeo, this.cloudMat);
        const px = (p - (puffCount - 1) / 2) * (5.2 + Math.random() * 2.5);
        const py = (Math.random() - 0.3) * 3.0;
        const pz = (Math.random() - 0.5) * 6.5;
        const sx = 6.5 + Math.random() * 5.5;
        const sy = 3.2 + Math.random() * 2.4;
        const sz = 5.5 + Math.random() * 4.5;
        puff.position.set(px, py, pz);
        puff.scale.set(sx, sy, sz);
        cloud.add(puff);
      }

      const cx = (Math.random() - 0.5) * 480;
      const cy = 96 + Math.random() * 52;
      const cz = -80 + (c / 34) * (WORLD_LENGTH + 260);
      cloud.position.set(cx, cy, cz);
      this.cloudsGroup.add(cloud);
      this.clouds.push({
        mesh: cloud,
        speed: 1.2 + Math.random() * 1.8,
        baseY: cy,
      });
    }
    this.scene.add(this.cloudsGroup);
  }

  private initWorld() {
    // 1. Terrain Mesh, Instanced Flora & Boulders
    const maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy() || 4);
    const terrain = createWorldTerrain(maxAniso);
    this.scene.add(terrain);

    const flora = createInstancedFlora();
    this.scene.add(flora);

    const rocks = createInstancedRocks(maxAniso);
    this.scene.add(rocks);

    // 2. Horse and Rider + Standalone Dismounted Rider
    this.horseRig = createHorseAndRider(this.horseProfile, this.riderProfile, this.materialPalette);
    this.horsePos.y = getTerrainHeight(this.horsePos.x, this.horsePos.z);
    this.horseRig.group.position.copy(this.horsePos);
    this.scene.add(this.horseRig.group);

    this.standaloneRiderRig = createStandaloneRider(this.riderProfile, this.materialPalette);
    this.standaloneRiderRig.group.visible = false;
    this.scene.add(this.standaloneRiderRig.group);

    // 3. Felek the Fox
    this.foxRig = createFoxModel(this.materialPalette);
    this.foxActor.x = getRoadCenter(65) + 3;
    this.foxActor.z = 65;
    this.foxActor.targetX = this.foxActor.x;
    this.foxActor.targetZ = this.foxActor.z;
    this.foxRig.group.position.set(this.foxActor.x, getTerrainHeight(this.foxActor.x, this.foxActor.z), this.foxActor.z);
    this.scene.add(this.foxRig.group);

    // 4. Expanded Hobbit Settlements & Villages (more homes, cottages, wells, wagons, lanterns)
    const doorPalette = [0x248246, 0x2563eb, 0xd97706, 0x991b1b, 0x0f766e];
    const roofPalette = [0x5c3c28, 0x365314, 0x7c2d12];

    const settlementBurrows: Array<{ z: number; offset: number; rotOffset?: number; doorIdx: number }> = [
      // Village 1: Hobbiton Południowy (z: 55..135)
      { z: 58, offset: -20, doorIdx: 0 },
      { z: 78, offset: 22, doorIdx: 1 },
      { z: 104, offset: -24, doorIdx: 2 },
      { z: 128, offset: 21, doorIdx: 3 },
      { z: 148, offset: -36, doorIdx: 4 },
      // Village 2: Wioska Zielonego Wzgórza (z: 215..365)
      { z: 218, offset: 22, doorIdx: 0 },
      { z: 244, offset: -22, doorIdx: 1 },
      { z: 278, offset: 24, doorIdx: 2 },
      { z: 308, offset: -23, doorIdx: 3 },
      { z: 336, offset: 34, doorIdx: 4 },
      { z: 364, offset: -22, doorIdx: 0 },
    ];

    settlementBurrows.forEach((b) => {
      const roadX = getRoadCenter(b.z);
      const x = roadX + b.offset;
      const y = getTerrainHeight(x, b.z);
      const burrow = createHobbitBurrow(this.materialPalette, doorPalette[b.doorIdx % doorPalette.length]);
      burrow.position.set(x, y, b.z);
      burrow.rotation.y = b.offset > 0 ? -Math.PI * 0.46 : Math.PI * 0.46;
      this.scene.add(burrow);
      this.colliders.push({ x, z: b.z, r: 5.5 });
    });

    // Timber & stone Hobbit Cottages + Forest Ranger Outpost
    const settlementCottages: Array<{ z: number; offset: number; roofIdx: number }> = [
      { z: 68, offset: 15, roofIdx: 0 },
      { z: 118, offset: -16, roofIdx: 1 },
      { z: 232, offset: -16, roofIdx: 2 },
      { z: 268, offset: 15.5, roofIdx: 0 },
      { z: 324, offset: -16, roofIdx: 1 },
      { z: 474, offset: -14, roofIdx: 1 }, // Ranger cottage near Opuszczona Stajnia pod Dębem
    ];

    settlementCottages.forEach((c) => {
      const roadX = getRoadCenter(c.z);
      const x = roadX + c.offset;
      const y = getTerrainHeight(x, c.z);
      const cottage = createHobbitCottage(this.materialPalette, roofPalette[c.roofIdx % roofPalette.length]);
      cottage.position.set(x, y, c.z);
      cottage.rotation.y = c.offset > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.scene.add(cottage);
      this.colliders.push({ x, z: c.z, r: 4.1 });
    });

    // Village Stone Wells
    [
      { z: 92, offset: -9.5 },
      { z: 256, offset: 9.8 },
    ].forEach((w) => {
      const x = getRoadCenter(w.z) + w.offset;
      const y = getTerrainHeight(x, w.z);
      const well = createVillageWell(this.materialPalette);
      well.position.set(x, y, w.z);
      this.scene.add(well);
      this.colliders.push({ x, z: w.z, r: 1.7 });
    });

    // Harvest Wagons loaded with hay & apples
    [
      { z: 100, offset: 9.0, rot: -0.25 },
      { z: 294, offset: -9.2, rot: 0.3 },
      { z: 452, offset: 8.8, rot: -0.4 },
    ].forEach((wg) => {
      const x = getRoadCenter(wg.z) + wg.offset;
      const y = getTerrainHeight(x, wg.z);
      const wagon = createHobbitWagon(this.materialPalette);
      wagon.position.set(x, y, wg.z);
      wagon.rotation.y = wg.rot;
      this.scene.add(wagon);
      this.colliders.push({ x, z: wg.z, r: 2.0 });
    });

    // Glowing Village Lantern Posts lining Shire villages & Stable waystation
    [62, 88, 114, 138, 224, 254, 286, 320, 352, 448, 476].forEach((z, idx) => {
      const side = idx % 2 === 0 ? 1 : -1;
      const x = getRoadCenter(z) + side * 6.0;
      const y = getTerrainHeight(x, z);
      const lanternPost = createVillageLanternPost(this.materialPalette);
      lanternPost.position.set(x, y, z);
      lanternPost.rotation.y = side > 0 ? Math.PI : 0;
      this.scene.add(lanternPost);
      this.colliders.push({ x, z, r: 0.45 });
    });

    // 5. Dense Impassable Forest Thickets (lasy miejscami tak gęste, że nie da się przejechać)
    const thicketZones = [
      { zMin: 265, zMax: 325, side: 1, offMin: 34, offMax: 78, type: 'apple' as const },
      { zMin: 412, zMax: 515, side: -1, offMin: 24, offMax: 74, type: 'willow' as const },
      { zMin: 525, zMax: 635, side: 1, offMin: 12, offMax: 72, type: 'willow' as const },
      { zMin: 615, zMax: 735, side: -1, offMin: 11, offMax: 72, type: 'willow' as const },
      { zMin: 742, zMax: 842, side: 1, offMin: 10, offMax: 72, type: 'pine' as const },
      { zMin: 750, zMax: 845, side: -1, offMin: 10, offMax: 72, type: 'pine' as const },
    ];

    const isInsideDenseThicket = (x: number, z: number): boolean => {
      for (const tz of thicketZones) {
        if (z >= tz.zMin && z <= tz.zMax) {
          const off = (x - getRoadCenter(z)) * tz.side;
          if (off >= tz.offMin - 2 && off <= tz.offMax + 2) return true;
        }
      }
      return false;
    };

    thicketZones.forEach((tz) => {
      for (let z = tz.zMin; z <= tz.zMax; z += 4.0) {
        const roadX = getRoadCenter(z);
        for (let off = tz.offMin; off <= tz.offMax; off += 3.8) {
          const jitterX = (Math.random() - 0.5) * 1.1;
          const jitterZ = (Math.random() - 0.5) * 1.1;
          const x = roadX + tz.side * off + jitterX;
          const zPos = z + jitterZ;

          // Never block settlements or stables
          if (Math.abs(zPos - 460) < 18 && Math.abs(x - roadX) < 22) continue;

          const y = getTerrainHeight(x, zPos);
          const tree = createTree(tz.type, this.materialPalette);
          tree.position.set(x, y, zPos);
          const s = 0.92 + Math.random() * 0.42;
          tree.scale.set(s, s, s);
          tree.rotation.y = Math.random() * Math.PI * 2;
          this.scene.add(tree);
          this.colliders.push({ x, z: zPos, r: 1.75 });

          // Add dense undergrowth bush between trunks so thickets look & feel truly impassable
          if (Math.random() < 0.72) {
            const bx = x + (Math.random() - 0.5) * 2.2;
            const bz = zPos + (Math.random() - 0.5) * 2.2;
            const by = getTerrainHeight(bx, bz);
            const bush = createThicketBush(this.materialPalette);
            bush.position.set(bx, by, bz);
            bush.rotation.y = Math.random() * Math.PI * 2;
            const bs = 0.85 + Math.random() * 0.45;
            bush.scale.set(bs, bs, bs);
            this.scene.add(bush);
            this.colliders.push({ x: bx, z: bz, r: 1.4 });
          }
        }
      }
    });

    // Regular Biome Trees across open meadows, clearings & mountain cliff ledges
    for (let z = 28; z < WORLD_LENGTH - 95; z += 14) {
      const roadX = getRoadCenter(z);
      const inMountains = z >= 870 && z <= 1530;

      if (inMountains) {
        // Place alpine pines only on higher mountain cliff ledges away from narrow trail & stable pocket
        const cliffSign = Math.tanh((1200 - z) / 40);
        const wallSide = -cliffSign;
        const offset = 5.5 + Math.random() * 24;
        const x = roadX + wallSide * offset;
        if (Math.abs(z - 1350) < 16 && Math.abs(x - (getRoadCenter(1350) + 7.5)) < 14) {
          continue;
        }
        const y = getTerrainHeight(x, z);
        const trailY = getTerrainHeight(roadX, z);
        if (y >= trailY - 1.5) {
          const tree = createTree('pine', this.materialPalette);
          tree.position.set(x, y, z);
          const s = 0.78 + Math.random() * 0.45;
          tree.scale.set(s, s, s);
          tree.rotation.y = Math.random() * Math.PI * 2;
          this.scene.add(tree);
          this.colliders.push({ x, z, r: 0.9 });
        }
      } else {
        const type: 'apple' | 'willow' | 'pine' =
          z > 400 && z < 870 ? 'willow' : z >= 1530 ? 'pine' : 'apple';

        [-1, 1].forEach((side) => {
          const nearOffset = 10.5 + Math.random() * 24;
          const farOffset = 42 + Math.random() * 58;
          [nearOffset, farOffset].forEach((offset) => {
            if (offset > 35 && Math.random() > 0.65) return;
            const x = roadX + side * offset;
            if (isInsideDenseThicket(x, z)) return;
            // Keep immediate settlement yards clear of random trees
            if (z < 380 && Math.abs(x - roadX) < 32) return;
            const y = getTerrainHeight(x, z);
            const tree = createTree(type, this.materialPalette);
            tree.position.set(x, y, z);
            const s = 0.8 + Math.random() * 0.48;
            tree.scale.set(s, s, s);
            tree.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(tree);
            this.colliders.push({ x, z, r: 0.9 });
          });
        });
      }
    }

    // 6. Abandoned Stables
    this.stables.forEach((stable) => {
      const stableMesh = createAbandonedStable(this.materialPalette);
      const y = getTerrainHeight(stable.x, stable.z);
      stableMesh.position.set(stable.x, y, stable.z);
      stableMesh.rotation.y = stable.x > getRoadCenter(stable.z) ? -Math.PI / 2 : Math.PI / 2;
      this.scene.add(stableMesh);
      this.colliders.push({ x: stable.x, z: stable.z, r: 3.6 });
    });

    // 7. Monsters (Goblins, Orcs, Trolls) — mountain spawns hug the narrow ridge pass safely
    const monsterSpawns: Array<{ id: string; type: 'goblin' | 'orc' | 'troll'; x: number; z: number }> = [
      { id: 'm1', type: 'goblin', x: getRoadCenter(520) - 9, z: 520 },
      { id: 'm2', type: 'goblin', x: getRoadCenter(680) + 10, z: 680 },
      { id: 'm3', type: 'orc', x: getRoadCenter(980) - 1.3, z: 980 },
      { id: 'm4', type: 'orc', x: getRoadCenter(1180) + 1.2, z: 1180 },
      { id: 'm5', type: 'troll', x: getRoadCenter(1380) - 1.4, z: 1380 },
      { id: 'm6', type: 'troll', x: getRoadCenter(1620) + 11, z: 1620 },
    ];

    monsterSpawns.forEach((m) => {
      const monsterMesh = createMonsterModel(m.type, this.materialPalette);
      const y = getTerrainHeight(m.x, m.z);
      monsterMesh.position.set(m.x, y, m.z);
      this.scene.add(monsterMesh);
      this.monsterMeshes.set(m.id, monsterMesh);

      this.monsters.push({
        id: m.id,
        type: m.type,
        x: m.x,
        z: m.z,
        baseX: m.x,
        baseZ: m.z,
        health: m.type === 'troll' ? 3 : 2,
        maxHealth: m.type === 'troll' ? 3 : 2,
        state: 'patrol',
        vanishTimer: 0,
      });
    });

    // 8. The Great Lonely Mountain at the horizon
    const lonelyMountain = createLonelyMountainModel(this.materialPalette);
    lonelyMountain.position.set(getRoadCenter(1850), 0, 1940);
    this.scene.add(lonelyMountain);
  }

  private initParticles() {
    // Star Burst ('Błysk') particles, 3D shockwave ring, aura dome & flash light
    const count = 260;
    const geo = new THREE.BufferGeometry();
    this.starParticlePositions = new Float32Array(count * 3);
    this.starParticleVelocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const cCyan = new THREE.Color(0x7df9ff);
    const cWhite = new THREE.Color(0xffffff);
    const cGold = new THREE.Color(0xfde047);

    for (let i = 0; i < count; i++) {
      this.starParticlePositions[i * 3] = 0;
      this.starParticlePositions[i * 3 + 1] = -200;
      this.starParticlePositions[i * 3 + 2] = 0;
      const col = i % 3 === 0 ? cGold : i % 2 === 0 ? cWhite : cCyan;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(this.starParticlePositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 1.55,
      sizeAttenuation: true,
      vertexColors: true,
      map: createStarParticleTexture(),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.starParticles = new THREE.Points(geo, mat);
    // Prevent Three.js from frustum-culling the particles after they move away from origin
    this.starParticles.frustumCulled = false;
    this.starParticles.visible = false;
    this.scene.add(this.starParticles);

    // Expanding ground shockwave ring
    const ringGeo = new THREE.RingGeometry(0.62, 1.0, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.starShockwaveRingMat = new THREE.MeshBasicMaterial({
      color: 0x7df9ff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.starShockwaveRing = new THREE.Mesh(ringGeo, this.starShockwaveRingMat);
    this.starShockwaveRing.frustumCulled = false;
    this.starShockwaveRing.visible = false;
    this.scene.add(this.starShockwaveRing);

    // Expanding luminous elven dome around cast point
    const auraGeo = new THREE.SphereGeometry(1.0, 24, 16);
    this.starAuraMat = new THREE.MeshBasicMaterial({
      color: 0xb8f3ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.starAuraSphere = new THREE.Mesh(auraGeo, this.starAuraMat);
    this.starAuraSphere.frustumCulled = false;
    this.starAuraSphere.visible = false;
    this.scene.add(this.starAuraSphere);

    // Dynamic point light pulse for Star Burst
    this.starBurstLight = new THREE.PointLight(0x7df9ff, 0, 34);
    this.scene.add(this.starBurstLight);

    // Fireflies in forest & night
    const ffCount = 100;
    const ffGeo = new THREE.BufferGeometry();
    const ffPos = new Float32Array(ffCount * 3);
    for (let f = 0; f < ffCount; f++) {
      ffPos[f * 3] = (Math.random() - 0.5) * 50;
      ffPos[f * 3 + 1] = 1 + Math.random() * 4;
      ffPos[f * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    const ffMat = new THREE.PointsMaterial({
      size: 0.45,
      color: 0x99ff66,
      map: createStarParticleTexture(),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.fireflyParticles = new THREE.Points(ffGeo, ffMat);
    this.fireflyParticles.frustumCulled = false;
    this.scene.add(this.fireflyParticles);
  }

  private initInputListeners() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('resize', this.handleResize);

    const canvas = this.renderer.domElement;
    canvas.style.cursor = 'grab';
    canvas.addEventListener('mousedown', this.handleMouseDown);
    canvas.addEventListener('dblclick', this.handleDoubleClick);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseup', this.handleMouseUp);
    canvas.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    window.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    window.addEventListener('touchend', this.handleTouchEnd);
  }

  private handleWindowBlur = () => {
    Object.keys(this.keysHeld).forEach((k) => {
      this.keysHeld[k] = false;
    });
    this.isDraggingMouse = false;
    this.renderer.domElement.style.cursor = 'grab';
  };

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private handleDoubleClick = () => {
    this.cameraYawOffset = 0;
    this.cameraPitch = 0.18;
  };

  private handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.cameraDistance = Math.max(4.0, Math.min(15.0, this.cameraDistance + e.deltaY * 0.008));
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    // Ignore game hotkeys while typing in input fields
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (this.keysHeld[e.code] !== undefined) {
      this.keysHeld[e.code] = true;
    }
    if (e.code === 'KeyE') {
      this.handleInteractAction();
    }
    if (e.code === 'KeyG') {
      this.toggleDismount();
    }
    if (e.code === 'KeyQ' || e.code === 'KeyF') {
      this.triggerStarBurst();
    }
    if (e.code === 'KeyC') {
      this.cycleCameraView();
    }
    if (e.code === 'KeyR') {
      this.cameraYawOffset = 0;
      this.cameraPitch = 0.18;
    }
    if (e.code === 'Digit1') this.setTargetGait('walk');
    if (e.code === 'Digit2') this.setTargetGait('trot');
    if (e.code === 'Digit3') this.setTargetGait('canter');
    if (e.code === 'Digit4') this.setTargetGait('gallop');
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    if (this.keysHeld[e.code] !== undefined) {
      this.keysHeld[e.code] = false;
    }
  };

  private handleMouseDown = (e: MouseEvent) => {
    this.isDraggingMouse = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.renderer.domElement.style.cursor = 'grabbing';
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isDraggingMouse) return;
    const dx = e.clientX - this.lastMouseX;
    const dy = e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    this.cameraYawOffset -= dx * 0.007;
    this.cameraPitch = Math.max(-0.78, Math.min(0.85, this.cameraPitch + dy * 0.005));
  };

  private handleMouseUp = () => {
    this.isDraggingMouse = false;
    this.renderer.domElement.style.cursor = 'grab';
  };

  private handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      this.isDraggingMouse = true;
      this.lastMouseX = e.touches[0].clientX;
      this.lastMouseY = e.touches[0].clientY;
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (!this.isDraggingMouse || e.touches.length === 0) return;
    const dx = e.touches[0].clientX - this.lastMouseX;
    const dy = e.touches[0].clientY - this.lastMouseY;
    this.lastMouseX = e.touches[0].clientX;
    this.lastMouseY = e.touches[0].clientY;

    this.cameraYawOffset -= dx * 0.007;
    this.cameraPitch = Math.max(-0.78, Math.min(0.85, this.cameraPitch + dy * 0.005));
  };

  private handleTouchEnd = () => {
    this.isDraggingMouse = false;
  };

  private handleResize = () => {
    if (!this.container || !this.renderer) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  // -------------------------------------------------------------
  // GAME ACTIONS
  // -------------------------------------------------------------
  public triggerStarBurst() {
    const castPos = this.isDismounted ? this.riderPos : this.horsePos;
    this.starCastOrigin.copy(castPos);
    this.starBurstActive = true;
    this.starBurstTimer = this.starBurstDuration;
    soundEngine.playStarBurst();

    // Pulse star brooch & light flash
    this.horseRig.starLight.intensity = 6.5;
    this.horseRig.starBrooch.scale.set(2.5, 2.5, 2.5);
    this.standaloneRiderRig.starBrooch.scale.set(2.5, 2.5, 2.5);
    this.starBurstLight.position.set(castPos.x, castPos.y + 2.2, castPos.z);
    this.starBurstLight.intensity = 10.5;

    // Activate shockwave ring & luminous aura sphere
    this.starShockwaveRing.position.set(castPos.x, castPos.y + 0.45, castPos.z);
    this.starShockwaveRing.scale.set(0.8, 0.8, 0.8);
    this.starShockwaveRingMat.opacity = 0.95;
    this.starShockwaveRing.visible = true;

    this.starAuraSphere.position.set(castPos.x, castPos.y + 1.5, castPos.z);
    this.starAuraSphere.scale.set(0.7, 0.7, 0.7);
    this.starAuraMat.opacity = 0.55;
    this.starAuraSphere.visible = true;

    // Blast luminous starlight particles in radial + rising spiral pattern
    const count = this.starParticlePositions.length / 3;
    for (let i = 0; i < count; i++) {
      this.starParticlePositions[i * 3] = castPos.x + (Math.random() - 0.5) * 0.6;
      this.starParticlePositions[i * 3 + 1] = castPos.y + (this.isDismounted ? 1.3 : 1.8);
      this.starParticlePositions[i * 3 + 2] = castPos.z + (Math.random() - 0.5) * 0.6;

      const angle = (i / count) * Math.PI * 6 + Math.random() * 0.5;
      const isRingSpark = i % 3 === 0;
      const speed = isRingSpark ? 14 + Math.random() * 8 : 6 + Math.random() * 14;
      this.starParticleVelocities[i * 3] = Math.cos(angle) * speed;
      this.starParticleVelocities[i * 3 + 1] = isRingSpark ? 1.5 + Math.random() * 3.0 : 2.0 + Math.random() * 9.5;
      this.starParticleVelocities[i * 3 + 2] = Math.sin(angle) * speed;
    }
    this.starParticles.geometry.attributes.position.needsUpdate = true;
    (this.starParticles.material as THREE.PointsMaterial).opacity = 1.0;
    this.starParticles.visible = true;

    // Check nearby monsters within blast radius (16 units)
    let banishedAny = false;
    this.monsters.forEach((m) => {
      if (m.state === 'vanished') return;
      const dx = m.x - castPos.x;
      const dz = m.z - castPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 16) {
        m.health -= 1;
        if (m.health <= 0) {
          m.state = 'vanished';
          m.vanishTimer = 2.6;
          this.starShards += 5;
          this.applesCollected += 1;
          banishedAny = true;
        } else if (dist > 0.1) {
          // Visible knockback recoil on surviving monsters
          const push = 4.5;
          m.x += (dx / dist) * push;
          m.z += (dz / dist) * push;
          if (m.z >= 880 && m.z <= 1520) {
            const roadX = getRoadCenter(m.z);
            m.x = Math.max(roadX - 2.2, Math.min(roadX + 2.2, m.x));
          }
        }
      }
    });

    if (banishedAny) {
      this.callbacks.onStarsChange(this.starShards);
      this.callbacks.onApplesChange(this.applesCollected);
    }
  }

  public setTargetGait(gait: CruisingGait) {
    this.selectedGait = gait;
    this.callbacks.onTargetGaitChange(gait);
  }

  public toggleDismount(forceMount?: boolean) {
    const nextDismount = forceMount !== undefined ? !forceMount : !this.isDismounted;
    if (nextDismount === this.isDismounted) return;

    if (nextDismount) {
      // Hop off horse to its left side
      this.isDismounted = true;
      this.currentSpeed = 0;
      this.targetSpeed = 0;
      this.horseRig.riderGroup.visible = false;

      const sideX = Math.cos(this.horseHeading) * 1.4;
      const sideZ = -Math.sin(this.horseHeading) * 1.4;
      this.riderPos.set(this.horsePos.x + sideX, 0, this.horsePos.z + sideZ);
      this.riderPos.y = getTerrainHeight(this.riderPos.x, this.riderPos.z);
      this.riderHeading = this.horseHeading;

      this.standaloneRiderRig.group.position.copy(this.riderPos);
      this.standaloneRiderRig.group.rotation.y = this.riderHeading;
      this.standaloneRiderRig.group.visible = true;
      soundEngine.playChompOrBrush();
    } else {
      // Pack camp if active when mounting back onto the horse
      if (this.isCamped) {
        this.isCamped = false;
        if (this.campObject) {
          this.campObject.visible = false;
        }
        this.callbacks.onCampChange(false);
      }

      // Mount back on horse
      this.isDismounted = false;
      this.riderSpeed = 0;
      this.horseRig.riderGroup.visible = true;
      this.standaloneRiderRig.group.visible = false;
      soundEngine.playWhinny();
    }

    this.callbacks.onDismountChange(this.isDismounted);
  }

  public handleInteractAction() {
    const actorPos = this.isDismounted ? this.riderPos : this.horsePos;

    // 1. Check Fox Felek
    const foxDist = actorPos.distanceTo(
      new THREE.Vector3(this.foxActor.x, getTerrainHeight(this.foxActor.x, this.foxActor.z), this.foxActor.z)
    );
    if (foxDist < 4.5) {
      this.foxActor.isFriendlyPetted = true;
      this.foxActor.state = 'leap';
      this.foxActor.animTime = 0;
      soundEngine.playFoxYip();
      this.starShards += 2;
      this.callbacks.onStarsChange(this.starShards);
      this.callbacks.onInteractPrompt('Pogłaskałaś liska Felka! Felek macha ogonkiem i cieszy się ze spotkania!');
      return;
    }

    // 2. Check Abandoned Stable
    for (const stable of this.stables) {
      const sDist = actorPos.distanceTo(
        new THREE.Vector3(stable.x, getTerrainHeight(stable.x, stable.z), stable.z)
      );
      if (sDist < 8.0) {
        if (stable.applesRemaining > 0) {
          this.applesCollected += stable.applesRemaining;
          stable.applesRemaining = 0;
          this.callbacks.onApplesChange(this.applesCollected);
        }
        this.stamina = this.maxStamina;
        stable.rested = true;
        soundEngine.playChompOrBrush();
        soundEngine.playWhinny();
        this.callbacks.onStaminaChange(this.stamina, this.maxStamina);
        this.callbacks.onInteractPrompt('Odpoczynek w stajni! Koń wyczyszczony, nakarmiony jabłkami i pełen sił!');
        return;
      }
    }

    // 3. If camped and near the tent/fire, open Camp Menu (sleep until dawn / brew tea)
    if (this.isCamped && actorPos.distanceTo(this.campPos) < 6.0) {
      this.callbacks.onOpenCampMenu();
      return;
    }

    // 4. If dismounted and close to horse without camp, remount
    if (this.isDismounted && !this.isCamped && this.riderPos.distanceTo(this.horsePos) < 3.6) {
      this.toggleDismount(true);
      return;
    }

    // 5. Pitch or pack camp under the stars!
    this.toggleCamp();
  }

  public toggleCamp() {
    this.isCamped = !this.isCamped;
    if (this.isCamped) {
      // Dismount automatically so the rider stands beside the tent and campfire!
      if (!this.isDismounted) {
        this.toggleDismount(false);
      }

      if (!this.campObject) {
        this.campObject = createCampfireSite(this.materialPalette);
        this.scene.add(this.campObject);
      }
      // Place tent & campfire directly in front of the rider
      const campX = this.riderPos.x + Math.sin(this.riderHeading) * 3.2;
      const campZ = this.riderPos.z + Math.cos(this.riderHeading) * 3.2;
      const campY = getTerrainHeight(campX, campZ);
      this.campPos.set(campX, campY, campZ);
      this.campObject.position.copy(this.campPos);
      this.campObject.rotation.y = this.riderHeading;
      this.campObject.visible = true;

      // Restores stamina
      this.stamina = this.maxStamina;
      this.callbacks.onStaminaChange(this.stamina, this.maxStamina);
      soundEngine.playWhinny();
      this.callbacks.onInteractPrompt('Zeszłaś z konia i rozbiłaś obóz z namiotem pod gwiazdami!');
    } else {
      if (this.campObject) {
        this.campObject.visible = false;
      }
      this.callbacks.onInteractPrompt(null);
    }
    this.callbacks.onCampChange(this.isCamped);
  }

  public sleepUntilDawn() {
    this.timeOfDay = 0.22; // Golden dawn
    this.stamina = this.maxStamina;
    this.callbacks.onStaminaChange(this.stamina, this.maxStamina);
    soundEngine.playWhinny();
    this.toggleDismount(true); // Packs camp and mounts horse refreshed for morning ride!
  }

  public feedHorseApple() {
    if (this.applesCollected > 0) {
      this.applesCollected--;
      this.stamina = Math.min(this.maxStamina, this.stamina + 35);
      soundEngine.playChompOrBrush();
      soundEngine.playWhinny();
      this.callbacks.onApplesChange(this.applesCollected);
      this.callbacks.onStaminaChange(this.stamina, this.maxStamina);
      this.callbacks.onInteractPrompt('Podałaś koniowi chrupiące jabłko! Energia odnowiona!');
    }
  }

  public cycleCameraView() {
    if (this.cameraPreset === 'standard') {
      this.cameraPreset = 'close';
      this.cameraDistance = 5.2;
      this.cameraHeight = 2.8;
    } else if (this.cameraPreset === 'close') {
      this.cameraPreset = 'cinematic';
      this.cameraDistance = 12.0;
      this.cameraHeight = 5.5;
    } else {
      this.cameraPreset = 'standard';
      this.cameraDistance = 7.5;
      this.cameraHeight = 3.6;
    }
  }

  // -------------------------------------------------------------
  // SIMULATION TICK & ANIMATION
  // -------------------------------------------------------------
  private startLoop() {
    let lastTime = performance.now();
    soundEngine.startPeacefulMusic();

    const tick = (now: number) => {
      if (this.isDestroyed) return;
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      this.updateSimulation(dt);
      this.renderer.render(this.scene, this.camera);

      this.frameId = requestAnimationFrame(tick);
    };

    this.frameId = requestAnimationFrame(tick);
  }

  private updateSimulation(dt: number) {
    this.updateDayNight(dt);
    this.updateHorseLocomotion(dt);
    this.updateLegsAndRiderAnimation(dt);
    this.updateFox(dt);
    this.updateMonsters(dt);
    this.updateParticles(dt);
    this.updateCamera(dt);
    this.checkMilestonesAndInteractions();
  }

  private updateDayNight(dt: number) {
    if (!this.isCamped) {
      this.timeOfDay = (this.timeOfDay + this.timeCycleSpeed * dt) % 1.0;
    }

    // Sky, Clouds, Sun, Moon, Stars & Darkness tuning
    // 0.15 - 0.30: Dawn | 0.30 - 0.70: Day | 0.70 - 0.82: Sunset | 0.82 - 0.15: Dark Starry Night
    let sunIntensity = 1.8;
    let hemiIntensity = 0.72;
    let envIntensity = 0.95;
    let exposure = 1.1;
    let fogNear = 55;
    let fogFar = 520;
    let starOpacity = 0;
    let skyCol = new THREE.Color(0x8bc4ff);
    let hemiSky = new THREE.Color(0xfff7e6);
    let hemiGround = new THREE.Color(0x48753e);
    let dirColor = new THREE.Color(0xfffaed);
    let cloudTint = new THREE.Color(0xffffff);
    let cloudOpacity = 0.9;
    let timeLabel = 'Dzień';

    if (this.timeOfDay >= 0.15 && this.timeOfDay < 0.3) {
      // Dawn
      const t = (this.timeOfDay - 0.15) / 0.15;
      skyCol = new THREE.Color(0x060a18).lerp(new THREE.Color(0xf7b98f), t);
      hemiSky = new THREE.Color(0x281e3a).lerp(new THREE.Color(0xffb58a), t);
      hemiGround = new THREE.Color(0x090c0a).lerp(new THREE.Color(0x445f39), t);
      dirColor = new THREE.Color(0xff9f68).lerp(new THREE.Color(0xffe9c7), t);
      cloudTint = new THREE.Color(0x2d243b).lerp(new THREE.Color(0xffd4b8), t);
      sunIntensity = 0.18 + t * 1.15;
      hemiIntensity = 0.14 + t * 0.45;
      envIntensity = 0.12 + t * 0.65;
      exposure = 0.78 + t * 0.28;
      fogNear = 24 + t * 26;
      fogFar = 175 + t * 280;
      starOpacity = Math.max(0, 1 - t * 1.4);
      cloudOpacity = 0.55 + t * 0.35;
      timeLabel = 'Poranek / Świt';
    } else if (this.timeOfDay >= 0.3 && this.timeOfDay < 0.7) {
      // Bright Sunny Day
      skyCol = new THREE.Color(0x82beff);
      hemiSky = new THREE.Color(0xfffaf0);
      hemiGround = new THREE.Color(0x4a7840);
      dirColor = new THREE.Color(0xfff8e6);
      cloudTint = new THREE.Color(0xffffff);
      sunIntensity = 1.85;
      hemiIntensity = 0.74;
      envIntensity = 0.95;
      exposure = 1.1;
      fogNear = 58;
      fogFar = 540;
      starOpacity = 0;
      cloudOpacity = 0.92;
      timeLabel = 'Słoneczne Południe';
    } else if (this.timeOfDay >= 0.7 && this.timeOfDay < 0.82) {
      // Golden Sunset -> Deep Twilight
      const t = (this.timeOfDay - 0.7) / 0.12;
      skyCol = new THREE.Color(0x82beff).lerp(new THREE.Color(0xe65c3a), Math.min(1, t * 1.35));
      if (t > 0.65) {
        skyCol.lerp(new THREE.Color(0x050814), (t - 0.65) / 0.35);
      }
      hemiSky = new THREE.Color(0xff925c).lerp(new THREE.Color(0x161c33), t);
      hemiGround = new THREE.Color(0x4a7840).lerp(new THREE.Color(0x070a08), t);
      dirColor = new THREE.Color(0xff904d).lerp(new THREE.Color(0x526b9e), t);
      cloudTint = new THREE.Color(0xffb58a).lerp(new THREE.Color(0x1e253d), t);
      sunIntensity = 1.85 - t * 1.65;
      hemiIntensity = 0.72 - t * 0.6;
      envIntensity = 0.95 - t * 0.86;
      exposure = 1.1 - t * 0.38;
      fogNear = 55 - t * 35;
      fogFar = 520 - t * 365;
      starOpacity = Math.max(0, (t - 0.38) / 0.62);
      cloudOpacity = 0.9 - t * 0.55;
      timeLabel = 'Złoty Zmierzch';
    } else {
      // Very Dark Starry Night
      skyCol = new THREE.Color(0x02040a);
      hemiSky = new THREE.Color(0x0b1224);
      hemiGround = new THREE.Color(0x030504);
      dirColor = new THREE.Color(0x5d7cb8);
      cloudTint = new THREE.Color(0x0f172a);
      sunIntensity = 0.11;
      hemiIntensity = 0.09;
      envIntensity = 0.06;
      exposure = 0.72;
      fogNear = 18;
      fogFar = 148;
      starOpacity = 0.98;
      cloudOpacity = 0.28;
      timeLabel = 'Gwiaździsta Noc';
    }

    this.scene.background = skyCol;
    this.scene.environmentIntensity = envIntensity;
    this.skyFog.color.copy(skyCol);
    this.skyFog.near = fogNear;
    this.skyFog.far = fogFar;
    this.renderer.toneMappingExposure = exposure;

    this.dirSunLight.intensity = sunIntensity;
    this.dirSunLight.color.copy(dirColor);
    this.hemiLight.color.copy(hemiSky);
    this.hemiLight.groundColor.copy(hemiGround);
    this.hemiLight.intensity = hemiIntensity;

    // Position Sky Dome centered on active actor
    const actor = this.isDismounted ? this.riderPos : this.horsePos;
    this.skyDomeGroup.position.set(actor.x, 0, actor.z);

    // Orbit Sun (visible across 0.14..0.83) & Moon (opposite arc at night)
    const sunArc = ((this.timeOfDay - 0.14) / 0.69) * Math.PI;
    const sunVisible = this.timeOfDay >= 0.13 && this.timeOfDay <= 0.84;
    this.sunGroup.visible = sunVisible;
    if (sunVisible) {
      const sx = Math.cos(sunArc) * -520;
      const sy = Math.sin(sunArc) * 440;
      const sz = 480;
      this.sunGroup.position.set(sx, sy, sz);
      const horizonWarmth = 1 - Math.min(1, Math.max(0, Math.sin(sunArc)));
      this.sunCoreMat.color.setHex(0xfff6d1).lerp(new THREE.Color(0xff9248), horizonWarmth * 0.7);
      this.sunHaloMat.color.setHex(0xffd98a).lerp(new THREE.Color(0xff6b35), horizonWarmth * 0.8);
    }

    // Moon orbits across night window (0.78..0.18)
    const nightPhase = this.timeOfDay >= 0.78 ? (this.timeOfDay - 0.78) / 0.4 : (this.timeOfDay + 0.22) / 0.4;
    const moonVisible = this.timeOfDay >= 0.76 || this.timeOfDay <= 0.2;
    this.moonGroup.visible = moonVisible;
    if (moonVisible) {
      const mArc = Math.max(0, Math.min(1, nightPhase)) * Math.PI;
      this.moonGroup.position.set(Math.cos(mArc) * 460, Math.sin(mArc) * 380, 500);
    }

    // Stars & Clouds update
    const twinkle = 0.9 + Math.sin(this.idleTime * 2.1) * 0.1;
    this.starFieldMat.opacity = starOpacity * twinkle;
    this.starField.visible = starOpacity > 0.02;
    this.starField.rotation.y += dt * 0.002;

    this.cloudMat.color.copy(cloudTint);
    this.cloudMat.opacity = cloudOpacity;
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 260) {
        c.mesh.position.x = -260;
      }
    }

    // Directional light follows Sun during day or Moon at night
    const lightSrc = sunVisible ? this.sunGroup.position : this.moonGroup.position;
    const lx = THREE.MathUtils.clamp(lightSrc.x * 0.12, -65, 65);
    const ly = Math.max(14, lightSrc.y * 0.16);
    const lz = 45;
    this.dirSunLight.position.set(actor.x + lx, ly, actor.z + lz);
    this.dirSunLight.target.position.copy(actor);
    this.dirSunLight.target.updateMatrixWorld();

    this.callbacks.onTimeChange(this.timeOfDay, timeLabel);
  }

  private resolveWorldCollisions(pos: THREE.Vector3, actorRadius: number) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.colliders.length; i++) {
        const c = this.colliders[i];
        const dz = pos.z - c.z;
        const minDist = c.r + actorRadius;
        if (dz > minDist || dz < -minDist) continue;
        const dx = pos.x - c.x;
        if (dx > minDist || dx < -minDist) continue;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const push = minDist - dist;
            pos.x += (dx / dist) * push;
            pos.z += (dz / dist) * push;
          } else {
            pos.z += minDist;
          }
        }
      }
    }
  }

  private updateHorseLocomotion(dt: number) {
    this.idleTime += dt;
    const forward = this.keysHeld.KeyW || this.keysHeld.ArrowUp;
    const backward = this.keysHeld.KeyS || this.keysHeld.ArrowDown;
    const left = this.keysHeld.KeyA || this.keysHeld.ArrowLeft;
    const right = this.keysHeld.KeyD || this.keysHeld.ArrowRight;
    const sprint = this.keysHeld.ShiftLeft || this.keysHeld.ShiftRight;
    const jump = this.keysHeld.Space;

    // Turning
    this.turnInput = 0;
    if (left) this.turnInput += 1;
    if (right) this.turnInput -= 1;

    // ---------------------------------------------------
    // DISMOUNTED ON-FOOT MOVEMENT
    // ---------------------------------------------------
    if (this.isDismounted) {
      this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, 0, 10, dt);
      this.horseRig.group.position.copy(this.horsePos);
      this.horseRig.group.rotation.set(0, this.horseHeading, 0);

      // Walk on foot
      this.riderHeading += this.turnInput * 2.8 * dt;
      let targetFootSpeed = 0;
      if (forward) targetFootSpeed = sprint ? 6.0 : 3.8;
      else if (backward) targetFootSpeed = -2.0;

      this.riderSpeed = THREE.MathUtils.damp(this.riderSpeed, targetFootSpeed, 10, dt);
      this.riderPos.x += Math.sin(this.riderHeading) * this.riderSpeed * dt;
      this.riderPos.z += Math.cos(this.riderHeading) * this.riderSpeed * dt;
      this.resolveWorldCollisions(this.riderPos, 0.55);
      this.riderPos.x = Math.max(-WORLD_WIDTH * 0.42, Math.min(WORLD_WIDTH * 0.42, this.riderPos.x));
      this.riderPos.z = Math.max(10, Math.min(WORLD_LENGTH, this.riderPos.z));
      this.riderPos.y = getTerrainHeight(this.riderPos.x, this.riderPos.z);

      this.standaloneRiderRig.group.position.copy(this.riderPos);
      this.standaloneRiderRig.group.rotation.y = this.riderHeading;

      // Walking limb animation
      if (Math.abs(this.riderSpeed) > 0.2) {
        this.riderStridePhase += dt * (Math.abs(this.riderSpeed) * 2.5);
        const swing = Math.sin(this.riderStridePhase) * 0.65;
        this.standaloneRiderRig.legL.rotation.x = swing;
        this.standaloneRiderRig.legR.rotation.x = -swing;
        this.standaloneRiderRig.armL.rotation.x = -swing * 0.6;
        this.standaloneRiderRig.armR.rotation.x = swing * 0.6;
      } else {
        this.standaloneRiderRig.legL.rotation.x = THREE.MathUtils.damp(this.standaloneRiderRig.legL.rotation.x, 0, 10, dt);
        this.standaloneRiderRig.legR.rotation.x = THREE.MathUtils.damp(this.standaloneRiderRig.legR.rotation.x, 0, 10, dt);
        this.standaloneRiderRig.armL.rotation.x = THREE.MathUtils.damp(this.standaloneRiderRig.armL.rotation.x, 0, 10, dt);
        this.standaloneRiderRig.armR.rotation.x = THREE.MathUtils.damp(this.standaloneRiderRig.armR.rotation.x, 0, 10, dt);
      }

      // Recover stamina while camped / dismounted
      this.stamina = Math.min(this.maxStamina, this.stamina + (this.isCamped ? 12.0 : 7.0) * dt);

      const kmh = Math.round(Math.abs(this.riderSpeed) * 3.6);
      this.callbacks.onSpeedChange(kmh, Math.abs(this.riderSpeed) > 0.2 ? 'walk' : 'idle');
      this.callbacks.onStaminaChange(this.stamina, this.maxStamina);
      this.callbacks.onPositionUpdate({
        x: this.riderPos.x,
        y: this.riderPos.y,
        z: this.riderPos.z,
        heading: this.riderHeading,
      });
      return;
    }

    // ---------------------------------------------------
    // MOUNTED HORSE LOCOMOTION
    // ---------------------------------------------------
    const turnSpeed = this.currentSpeed > 8 ? 1.6 : 2.4;
    this.horseHeading += this.turnInput * turnSpeed * dt;

    // Speeds: Stęp (Walk) ~ 4.2m/s, Kłus (Trot) ~ 7.5m/s, Galop (Canter) ~ 12.2m/s, Cwał (Gallop) ~ 17.5m/s
    if (forward) {
      if ((sprint || this.selectedGait === 'gallop') && this.stamina > 5) {
        this.targetSpeed = 17.5; // Cwał (Full Gallop)
        this.stamina = Math.max(0, this.stamina - 4.5 * dt);
      } else if (this.selectedGait === 'canter' || (sprint && this.stamina <= 5)) {
        this.targetSpeed = 12.2; // Galop (Canter)
      } else if (this.selectedGait === 'trot') {
        this.targetSpeed = 7.5; // Kłus (Trot)
      } else {
        this.targetSpeed = 4.2; // Stęp (Walk)
      }
    } else if (backward) {
      this.targetSpeed = -2.5; // Cofanie
    } else {
      this.targetSpeed = 0;
      this.stamina = Math.min(this.maxStamina, this.stamina + 6.5 * dt);
    }

    // Smooth speed acceleration through gaits
    const accel = forward ? 3.2 : 8.5;
    this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, this.targetSpeed, accel, dt);

    // Jump handling
    if (jump && !this.isJumping) {
      this.isJumping = true;
      this.jumpVelocityY = 6.2;
      soundEngine.playWhinny();
    }

    if (this.isJumping) {
      this.jumpVelocityY -= 16.0 * dt;
      this.jumpYOffset += this.jumpVelocityY * dt;
      if (this.jumpYOffset <= 0) {
        this.jumpYOffset = 0;
        this.isJumping = false;
        soundEngine.playHoof('canter');
      }
    }

    // Move horse position & resolve collisions against dense forests and village buildings
    const moveZ = Math.cos(this.horseHeading) * this.currentSpeed * dt;
    const moveX = Math.sin(this.horseHeading) * this.currentSpeed * dt;
    this.horsePos.x += moveX;
    this.horsePos.z += moveZ;
    this.resolveWorldCollisions(this.horsePos, 0.95);

    // Bound horse inside playable world
    this.horsePos.x = Math.max(-WORLD_WIDTH * 0.42, Math.min(WORLD_WIDTH * 0.42, this.horsePos.x));
    this.horsePos.z = Math.max(10, Math.min(WORLD_LENGTH, this.horsePos.z));

    const groundY = getTerrainHeight(this.horsePos.x, this.horsePos.z);
    this.horsePos.y = groundY + this.jumpYOffset;

    // Determine gait from actual speed
    let gait: Gait = 'idle';
    const absSpeed = Math.abs(this.currentSpeed);
    if (absSpeed > 13.8) gait = 'gallop';
    else if (absSpeed > 9.0) gait = 'canter';
    else if (absSpeed > 5.0) gait = 'trot';
    else if (absSpeed > 0.3) gait = 'walk';

    // Rhythmic hoof sound trigger
    if (absSpeed > 0.3) {
      const stepFreq = gait === 'gallop' ? 14 : gait === 'canter' ? 10 : gait === 'trot' ? 7 : 4;
      this.stridePhase += dt * stepFreq;
      if (Math.sin(this.stridePhase) > 0.95 && Math.cos(this.stridePhase) > 0) {
        if (gait !== 'idle') {
          soundEngine.playHoof(gait);
        }
      }
    }

    // Banking & heading-aware pitch based on terrain slope and turn (clamped for steep cliffs)
    const aheadX = this.horsePos.x + Math.sin(this.horseHeading) * 1.4;
    const aheadZ = this.horsePos.z + Math.cos(this.horseHeading) * 1.4;
    const rawSlope = (getTerrainHeight(aheadX, aheadZ) - groundY) * 0.42;
    const pitchSlope = Math.max(-0.45, Math.min(0.45, rawSlope));
    const bankRoll = -this.turnInput * Math.min(0.25, absSpeed * 0.02);

    this.horseRig.group.position.copy(this.horsePos);
    this.horseRig.group.rotation.set(pitchSlope, this.horseHeading, bankRoll);

    // Speed in km/h for UI readout
    const kmh = Math.round(absSpeed * 3.6);
    this.callbacks.onSpeedChange(kmh, gait);
    this.callbacks.onStaminaChange(this.stamina, this.maxStamina);
    this.callbacks.onPositionUpdate({
      x: this.horsePos.x,
      y: this.horsePos.y,
      z: this.horsePos.z,
      heading: this.horseHeading,
    });
  }

  private updateLegsAndRiderAnimation(dt: number) {
    const absSpeed = Math.abs(this.currentSpeed);
    const animPhase = absSpeed > 0.2 ? this.stridePhase : 0;

    if (absSpeed <= 0.2) {
      // Gentle idle grazing / breathing for parked horse
      const graze = Math.sin(this.idleTime * 1.4) * 0.14;
      this.horseRig.headNeckGroup.rotation.x = this.isDismounted ? 0.35 + graze : graze * 0.35;
      this.horseRig.tailJoint.rotation.y = Math.sin(this.idleTime * 2.2) * 0.14;
      this.horseRig.tailJoint.rotation.x = 0.08;
      this.horseRig.riderTorso.position.y = 0;
      this.horseRig.riderTorso.rotation.x = 0;
      this.horseRig.legFL.upper.rotation.x = 0;
      this.horseRig.legFR.upper.rotation.x = 0;
      this.horseRig.legRL.upper.rotation.x = 0;
      this.horseRig.legRR.upper.rotation.x = 0;
      this.horseRig.legFL.lower.rotation.x = 0;
      this.horseRig.legFR.lower.rotation.x = 0;
      this.horseRig.legRL.lower.rotation.x = 0;
      this.horseRig.legRR.lower.rotation.x = 0;
      return;
    }

    // Natural 4-legged gait biomechanics (diagonal for trot, rocking lead for canter/gallop)
    const isGallop = absSpeed > 9.0;
    const amp = Math.min(0.68, absSpeed * 0.055);
    const swingFL = Math.sin(animPhase) * amp;
    const swingFR = Math.sin(animPhase + (isGallop ? 0.55 : Math.PI)) * amp;
    const swingRL = Math.sin(animPhase + (isGallop ? Math.PI : Math.PI * 0.5)) * amp;
    const swingRR = Math.sin(animPhase + (isGallop ? Math.PI + 0.55 : Math.PI * 1.5)) * amp;

    this.horseRig.legFL.upper.rotation.x = swingFL;
    this.horseRig.legFR.upper.rotation.x = swingFR;
    this.horseRig.legRL.upper.rotation.x = swingRL;
    this.horseRig.legRR.upper.rotation.x = swingRR;

    // Knee / hock flexion during swing phase
    this.horseRig.legFL.lower.rotation.x = swingFL > 0 ? swingFL * 0.78 : -swingFL * 0.15;
    this.horseRig.legFR.lower.rotation.x = swingFR > 0 ? swingFR * 0.78 : -swingFR * 0.15;
    this.horseRig.legRL.lower.rotation.x = swingRL < 0 ? -swingRL * 0.72 : 0;
    this.horseRig.legRR.lower.rotation.x = swingRR < 0 ? -swingRR * 0.72 : 0;

    // Head and neck extension + rhythmic bobbing with gait
    const neckExtend = Math.min(0.2, absSpeed * 0.011);
    const headBob = Math.sin(animPhase * 2) * Math.min(0.08, absSpeed * 0.006);
    this.horseRig.headNeckGroup.rotation.x = neckExtend + headBob;

    // Flowing tail lift & swish
    const tailSwish = Math.sin(this.stridePhase * 1.2) * 0.18;
    this.horseRig.tailJoint.rotation.y = tailSwish;
    this.horseRig.tailJoint.rotation.x = Math.min(0.65, 0.12 + absSpeed * 0.032);

    // Rider forward leaning seat & subtle saddle bounce (anchored at y = 0!)
    this.horseRig.riderTorso.rotation.x = Math.min(0.18, absSpeed * 0.01) - headBob * 0.6;
    this.horseRig.riderTorso.position.y = Math.abs(Math.sin(animPhase)) * 0.042;
  }

  private updateFox(dt: number) {
    this.foxActor.animTime += dt;

    // Felek trots alongside the player ahead on the road
    const roadX = getRoadCenter(this.horsePos.z + 12);
    const leadZ = this.horsePos.z + 10;
    const targetX = roadX + (Math.sin(this.foxActor.animTime * 0.8) * 3);
    const targetZ = leadZ;

    // Smoothly seek target
    const dx = targetX - this.foxActor.x;
    const dz = targetZ - this.foxActor.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 1.0) {
      const foxSpeed = Math.min(18, dist * 2.8);
      this.foxActor.x += (dx / dist) * foxSpeed * dt;
      this.foxActor.z += (dz / dist) * foxSpeed * dt;
      this.foxActor.rotation = Math.atan2(dx, dz);
    }

    const groundY = getTerrainHeight(this.foxActor.x, this.foxActor.z);
    let hopY = 0;
    if (this.foxActor.state === 'leap') {
      hopY = Math.sin(this.foxActor.animTime * 8) * 0.8;
      if (this.foxActor.animTime > 1.2) {
        this.foxActor.state = 'trot';
      }
    } else {
      hopY = Math.abs(Math.sin(this.foxActor.animTime * 10)) * 0.15;
    }

    this.foxRig.group.position.set(this.foxActor.x, groundY + Math.max(0, hopY), this.foxActor.z);
    this.foxRig.group.rotation.y = this.foxActor.rotation;

    // Fox tail wag
    this.foxRig.tailGroup.rotation.y = Math.sin(this.foxActor.animTime * 12) * 0.45;
  }

  private updateMonsters(dt: number) {
    this.monsters.forEach((m) => {
      const mesh = this.monsterMeshes.get(m.id);
      if (!mesh) return;

      if (m.state === 'vanished') {
        m.vanishTimer -= dt;
        mesh.scale.multiplyScalar(0.92);
        if (m.vanishTimer <= 0) {
          mesh.visible = false;
        }
        return;
      }

      // Campfire keeps monsters safely at bay!
      if (this.isCamped) {
        const cdx = m.x - this.campPos.x;
        const cdz = m.z - this.campPos.z;
        const cDist = Math.sqrt(cdx * cdx + cdz * cdz);
        if (cDist < 14 && cDist > 0.1) {
          m.x += (cdx / cDist) * 4.5 * dt;
          m.z += (cdz / cDist) * 4.5 * dt;
          mesh.rotation.y = Math.atan2(cdx, cdz);
          const y = getTerrainHeight(m.x, m.z);
          mesh.position.set(m.x, y, m.z);
          return;
        }
      }

      // Patrol or slowly approach player if within 22 units
      const targetActor = this.isDismounted ? this.riderPos : this.horsePos;
      const dx = targetActor.x - m.x;
      const dz = targetActor.z - m.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      const inMountains = m.z >= 880 && m.z <= 1520;
      if (dist < 20 && dist > 3.5) {
        // Approach cautiously
        m.state = 'chase';
        const speed = m.type === 'goblin' ? 3.5 : m.type === 'orc' ? 2.5 : 1.8;
        m.x += (dx / dist) * speed * dt;
        m.z += (dz / dist) * speed * dt;
        mesh.rotation.y = Math.atan2(dx, dz);
      } else {
        m.state = 'patrol';
        // Gentle patrol around baseX (tighter on narrow mountain ridge)
        const amp = inMountains ? 1.3 : 3.0;
        m.x = m.baseX + Math.sin(performance.now() * 0.001) * amp;
      }

      if (inMountains) {
        const roadX = getRoadCenter(m.z);
        m.x = Math.max(roadX - 2.2, Math.min(roadX + 2.2, m.x));
      }

      const y = getTerrainHeight(m.x, m.z);
      mesh.position.set(m.x, y, m.z);

      // Warning when close: horse whinnies alert
      if (dist < 8.0 && Math.random() < 0.01) {
        soundEngine.playWhinny();
      }
    });
  }

  private updateParticles(dt: number) {
    // Flickering campfire flames & warm light
    if (this.isCamped && this.campObject && this.campObject.visible) {
      const flames = this.campObject.getObjectByName('CampFlames');
      if (flames) {
        const flicker = 0.88 + Math.sin(this.idleTime * 14) * 0.12 + Math.cos(this.idleTime * 23) * 0.08;
        flames.scale.set(1, flicker, 1);
        flames.rotation.y = Math.sin(this.idleTime * 5) * 0.15;
      }
      const fireLight = this.campObject.getObjectByName('CampFireLight') as THREE.PointLight | undefined;
      if (fireLight) {
        fireLight.intensity = 2.8 + Math.sin(this.idleTime * 16) * 0.6;
      }
    }

    // Star burst ('Błysk') shockwave, aura dome, light pulse & swirling starlight sparks
    if (this.starBurstActive) {
      this.starBurstTimer -= dt;
      const progress = Math.max(0, Math.min(1, 1 - this.starBurstTimer / this.starBurstDuration));
      const fade = 1 - progress;
      const count = this.starParticlePositions.length / 3;

      for (let i = 0; i < count; i++) {
        this.starParticlePositions[i * 3] += this.starParticleVelocities[i * 3] * dt;
        this.starParticlePositions[i * 3 + 1] += this.starParticleVelocities[i * 3 + 1] * dt;
        this.starParticlePositions[i * 3 + 2] += this.starParticleVelocities[i * 3 + 2] * dt;

        // Gentle deceleration + upward float
        this.starParticleVelocities[i * 3] *= 0.94;
        this.starParticleVelocities[i * 3 + 1] = this.starParticleVelocities[i * 3 + 1] * 0.94 + 1.4 * dt;
        this.starParticleVelocities[i * 3 + 2] *= 0.94;
      }
      this.starParticles.geometry.attributes.position.needsUpdate = true;
      (this.starParticles.material as THREE.PointsMaterial).opacity = Math.max(0, fade * 1.15);

      // Expanding ground shockwave ring
      const ringScale = 0.8 + progress * 15.5;
      this.starShockwaveRing.scale.set(ringScale, ringScale, ringScale);
      this.starShockwaveRingMat.opacity = Math.max(0, (1 - progress) * (1 - progress) * 0.95);

      // Expanding translucent elven dome
      const auraScale = 0.7 + progress * 6.2;
      this.starAuraSphere.scale.set(auraScale, auraScale * 0.85, auraScale);
      this.starAuraMat.opacity = Math.max(0, Math.pow(1 - progress, 2.2) * 0.55);

      // Decaying burst light & brooch scale
      this.starBurstLight.intensity = Math.max(0, Math.pow(1 - progress, 1.8) * 10.5);
      const broochScale = 1 + fade * 1.5;
      this.horseRig.starBrooch.scale.set(broochScale, broochScale, broochScale);
      this.standaloneRiderRig.starBrooch.scale.set(broochScale, broochScale, broochScale);

      if (this.starBurstTimer <= 0) {
        this.starBurstActive = false;
        this.starParticles.visible = false;
        this.starShockwaveRing.visible = false;
        this.starAuraSphere.visible = false;
        this.starBurstLight.intensity = 0;
        this.horseRig.starLight.intensity = 0.85;
        this.horseRig.starBrooch.scale.set(1.0, 1.0, 1.0);
        this.standaloneRiderRig.starBrooch.scale.set(1.0, 1.0, 1.0);
      }
    }

    // Fireflies floating
    if (this.fireflyParticles) {
      const actor = this.isDismounted ? this.riderPos : this.horsePos;
      this.fireflyParticles.position.set(actor.x, actor.y, actor.z);
    }
  }

  private updateCamera(dt: number) {
    // Follow standalone rider when dismounted, or horse when mounted
    const targetPos = this.isDismounted ? this.riderPos : this.horsePos;
    const targetHeading = this.isDismounted ? this.riderHeading : this.horseHeading;
    const dist = this.isDismounted ? Math.min(this.cameraDistance, 5.5) : this.cameraDistance;
    const pivotY = this.isDismounted ? 1.35 : 2.0;

    const totalYaw = targetHeading + this.cameraYawOffset;
    const horizDist = dist * Math.cos(this.cameraPitch);
    const vertOffset = dist * Math.sin(this.cameraPitch) + (this.cameraPitch >= 0 ? (this.cameraHeight - pivotY) * 0.65 : 0);

    const camX = targetPos.x - Math.sin(totalYaw) * horizDist;
    const camZ = targetPos.z - Math.cos(totalYaw) * horizDist;
    const minGroundY = getTerrainHeight(camX, camZ) + 0.65;
    const targetY = Math.max(minGroundY, targetPos.y + pivotY + vertOffset);

    // Smooth camera damping
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camX, 9.0, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetY, 9.0, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, camZ, 9.0, dt);

    // Look upward into the sky when cameraPitch < 0, or focus on horse/rider when level/above
    const skyTiltUp = this.cameraPitch < 0 ? Math.tan(-this.cameraPitch) * (dist + 6.5) : 0;
    const skyForward = this.cameraPitch < 0 ? Math.min(6.5, -this.cameraPitch * 9.0) : 0;
    this.lookTargetVec.set(
      targetPos.x + Math.sin(totalYaw) * skyForward,
      targetPos.y + pivotY * 0.9 + skyTiltUp,
      targetPos.z + Math.cos(totalYaw) * skyForward
    );
    this.camera.lookAt(this.lookTargetVec);
  }

  private checkMilestonesAndInteractions() {
    const actorPos = this.isDismounted ? this.riderPos : this.horsePos;

    // Milestones
    WORLD_MILESTONES.forEach((ms) => {
      if (!ms.visited && Math.abs(actorPos.z - ms.zPos) < 25) {
        ms.visited = true;
        this.callbacks.onMilestoneReached(ms.name, ms.description);
        soundEngine.playStarBurst();

        if (ms.id === 'lonely_mountain') {
          this.callbacks.onVictory();
        }
      }
    });

    // Check interaction prompt
    let prompt: string | null = null;
    const foxDist = actorPos.distanceTo(
      new THREE.Vector3(this.foxActor.x, getTerrainHeight(this.foxActor.x, this.foxActor.z), this.foxActor.z)
    );
    if (foxDist < 4.5) {
      prompt = '[E] Pogłaszcz liska Felka 🦊';
    }

    for (const stable of this.stables) {
      const sDist = actorPos.distanceTo(
        new THREE.Vector3(stable.x, getTerrainHeight(stable.x, stable.z), stable.z)
      );
      if (sDist < 8.0) {
        prompt = `[E] Wjedź do stajni: Wyczyść konia i zbierz jabłka 🍎 (${stable.applesRemaining} szt.)`;
        break;
      }
    }

    if (!prompt && this.isDismounted) {
      if (this.isCamped && actorPos.distanceTo(this.campPos) < 6.0) {
        prompt = '[E] Odpocznij w namiocie (Nocuj do świtu) · [G] Wsiądź na konia 🏕️';
      } else if (this.riderPos.distanceTo(this.horsePos) < 3.6) {
        prompt = '[G] lub [E] Wsiądź z powrotem na konia 🐎';
      } else if (this.isCamped) {
        prompt = 'Obóz rozbity! Podejdź do ogniska [E] lub naciśnij [G], aby wrócić na konia 🏕️';
      }
    }

    this.callbacks.onInteractPrompt(prompt);
  }

  // Mobile virtual joystick control
  public applyMobileInput(forwardRatio: number, turnRatio: number) {
    this.turnInput = -turnRatio;
    if (this.isDismounted) {
      this.riderHeading += this.turnInput * 2.5 * 0.016;
      this.riderSpeed = forwardRatio > 0.1 ? 3.8 : forwardRatio < -0.2 ? -2.0 : 0;
      return;
    }

    this.horseHeading += this.turnInput * 2.2 * 0.016;

    if (forwardRatio > 0.1) {
      if (forwardRatio > 0.85 && this.stamina > 5) {
        this.targetSpeed = 17.5;
      } else if (forwardRatio > 0.5) {
        this.targetSpeed = 12.2;
      } else {
        this.targetSpeed = 7.5;
      }
    } else if (forwardRatio < -0.2) {
      this.targetSpeed = -2.5;
    } else {
      this.targetSpeed = 0;
    }
  }

  // Update profile in-game
  public updateProfiles(horse: HorseProfile, rider: RiderProfile) {
    this.horseProfile = horse;
    this.riderProfile = rider;
    this.scene.remove(this.horseRig.group);
    this.horseRig = createHorseAndRider(this.horseProfile, this.riderProfile, this.materialPalette);
    this.horseRig.group.position.copy(this.horsePos);
    this.horseRig.riderGroup.visible = !this.isDismounted;
    this.scene.add(this.horseRig.group);

    this.scene.remove(this.standaloneRiderRig.group);
    this.standaloneRiderRig = createStandaloneRider(this.riderProfile, this.materialPalette);
    this.standaloneRiderRig.group.position.copy(this.riderPos);
    this.standaloneRiderRig.group.rotation.y = this.riderHeading;
    this.standaloneRiderRig.group.visible = this.isDismounted;
    this.scene.add(this.standaloneRiderRig.group);
  }

  public getStables(): AbandonedStable[] {
    return this.stables;
  }

  public getMonsters(): ActiveMonster[] {
    return this.monsters;
  }

  public getFoxPosition(): { x: number; z: number } {
    return { x: this.foxActor.x, z: this.foxActor.z };
  }

  public destroy() {
    this.isDestroyed = true;
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('touchend', this.handleTouchEnd);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('mousedown', this.handleMouseDown);
    canvas.removeEventListener('dblclick', this.handleDoubleClick);
    canvas.removeEventListener('wheel', this.handleWheel);
    canvas.removeEventListener('contextmenu', this.handleContextMenu);
    canvas.removeEventListener('touchstart', this.handleTouchStart);
    soundEngine.stopPeacefulMusic();
    this.materialPalette.dispose();
    this.renderer.dispose();
  }
}
