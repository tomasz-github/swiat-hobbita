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
    { id: 'stable_1', x: 12, z: 460, name: 'Opuszczona Stajnia pod Dębem', applesRemaining: 5, rested: false },
    { id: 'stable_2', x: -10, z: 1350, name: 'Górska Przystań Kucyków', applesRemaining: 6, rested: false },
  ];
  private campObject: THREE.Group | null = null;
  private campPos = new THREE.Vector3();
  public isCamped: boolean = false;
  public isDismounted: boolean = false;

  // Particle systems
  private starParticles!: THREE.Points;
  private starParticlePositions!: Float32Array;
  private starParticleVelocities!: Float32Array;
  private starBurstActive: boolean = false;
  private starBurstTimer: number = 0;

  // Fireflies for night
  private fireflyParticles!: THREE.Points;

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
    this.materialPalette = new MaterialPalette();

    this.detectSoftwareGl();
    this.initRenderer();
    this.initScene();
    this.initLighting();
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

    this.camera = new THREE.PerspectiveCamera(52, width / height, 0.3, 1400);
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

  private initWorld() {
    // 1. Terrain Mesh & Instanced Flora
    const terrain = createWorldTerrain();
    this.scene.add(terrain);

    const flora = createInstancedFlora();
    this.scene.add(flora);

    // 2. Horse and Rider + Standalone Dismounted Rider
    this.horseRig = createHorseAndRider(this.horseProfile, this.riderProfile, this.materialPalette);
    this.horsePos.y = getTerrainHeight(this.horsePos.x, this.horsePos.z);
    this.horseRig.group.position.copy(this.horsePos);
    this.scene.add(this.horseRig.group);

    this.standaloneRiderRig = createStandaloneRider(this.riderProfile, this.materialPalette);
    this.standaloneRiderRig.group.visible = false;
    this.scene.add(this.standaloneRiderRig.group);

    // 3. Felek the Fox
    this.foxRig = createFoxModel();
    this.foxActor.x = getRoadCenter(65) + 3;
    this.foxActor.z = 65;
    this.foxActor.targetX = this.foxActor.x;
    this.foxActor.targetZ = this.foxActor.z;
    this.foxRig.group.position.set(this.foxActor.x, getTerrainHeight(this.foxActor.x, this.foxActor.z), this.foxActor.z);
    this.scene.add(this.foxRig.group);

    // 4. Hobbit Burrows (The Shire region, z: 40 to 350)
    const burrowZ = [60, 140, 220, 310];
    burrowZ.forEach((z, i) => {
      const burrow = createHobbitBurrow();
      const side = i % 2 === 0 ? 1 : -1;
      const x = getRoadCenter(z) + side * 22;
      const y = getTerrainHeight(x, z);
      burrow.position.set(x, y, z);
      burrow.rotation.y = side > 0 ? -Math.PI * 0.45 : Math.PI * 0.45;
      this.scene.add(burrow);
    });

    // 5. Trees across biomes
    for (let z = 30; z < WORLD_LENGTH - 100; z += 18) {
      const roadX = getRoadCenter(z);
      [-1, 1].forEach((side) => {
        const offset = 8 + Math.random() * 22;
        const x = roadX + side * offset;
        const y = getTerrainHeight(x, z);
        let type: 'apple' | 'willow' | 'pine' = 'apple';
        if (z > 400 && z < 900) type = 'willow';
        else if (z >= 900) type = 'pine';

        const tree = createTree(type);
        tree.position.set(x, y, z);
        const s = 0.8 + Math.random() * 0.4;
        tree.scale.set(s, s, s);
        tree.rotation.y = Math.random() * Math.PI * 2;
        this.scene.add(tree);
      });
    }

    // 6. Abandoned Stables
    this.stables.forEach((stable) => {
      const stableMesh = createAbandonedStable();
      const y = getTerrainHeight(stable.x, stable.z);
      stableMesh.position.set(stable.x, y, stable.z);
      stableMesh.rotation.y = stable.x > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.scene.add(stableMesh);
    });

    // 7. Monsters (Goblins, Orcs, Trolls)
    const monsterSpawns: Array<{ id: string; type: 'goblin' | 'orc' | 'troll'; x: number; z: number }> = [
      { id: 'm1', type: 'goblin', x: getRoadCenter(520) - 8, z: 520 },
      { id: 'm2', type: 'goblin', x: getRoadCenter(680) + 9, z: 680 },
      { id: 'm3', type: 'orc', x: getRoadCenter(980) - 7, z: 980 },
      { id: 'm4', type: 'orc', x: getRoadCenter(1180) + 8, z: 1180 },
      { id: 'm5', type: 'troll', x: getRoadCenter(1380) - 10, z: 1380 },
      { id: 'm6', type: 'troll', x: getRoadCenter(1620) + 11, z: 1620 },
    ];

    monsterSpawns.forEach((m) => {
      const monsterMesh = createMonsterModel(m.type);
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
    const lonelyMountain = createLonelyMountainModel();
    lonelyMountain.position.set(getRoadCenter(1850), 0, 1940);
    this.scene.add(lonelyMountain);
  }

  private initParticles() {
    // Star Burst particles for magic defense
    const count = 150;
    const geo = new THREE.BufferGeometry();
    this.starParticlePositions = new Float32Array(count * 3);
    this.starParticleVelocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      this.starParticlePositions[i * 3] = 0;
      this.starParticlePositions[i * 3 + 1] = -100;
      this.starParticlePositions[i * 3 + 2] = 0;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(this.starParticlePositions, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.8,
      map: createStarParticleTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.starParticles = new THREE.Points(geo, mat);
    this.scene.add(this.starParticles);

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
    this.cameraPitch = Math.max(0.02, Math.min(0.75, this.cameraPitch + dy * 0.005));
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
    this.cameraPitch = Math.max(0.02, Math.min(0.75, this.cameraPitch + dy * 0.005));
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
    this.starBurstActive = true;
    this.starBurstTimer = 1.6;
    soundEngine.playStarBurst();

    // Pulse star brooch
    this.horseRig.starLight.intensity = 4.5;
    this.horseRig.starBrooch.scale.set(2.2, 2.2, 2.2);

    // Blast particles outward from horse position
    const count = this.starParticlePositions.length / 3;
    for (let i = 0; i < count; i++) {
      this.starParticlePositions[i * 3] = this.horsePos.x;
      this.starParticlePositions[i * 3 + 1] = this.horsePos.y + 1.8;
      this.starParticlePositions[i * 3 + 2] = this.horsePos.z;

      const angle = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * 12;
      this.starParticleVelocities[i * 3] = Math.cos(angle) * speed;
      this.starParticleVelocities[i * 3 + 1] = (Math.random() - 0.2) * 8;
      this.starParticleVelocities[i * 3 + 2] = Math.sin(angle) * speed;
    }
    this.starParticles.geometry.attributes.position.needsUpdate = true;

    // Check nearby monsters within blast radius (14 units)
    let banishedAny = false;
    this.monsters.forEach((m) => {
      if (m.state === 'vanished') return;
      const dx = m.x - this.horsePos.x;
      const dz = m.z - this.horsePos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 14) {
        m.health -= 1;
        if (m.health <= 0) {
          m.state = 'vanished';
          m.vanishTimer = 3.0;
          this.starShards += 5;
          this.applesCollected += 1;
          banishedAny = true;
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
      // Mount back on horse (bring horse cleanly underneath if nearby, or walk/teleport to saddle)
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

    // 3. If dismounted and close to horse without camp, remount
    if (this.isDismounted && !this.isCamped && this.riderPos.distanceTo(this.horsePos) < 3.6) {
      this.toggleDismount(true);
      return;
    }

    // 4. Toggle Cozy Camp under the stars!
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
        this.campObject = createCampfireSite();
        this.scene.add(this.campObject);
      }
      const campX = this.riderPos.x + Math.cos(this.riderHeading) * 2.4;
      const campZ = this.riderPos.z + Math.sin(this.riderHeading) * 2.4 + 2.0;
      const campY = getTerrainHeight(campX, campZ);
      this.campPos.set(campX, campY, campZ);
      this.campObject.position.copy(this.campPos);
      this.campObject.visible = true;

      // Restores stamina
      this.stamina = this.maxStamina;
      this.callbacks.onStaminaChange(this.stamina, this.maxStamina);
      soundEngine.playWhinny();
      this.callbacks.onInteractPrompt('Zeszłaś z konia i rozbiłaś obóz pod gwiazdami! Możesz spacerować przy ognisku.');
    } else {
      if (this.campObject) {
        this.campObject.visible = false;
      }
      this.callbacks.onInteractPrompt(null);
    }
    this.callbacks.onCampChange(this.isCamped);
  }

  public sleepUntilDawn() {
    this.timeOfDay = 0.22; // Dawn
    this.stamina = this.maxStamina;
    this.callbacks.onStaminaChange(this.stamina, this.maxStamina);
    soundEngine.playWhinny();
    this.toggleCamp();
    if (this.isDismounted) {
      this.toggleDismount(true);
    }
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

    // Sky & Light colors based on timeOfDay
    // 0.15 - 0.3: Dawn
    // 0.3 - 0.7: Daytime
    // 0.7 - 0.82: Sunset / Twilight
    // 0.82 - 0.15: Night with stars & aurora
    let sunIntensity = 1.8;
    let skyCol = new THREE.Color(0xcce2ff);
    let hemiSky = new THREE.Color(0xfff7e6);
    let timeLabel = 'Dzień';

    if (this.timeOfDay >= 0.15 && this.timeOfDay < 0.3) {
      // Dawn
      const t = (this.timeOfDay - 0.15) / 0.15;
      skyCol = new THREE.Color(0x352345).lerp(new THREE.Color(0xffccaa), t);
      hemiSky = new THREE.Color(0xff9977);
      sunIntensity = 0.5 + t * 1.0;
      timeLabel = 'Poranek / Świt';
    } else if (this.timeOfDay >= 0.3 && this.timeOfDay < 0.7) {
      // Full sunny day
      skyCol = new THREE.Color(0x99ccff);
      hemiSky = new THREE.Color(0xfffaed);
      sunIntensity = 1.8;
      timeLabel = 'Słoneczne Południe';
    } else if (this.timeOfDay >= 0.7 && this.timeOfDay < 0.82) {
      // Sunset
      const t = (this.timeOfDay - 0.7) / 0.12;
      skyCol = new THREE.Color(0x99ccff).lerp(new THREE.Color(0xff5533), t);
      hemiSky = new THREE.Color(0xff7744);
      sunIntensity = 1.8 - t * 1.3;
      timeLabel = 'Złoty Zmierzch';
    } else {
      // Starry Night
      skyCol = new THREE.Color(0x0a0c18);
      hemiSky = new THREE.Color(0x1a243b);
      sunIntensity = 0.25;
      timeLabel = 'Gwiaździsta Noc';
    }

    this.scene.background = skyCol;
    this.skyFog.color.copy(skyCol);
    this.dirSunLight.intensity = sunIntensity;
    this.hemiLight.color.copy(hemiSky);

    // Orbit sun
    const sunAngle = this.timeOfDay * Math.PI * 2;
    this.dirSunLight.position.set(
      this.horsePos.x + Math.sin(sunAngle) * 60,
      Math.max(10, Math.cos(sunAngle) * 70),
      this.horsePos.z + 40
    );
    this.dirSunLight.target.position.copy(this.horsePos);
    this.dirSunLight.target.updateMatrixWorld();

    this.callbacks.onTimeChange(this.timeOfDay, timeLabel);
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

    // Move horse position
    const moveZ = Math.cos(this.horseHeading) * this.currentSpeed * dt;
    const moveX = Math.sin(this.horseHeading) * this.currentSpeed * dt;
    this.horsePos.x += moveX;
    this.horsePos.z += moveZ;

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

    // Banking & pitch based on terrain slope and turn
    const pitchSlope = (getTerrainHeight(this.horsePos.x, this.horsePos.z + 1.2) - groundY) * 0.35;
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
      this.horseRig.headNeckGroup.rotation.x = this.isDismounted ? 0.35 + graze : graze * 0.4;
      this.horseRig.tailJoint.rotation.y = Math.sin(this.idleTime * 2.2) * 0.15;
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

    // Natural 4-legged gait biomechanics
    const swingFL = Math.sin(animPhase) * Math.min(0.65, absSpeed * 0.07);
    const swingFR = Math.sin(animPhase + Math.PI) * Math.min(0.65, absSpeed * 0.07);
    const swingRL = Math.sin(animPhase + Math.PI * 0.5) * Math.min(0.65, absSpeed * 0.07);
    const swingRR = Math.sin(animPhase + Math.PI * 1.5) * Math.min(0.65, absSpeed * 0.07);

    this.horseRig.legFL.upper.rotation.x = swingFL;
    this.horseRig.legFR.upper.rotation.x = swingFR;
    this.horseRig.legRL.upper.rotation.x = swingRL;
    this.horseRig.legRR.upper.rotation.x = swingRR;

    // Knee tucking on backward swing
    this.horseRig.legFL.lower.rotation.x = swingFL > 0 ? swingFL * 0.8 : 0;
    this.horseRig.legFR.lower.rotation.x = swingFR > 0 ? swingFR * 0.8 : 0;
    this.horseRig.legRL.lower.rotation.x = swingRL < 0 ? -swingRL * 0.8 : 0;
    this.horseRig.legRR.lower.rotation.x = swingRR < 0 ? -swingRR * 0.8 : 0;

    // Head and neck bobbing with gait
    const headBob = Math.sin(animPhase * 2) * Math.min(0.08, absSpeed * 0.008);
    this.horseRig.headNeckGroup.rotation.x = headBob;

    // Tail swishing behind
    const tailSwish = Math.sin(this.stridePhase * 1.2) * 0.2;
    this.horseRig.tailJoint.rotation.y = tailSwish;
    this.horseRig.tailJoint.rotation.x = Math.min(0.6, absSpeed * 0.04);

    // Rider posture & subtle bob
    this.horseRig.riderTorso.rotation.x = -headBob * 0.8;
    this.horseRig.riderTorso.position.y = 0.35 + Math.abs(Math.sin(animPhase)) * 0.06;
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

      // Patrol or slowly approach player if within 22 units
      const dx = this.horsePos.x - m.x;
      const dz = this.horsePos.z - m.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 20 && dist > 3.5) {
        // Approach cautiously
        m.state = 'chase';
        const speed = m.type === 'goblin' ? 3.5 : m.type === 'orc' ? 2.5 : 1.8;
        m.x += (dx / dist) * speed * dt;
        m.z += (dz / dist) * speed * dt;
        mesh.rotation.y = Math.atan2(dx, dz);
      } else {
        m.state = 'patrol';
        // Gentle patrol around baseX
        m.x = m.baseX + Math.sin(performance.now() * 0.001) * 3;
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
    // Star burst particle animation
    if (this.starBurstActive) {
      this.starBurstTimer -= dt;
      const count = this.starParticlePositions.length / 3;

      for (let i = 0; i < count; i++) {
        this.starParticlePositions[i * 3] += this.starParticleVelocities[i * 3] * dt;
        this.starParticlePositions[i * 3 + 1] += this.starParticleVelocities[i * 3 + 1] * dt;
        this.starParticlePositions[i * 3 + 2] += this.starParticleVelocities[i * 3 + 2] * dt;

        // Slow down
        this.starParticleVelocities[i * 3] *= 0.94;
        this.starParticleVelocities[i * 3 + 1] *= 0.94;
        this.starParticleVelocities[i * 3 + 2] *= 0.94;
      }
      this.starParticles.geometry.attributes.position.needsUpdate = true;

      if (this.starBurstTimer <= 0) {
        this.starBurstActive = false;
        this.horseRig.starLight.intensity = 0.8;
        this.horseRig.starBrooch.scale.set(1.0, 1.0, 1.0);
      }
    }

    // Fireflies floating
    if (this.fireflyParticles) {
      this.fireflyParticles.position.set(this.horsePos.x, this.horsePos.y, this.horsePos.z);
    }
  }

  private updateCamera(dt: number) {
    // Follow standalone rider when dismounted, or horse when mounted
    const targetPos = this.isDismounted ? this.riderPos : this.horsePos;
    const targetHeading = this.isDismounted ? this.riderHeading : this.horseHeading;
    const dist = this.isDismounted ? Math.min(this.cameraDistance, 5.5) : this.cameraDistance;
    const height = this.isDismounted ? 2.2 : this.cameraHeight;

    const totalYaw = targetHeading + this.cameraYawOffset;
    const camX = targetPos.x - Math.sin(totalYaw) * dist;
    const camZ = targetPos.z - Math.cos(totalYaw) * dist;
    const targetY = targetPos.y + height + this.cameraPitch * 4.0;

    // Smooth camera damping
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camX, 8.0, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetY, 8.0, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, camZ, 8.0, dt);

    // Look at actor with slight elevation
    const lookTarget = new THREE.Vector3(
      targetPos.x,
      targetPos.y + (this.isDismounted ? 1.2 : 1.8),
      targetPos.z
    );
    this.camera.lookAt(lookTarget);
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
      if (this.riderPos.distanceTo(this.horsePos) < 3.6) {
        prompt = '[G] lub [E] Wsiądź z powrotem na konia 🐎';
      } else if (this.isCamped) {
        prompt = 'Obóz rozbity! Spaceruj wokół ogniska lub naciśnij [G], aby wrócić na konia 🏕️';
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
