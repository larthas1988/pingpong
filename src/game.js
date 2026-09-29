import * as THREE from "three";

/**
 * 对墙乒乓球核心引擎
 *
 * 坐标系约定：
 *   +Z 指向玩家（相机在 +Z 一侧）
 *   -Z 指向墙壁（墙壁位于 z = WALL_Z）
 *   +X 向右，+Y 向上
 */

export const CONFIG = {
  WALL_Z: -6, // 墙壁位置
  WALL_WIDTH: 12,
  WALL_HEIGHT: 7,

  ROOM_WIDTH: 14, // 左右边界
  ROOM_DEPTH: 9, // 玩家可活动纵深

  BALL_RADIUS: 0.09,
  // 乒乓球很轻、飞行距离长，用较小的重力模拟出「飘」且有弹性的手感
  // （经轨迹模拟验证：-4.0 配合 BASE_SPEED 14 时，球能稳定往返不落地）
  GRAVITY: -4.0,
  AIR_DRAG: 0.0, // 空气阻力系数（每秒速度衰减比例）

  PADDLE_WIDTH: 0.9,
  PADDLE_HEIGHT: 0.62,
  PADDLE_THICKNESS: 0.07,
  PADDLE_Z: 1.2, // 球拍所在平面

  PADDLE_MAX_X: 3.6, // 球拍左右移动范围
  PADDLE_MIN_Y: 0.55, // 球拍最低高度（贴近台面）
  PADDLE_MAX_Y: 2.6, // 球拍最高高度
  PADDLE_Z_RANGE: 1.6, // 球拍前后（击球强度）移动范围

  BASE_SPEED: 14, // 基础出球速度（需足够快，球才能往返不落地）
  MAX_SPEED: 24, // 速度上限
  SPEED_UP: 1.04, // 每次成功回击的加速系数

  // 弹性：球拍击球后向上抬升的比例（越大球飞得越高、越有弹性）
  HIT_LIFT: 0.55,
  // 墙壁反弹能量保留（乒乓球撞击硬墙几乎不损失能量）
  WALL_BOUNCE: 0.98,

  HIT_RADIUS: 0.62, // 击球判定半径

  // 握拍姿态：拍柄朝向玩家（+Z），拍面朝墙（-Z）并向外倾斜。
  // 模拟人手在下方握拍、手腕前压使拍面略微朝下前方的角度。
  // 绕 X 轴正角度：拍面上沿向玩家方向倒、下沿朝墙，形成「向外倾斜」。
  PADDLE_TILT_X: 0.55, // 拍面外倾（下沿朝墙、上沿朝玩家）
  PADDLE_TILT_Z: 0.1, // 轻微侧倾
};

export class Game {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.onScore = callbacks.onScore || (() => {});
    this.onMiss = callbacks.onMiss || (() => {});
    this.onGameOver = callbacks.onGameOver || (() => {});

    this.score = 0;
    this.bestCombo = 0;
    this.combo = 0;
    this.running = false;
    this.speed = CONFIG.BASE_SPEED;

    this._clock = new THREE.Clock();
    this._tmpVec = new THREE.Vector3();

    this._initRenderer();
    this._initScene();
    this._initLights();
    this._initRoom();
    this._initPaddle();
    this._initBall();

    this._onResize = this._onResize.bind(this);
    window.addEventListener("resize", this._onResize);
    this._onResize();

    this._animate = this._animate.bind(this);
    this._renderer.setAnimationLoop(this._animate);
  }

  // ------------------------------------------------------------------ 初始化

  _initRenderer() {
    this._renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.1;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0f1a);
    this.scene.fog = new THREE.Fog(0x0b0f1a, 12, 30);

    // 第一人称「握拍视角」：相机位于球拍上方偏后，向下俯视拍面，
    // 模拟玩家低头看着手中的球拍、视线越过拍面看向墙壁的视角。
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    this.camera.position.set(0, 2.35, CONFIG.PADDLE_Z + 1.15);
    this.camera.lookAt(0, 1.15, CONFIG.WALL_Z);
    this.camera.rotation.z = -0.04; // 轻微侧倾，增强手持感

    // 记录基准相机位置，供 _applyCameraFit 按屏幕比例调整
    this._camBase = this.camera.position.clone();
  }

  _initLights() {
    const ambient = new THREE.AmbientLight(0x8fb4ff, 0.55);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    this.scene.add(key);

    // 墙壁前的补光，突出球与墙壁
    const fill = new THREE.PointLight(0x6ee7ff, 22, 18, 2);
    fill.position.set(0, 3.2, -3);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0x4f9dff, 14, 16, 2);
    rim.position.set(-4, 2.4, 2);
    this.scene.add(rim);
  }

  /** 房间：墙壁 + 地面 + 边界网格 */
  _initRoom() {
    const { WALL_Z, WALL_WIDTH, WALL_HEIGHT, ROOM_WIDTH, ROOM_DEPTH } = CONFIG;

    // 墙壁
    const wallGeo = new THREE.PlaneGeometry(WALL_WIDTH, WALL_HEIGHT);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1b2740,
      roughness: 0.92,
      metalness: 0.05,
    });
    this.wall = new THREE.Mesh(wallGeo, wallMat);
    this.wall.position.set(0, WALL_HEIGHT / 2, WALL_Z);
    this.wall.receiveShadow = true;
    this.scene.add(this.wall);

    // 墙壁网格线，增强空间感与距离判断
    const grid = new THREE.GridHelper(
      WALL_WIDTH,
      24,
      0x3d7fd6,
      0x24395c
    );
    grid.rotation.x = Math.PI / 2;
    grid.position.set(0, WALL_HEIGHT / 2, WALL_Z + 0.012);
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);

    // 墙壁边框
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x2f4f80,
      emissive: 0x1a3a66,
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.6,
    });
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_WIDTH + 0.3, WALL_HEIGHT + 0.3, 0.22),
      frameMat
    );
    frame.position.set(0, WALL_HEIGHT / 2, WALL_Z - 0.14);
    this.scene.add(frame);

    // 地面
    const floorGeo = new THREE.PlaneGeometry(ROOM_WIDTH, ROOM_DEPTH + 6);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x131c2e,
      roughness: 0.85,
      metalness: 0.15,
    });
    this.floor = new THREE.Mesh(floorGeo, floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0, 0, WALL_Z / 2 + ROOM_DEPTH / 2 - 2);
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    // 地面网格
    const floorGrid = new THREE.GridHelper(ROOM_WIDTH, 20, 0x2a4a78, 0x1d3355);
    floorGrid.position.set(0, 0.005, this.floor.position.z);
    floorGrid.material.transparent = true;
    floorGrid.material.opacity = 0.4;
    this.scene.add(floorGrid);

    // 左右侧墙（半透明），限定活动范围
    const sideMat = new THREE.MeshStandardMaterial({
      color: 0x1a2942,
      transparent: true,
      opacity: 0.5,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const sideGeo = new THREE.PlaneGeometry(ROOM_DEPTH + 6, WALL_HEIGHT);
    for (const sign of [-1, 1]) {
      const side = new THREE.Mesh(sideGeo, sideMat);
      side.position.set(
        (sign * ROOM_WIDTH) / 2,
        WALL_HEIGHT / 2,
        this.floor.position.z
      );
      side.rotation.y = (sign * Math.PI) / 2;
      this.scene.add(side);
    }
  }

  /** 球拍 */
  _initPaddle() {
    const { PADDLE_WIDTH, PADDLE_HEIGHT, PADDLE_THICKNESS, PADDLE_Z } = CONFIG;

    this.paddle = new THREE.Group();

    // 拍面（红黑两面 + 木芯）
    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0xd93b4c,
      roughness: 0.85,
      metalness: 0.05,
    });
    const backMat = new THREE.MeshStandardMaterial({
      color: 0x1c1c22,
      roughness: 0.9,
      metalness: 0.05,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xd9b382,
      roughness: 0.75,
      metalness: 0.05,
    });

    // 真实球拍外形：椭圆形拍面 + 收窄颈部 + 拍柄，整体共面（沿 Y 轴一条线）。
    //
    // 拍面：用圆柱体沿 Z 轴压扁得到「圆盘」，再通过 scale 压成椭圆，
    // 圆柱的侧面（+X/-X 等）用木芯色，两个端面分别是红胶与黑胶。
    const faceRadius = PADDLE_WIDTH / 2;
    const faceGeo = new THREE.CylinderGeometry(
      faceRadius,
      faceRadius,
      PADDLE_THICKNESS,
      48
    );
    // 圆柱默认沿 Y 轴，旋转到沿 Z 轴（拍面法线朝玩家）
    const face = new THREE.Mesh(faceGeo, [
      coreMat, // 侧面（木芯）
      rubberMat, // +Y 端面 -> 旋转后朝向玩家（红胶）
      backMat, // -Y 端面 -> 旋转后朝向墙壁（黑胶）
    ]);
    face.rotation.x = Math.PI / 2;
    // 压成椭圆：略高于宽（真实球拍拍面接近圆，纵向略长）
    face.scale.set(1, 1, PADDLE_HEIGHT / PADDLE_WIDTH);
    face.castShadow = true;
    this.paddle.add(face);

    // 拍面边缘包边（木质圈），增强真实感
    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(faceRadius, 0.018, 8, 48),
      coreMat
    );
    edge.scale.set(1, PADDLE_HEIGHT / PADDLE_WIDTH, 1);
    this.paddle.add(edge);

    // 颈部：连接拍面与拍柄的收窄部分
    const neckMat = new THREE.MeshStandardMaterial({
      color: 0x8a6a45,
      roughness: 0.8,
    });
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.11, 0.14, 20),
      neckMat
    );
    neck.position.set(0, PADDLE_HEIGHT / 2 + 0.02, 0);
    neck.castShadow = true;
    this.paddle.add(neck);

    // 拍柄：接在颈部上方，沿 +Y 方向延伸，与拍面共面
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x6b4a2f,
      roughness: 0.8,
    });
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.075, 0.4, 20),
      handleMat
    );
    handle.position.set(0, PADDLE_HEIGHT / 2 + 0.28, 0);
    handle.castShadow = true;
    this.paddle.add(handle);

    // 拍柄底部圆头
    const butt = new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 16, 12),
      handleMat
    );
    butt.position.set(0, PADDLE_HEIGHT / 2 + 0.48, 0);
    this.paddle.add(butt);

    this.paddle.position.set(0, 1.35, PADDLE_Z);

    // 握拍基准姿态：拍面朝墙（-Z）、拍柄朝玩家（+Z），并整体向外倾斜。
    // 绕 X 轴正角度让拍面下沿朝墙、上沿朝玩家，形成「向外倾斜」的握拍感。
    // 后续 setControl 中的动态倾斜会叠加在这个基准之上。
    this.paddle.rotation.x = CONFIG.PADDLE_TILT_X;
    this.paddle.rotation.z = CONFIG.PADDLE_TILT_Z;

    this.scene.add(this.paddle);

    // 击球光效（击中时短暂显示）
    this.hitFlash = new THREE.PointLight(0x6ee7ff, 0, 6, 2);
    this.paddle.add(this.hitFlash);
  }

  /** 乒乓球 */
  _initBall() {
    const { BALL_RADIUS } = CONFIG;

    const ballGeo = new THREE.SphereGeometry(BALL_RADIUS, 32, 24);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xfff6d8,
      emissive: 0xffe9a8,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.05,
    });
    this.ball = new THREE.Mesh(ballGeo, ballMat);
    this.ball.castShadow = true;
    this.scene.add(this.ball);

    // 球体光晕
    const glowGeo = new THREE.SphereGeometry(BALL_RADIUS * 2.4, 16, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a8,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    this.ballGlow = new THREE.Mesh(glowGeo, glowMat);
    this.ball.add(this.ballGlow);

    // 运动轨迹
    this.trail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        new Array(24).fill(0).map(() => new THREE.Vector3())
      ),
      new THREE.LineBasicMaterial({
        color: 0x6ee7ff,
        transparent: true,
        opacity: 0.5,
      })
    );
    this.trail.frustumCulled = false;
    this.scene.add(this.trail);
    this._trailPoints = new Array(24).fill(0).map(() => new THREE.Vector3());

    this.ballVelocity = new THREE.Vector3();
  }

  // ------------------------------------------------------------------ 游戏流程

  start() {
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.speed = CONFIG.BASE_SPEED;
    this.running = true;
    this.onScore(this.score, this.combo);
    this._serve();
  }

  stop() {
    this.running = false;
  }

  /** 发球：从球拍位置向墙壁发出 */
  _serve() {
    const { WALL_Z, PADDLE_Z, BASE_SPEED } = CONFIG;

    this.ball.position.set(
      this.paddle.position.x,
      this.paddle.position.y,
      PADDLE_Z - 0.3
    );

    // 发球同样采用「瞄准式」：直接瞄准球回到球拍平面时的落点，
    // 保证第一拍就落在球拍可达范围内，避免开局即漏球。
    const targetX = THREE.MathUtils.randFloat(
      -CONFIG.PADDLE_MAX_X * 0.6,
      CONFIG.PADDLE_MAX_X * 0.6
    );
    const returnY = THREE.MathUtils.randFloat(1.2, 2.3);

    const dz = WALL_Z - this.ball.position.z;
    const tFlight = Math.abs(dz) / BASE_SPEED;
    const totalTime = tFlight * 2;

    const vy =
      (returnY - this.ball.position.y - 0.5 * CONFIG.GRAVITY * totalTime * totalTime) /
      totalTime;
    const vx = (targetX - this.ball.position.x) / tFlight;
    const vz = dz / tFlight;

    this.ballVelocity.set(vx, vy, vz);
    this._resetTrail();
  }

  _resetTrail() {
    for (const p of this._trailPoints) p.copy(this.ball.position);
  }

  /**
   * 玩家击球：根据球拍位置与强度计算回球速度
   *
   * 关键设计——「瞄准式回球」：
   * 直接给 Y 方向叠加固定抬升会让球越打越高，最终飞出球拍可达范围。
   * 这里改为先决定「球回到球拍平面时的目标高度」，再用运动学公式
   * 反推所需初速度，使球的回球高度始终落在球拍可达范围内。
   */
  _hitByPaddle() {
    const { WALL_Z, SPEED_UP, MAX_SPEED } = CONFIG;

    this.speed = Math.min(this.speed * SPEED_UP, MAX_SPEED);
    const speed = this.speed;

    const pos = this.ball.position;

    // 击球点相对拍心的偏移，决定回球方向（真实乒乓球的手感）
    const offsetX = pos.x - this.paddle.position.x;

    // 球拍高度越高，回球越平；越低则越容易「挑」起来
    const paddleRatio = THREE.MathUtils.clamp(
      (this.paddle.position.y - CONFIG.PADDLE_MIN_Y) /
        (CONFIG.PADDLE_MAX_Y - CONFIG.PADDLE_MIN_Y),
      0,
      1
    );

    // ---- 横向：由击球点偏移决定，但必须落在球拍可达范围内 ----
    // 关键：不能瞄准墙壁边缘。若目标点超出球拍可达范围，球会飞向侧墙，
    // 反弹后落点会远远超出球拍范围（实测 ballX 可达 ±6.4），必然漏球。
    // 这里收窄到 0.6 倍，给玩家的横向移动留出反应余量。
    const targetX = THREE.MathUtils.clamp(
      pos.x + offsetX * 2.2 + THREE.MathUtils.randFloat(-0.8, 0.8),
      -CONFIG.PADDLE_MAX_X * 0.6,
      CONFIG.PADDLE_MAX_X * 0.6
    );

    // ---- 纵向：瞄准「球回到球拍平面时的高度」，而不是墙上的高度 ----
    // 这是关键：球撞墙后会原样反弹回来，若只瞄准墙面高度，
    // 回程会继续按抛物线上升，导致球越打越高、最终飞出球拍可达范围。
    // 因此这里直接以「回程到达球拍平面时的目标高度」为约束反推速度。
    //
    // 目标回球高度：球拍越高 -> 回球越平（落点低）；球拍越低 -> 挑得越高
    const returnY = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(2.35, 1.15, paddleRatio) +
        THREE.MathUtils.randFloat(-0.2, 0.2),
      1.0,
      2.45
    );

    // ---- 反推速度：让球在重力作用下恰好飞向 (targetX, returnY) ----
    // 注意：这里必须直接使用反推出的速度分量，不能再做归一化。
    // 若归一化，vy 会被放大、vz 会被缩小，导致球飞得更慢却冲得更高，
    // 最终完全偏离目标点（实测会冲到 y≈4.4 甚至撞天花板）。
    const dz = WALL_Z - pos.z; // 到墙的 z 距离（负值）
    const tFlight = Math.abs(dz) / speed; // z 方向飞行时间

    // 由运动学公式反推 Y 方向初速度：y = y0 + vy*t + 0.5*g*t^2
    // 注意这里用「往返总时间」2*tFlight，因为约束点是球回到球拍平面时的高度。
    const gravity = CONFIG.GRAVITY;
    const totalTime = tFlight * 2;
    const vy =
      (returnY - pos.y - 0.5 * gravity * totalTime * totalTime) / totalTime;

    // X 方向同理
    const vx = (targetX - pos.x) / tFlight;

    // Z 方向：由飞行时间反推，保证恰好 tFlight 后抵达墙面
    const vz = dz / tFlight;

    this.ballVelocity.set(vx, vy, vz);

    // 击中特效
    this.hitFlash.intensity = 6;
    this._flashTime = 0.12;
  }

  /** 每帧物理更新 */
  _update(dt) {
    if (!this.running) return;

    const {
      WALL_Z,
      ROOM_WIDTH,
      BALL_RADIUS,
      GRAVITY,
      PADDLE_Z,
      HIT_RADIUS,
      WALL_HEIGHT,
    } = CONFIG;

    const vel = this.ballVelocity;
    const pos = this.ball.position;

    // 记录上一帧位置，用于高速球穿拍判定
    const prevZ = pos.z;

    // 重力
    vel.y += GRAVITY * dt;

    // 空气阻力：乒乓球很轻，阻力让速度缓慢衰减，飞行更「飘」
    const drag = Math.max(0, 1 - CONFIG.AIR_DRAG * dt);
    vel.multiplyScalar(drag);

    // 位移
    pos.addScaledVector(vel, dt);

    // --- 墙壁碰撞（z 轴）：乒乓球撞硬墙几乎不损失能量 ---
    if (pos.z - BALL_RADIUS <= WALL_Z) {
      pos.z = WALL_Z + BALL_RADIUS;
      vel.z = Math.abs(vel.z) * CONFIG.WALL_BOUNCE;
    }

    // --- 左右边界 ---
    const limitX = ROOM_WIDTH / 2 - BALL_RADIUS;
    if (pos.x > limitX) {
      pos.x = limitX;
      vel.x = -Math.abs(vel.x);
    } else if (pos.x < -limitX) {
      pos.x = -limitX;
      vel.x = Math.abs(vel.x);
    }

    // --- 天花板 ---
    if (pos.y > WALL_HEIGHT - BALL_RADIUS) {
      pos.y = WALL_HEIGHT - BALL_RADIUS;
      vel.y = -Math.abs(vel.y);
    }

    // --- 地面：落地即失败（球不能落地）---
    if (pos.y - BALL_RADIUS <= 0) {
      pos.y = BALL_RADIUS;
      this._miss("落地");
      return;
    }

    // --- 球拍击球判定 ---
    this._prevBallZ = prevZ;
    this._checkPaddleHit(HIT_RADIUS, PADDLE_Z);

    // --- 失分判定：球越过球拍平面 ---
    if (pos.z > PADDLE_Z + 1.4) {
      this._miss("漏球");
      return;
    }

    this._updateTrail();
    this._updateCamera(dt);
  }

  _checkPaddleHit(HIT_RADIUS, PADDLE_Z) {
    const pos = this.ball.position;
    const vel = this.ballVelocity;

    // 只在球朝玩家运动时判定
    if (vel.z <= 0) return;

    // 用「是否穿过球拍平面」判定，避免高速球一帧跨越导致漏判
    const prevZ = this._prevBallZ;
    const crossed =
      prevZ !== undefined &&
      prevZ <= PADDLE_Z + HIT_RADIUS &&
      pos.z >= PADDLE_Z - HIT_RADIUS;

    if (!crossed && Math.abs(pos.z - PADDLE_Z) > HIT_RADIUS) return;

    // 球拍是一个矩形拍面，用矩形范围判定更符合直觉
    const halfW = CONFIG.PADDLE_WIDTH / 2 + CONFIG.BALL_RADIUS;
    const halfH = CONFIG.PADDLE_HEIGHT / 2 + CONFIG.BALL_RADIUS;

    const dx = pos.x - this.paddle.position.x;
    const dy = pos.y - this.paddle.position.y;

    if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) return;

    // 成功回击
    pos.z = PADDLE_Z - 0.05;
    this._hitByPaddle();

    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.score += 1;
    this.onScore(this.score, this.combo);
  }

  _miss(reason = "没接到") {
    this.combo = 0;
    this.onMiss(this.score, reason);
    this.onGameOver(this.score, this.bestCombo, reason);
    this.running = false;
  }

  _updateTrail() {
    // 简单队列式轨迹
    for (let i = this._trailPoints.length - 1; i > 0; i--) {
      this._trailPoints[i].copy(this._trailPoints[i - 1]);
    }
    this._trailPoints[0].copy(this.ball.position);
    this.trail.geometry.setFromPoints(this._trailPoints);
  }

  _updateCamera(dt) {
    // 第一人称俯视握拍视角：相机位于球拍上方偏后，跟随球拍移动，
    // 视线越过拍面看向墙壁。跟随幅度经过衰减，避免快速移动时眩晕。
    // 基准位置已由 _applyCameraFit 按屏幕比例调整过。
    const fit = this._camFit || 1;
    const baseY = (this._camBase ? this._camBase.y : 2.35) + (fit - 1) * 0.55;
    const targetX = this.paddle.position.x * 0.3;
    const targetY = baseY + (this.paddle.position.y - 1.35) * 0.25;

    this.camera.position.x +=
      (targetX - this.camera.position.x) * Math.min(1, dt * 4);
    this.camera.position.y +=
      (targetY - this.camera.position.y) * Math.min(1, dt * 3);

    // 注视点明显低于相机，形成俯视角度；并随球拍轻微平移
    this.camera.lookAt(
      this.paddle.position.x * 0.5,
      1.1 + (this.paddle.position.y - 1.35) * 0.3,
      CONFIG.WALL_Z
    );

    // 保留轻微侧倾，强化手持感
    this.camera.rotation.z = -0.04;
  }

  /**
   * 由外部控制器每帧调用
   *   x: -1 ~ 1  控制球拍左右位置
   *   y: -1 ~ 1  控制球拍上下位置（向上为正，对应屏幕上方）
   */
  setControl(x, y) {
    const { PADDLE_MAX_X, PADDLE_MIN_Y, PADDLE_MAX_Y } = CONFIG;

    // 左右：直接映射到横向范围
    this.paddle.position.x = THREE.MathUtils.clamp(
      x * PADDLE_MAX_X,
      -PADDLE_MAX_X,
      PADDLE_MAX_X
    );

    // 上下：y = -1 在底部，y = 1 在顶部
    const targetY = THREE.MathUtils.lerp(
      PADDLE_MIN_Y,
      PADDLE_MAX_Y,
      (y + 1) / 2
    );
    // 平滑跟随，避免抖动
    this.paddle.position.y += (targetY - this.paddle.position.y) * 0.35;

    // 动态倾斜叠加在「握拍基准姿态」之上：
    // 左右移动时拍面略微转向，上下移动时手腕前压角度随之变化。
    this.paddle.rotation.x = CONFIG.PADDLE_TILT_X + y * 0.12;
    this.paddle.rotation.y = -x * 0.22;
    this.paddle.rotation.z = CONFIG.PADDLE_TILT_Z - x * 0.08;
  }

  // ------------------------------------------------------------------ 渲染循环

  _animate() {
    const dt = Math.min(this._clock.getDelta(), 0.05);

    if (this._flashTime > 0) {
      this._flashTime -= dt;
      this.hitFlash.intensity = Math.max(0, this.hitFlash.intensity - dt * 60);
    }

    this._update(dt);
    this._renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._renderer.setSize(w, h, false);
    this._applyCameraFit(w, h);
  }

  /**
   * 相机自适应：窄屏（竖屏手机）时按比例拉远相机并抬高，
   * 保证球拍与场景在画面中保持合适大小，不会因视野变窄而显得过大。
   */
  _applyCameraFit(w, h) {
    if (!this._camBase) return;
    const aspect = w / h;
    // 以 16:9 为基准，窄屏时按比例拉远（限制在 1 ~ 1.9 倍）
    const refAspect = 16 / 9;
    const fit = THREE.MathUtils.clamp(refAspect / aspect, 1, 1.9);

    this._camFit = fit;
    // 沿基准方向外推相机，并略微抬高，形成更远的俯视
    this.camera.position.z = this._camBase.z + (fit - 1) * 1.6;
    this.camera.position.y = this._camBase.y + (fit - 1) * 0.55;
  }

  dispose() {
    this._renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this._onResize);
    this._renderer.dispose();
  }
}