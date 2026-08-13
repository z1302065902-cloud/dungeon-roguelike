// ============================================================
// 深境地牢 — Three.js 地牢动作 Roguelike
// 玩法: WASD移动+自动攻击 → 消灭敌人 → 升级三选一 → 下一房间
// 素材: KayKit CC0（环境/武器）+ manneko 角色
// 测试接口: window.__game_state + ?test=1&speed=4 | 三端触控
// ============================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BgmPlayer } from './bgm.js';
import { donateButtons } from './ui-kit.js';

const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const SPEED = TEST ? (parseFloat(params.get('speed')) || 4) : 1;

// 武器（KayKit 模型）
const WEAPONS = [
  { name: '长剑', model: 'sword_common.gltf.glb', dmg: 10, range: 2.2, rate: 600, color: 0xc0c0c0 },
  { name: '巨斧', model: 'axe_common.gltf.glb', dmg: 18, range: 2.0, rate: 900, color: 0xb8a060 },
  { name: '战锤', model: 'hammer_common.gltf.glb', dmg: 25, range: 1.8, rate: 1200, color: 0x8a8a8a },
  { name: '法杖', model: 'staff_common.gltf.glb', dmg: 14, range: 4.0, rate: 700, color: 0x6eb5ff },
  { name: '弩箭', model: 'crossbow_common.gltf.glb', dmg: 12, range: 5.0, rate: 500, color: 0x9a6b3f },
];

// 敌人配置
const ENEMIES = [
  { name: '小骷髅', hp: 20, speed: 1.4, dmg: 8, color: 0xcccccc, scale: 0.7 },
  { name: '绿史莱姆', hp: 35, speed: 0.9, dmg: 12, color: 0x6bc46b, scale: 0.8 },
  { name: '红魔', hp: 55, speed: 1.8, dmg: 16, color: 0xe05a5a, scale: 0.9 },
  { name: '宝箱怪', hp: 90, speed: 1.0, dmg: 25, color: 0xb8903a, scale: 1.1 },
];

// 升级池（三选一）
const UPGRADES = [
  { id: 'dmg', name: '力量强化', desc: '伤害 +30%', apply: g => { g.dmgMul = (g.dmgMul || 1) * 1.3; } },
  { id: 'hp', name: '生命之心', desc: '生命 +40', apply: g => { g.hp += 40; g.maxHp += 40; } },
  { id: 'spd', name: '疾风之靴', desc: '移速 +20%', apply: g => { g.spdMul = (g.spdMul || 1) * 1.2; } },
  { id: 'rate', name: '攻速强化', desc: '攻速 +25%', apply: g => { g.rateMul = (g.rateMul || 1) * 1.25; } },
  { id: 'heal', name: '再生之泉', desc: '回血 50%', apply: g => { g.hp = Math.min(g.maxHp, g.hp + g.maxHp * 0.5); } },
  { id: 'crit', name: '致命一击', desc: '暴击率 +15%', apply: g => { g.crit = (g.crit || 0) + 0.15; } },
];

// 加载进度条 + 收款入口 UI
function showLoadingUI() {
  const wrap = document.createElement('div');
  wrap.id = 'loading-ui';
  wrap.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#1a1a2e;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:999';
  wrap.innerHTML = '<div style="color:#ddd;font:bold 18px Arial;margin-bottom:12px">⚔️ 深境地牢 加载中...</div><div style="width:260px;height:10px;background:#333;border-radius:5px;overflow:hidden"><div id="loading-bar" style="width:0%;height:100%;background:#e8794f;border-radius:5px;transition:width .3s"></div></div><div id="loading-pct" style="color:#aaa;font:12px Arial;margin-top:8px">0%</div>';
  document.body.appendChild(wrap);
  return {
    set(pct) {
      const bar = document.getElementById('loading-bar');
      const pctEl = document.getElementById('loading-pct');
      if (bar) bar.style.width = pct + '%';
      if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    },
    done() {
      const el = document.getElementById('loading-ui');
      if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }
    }
  };
}
// 收款入口（itch $1 + 爱发电）
function addDonateButtons() {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;bottom:10px;right:10px;display:flex;gap:8px;z-index:98';
  const btn = (text, url, bg) => {
    const a = document.createElement('a');
    a.textContent = text;
    a.href = url;
    a.target = '_blank';
    a.style.cssText = `background:${bg};color:#fff;font:bold 12px Arial;padding:8px 14px;border-radius:10px;text-decoration:none;box-shadow:0 2px 6px rgba(0,0,0,.3)`;
    return a;
  };
  wrap.appendChild(btn('💝 完整版 $1', 'https://zsy2026.itch.io/dungeon-roguelike', '#e8794f'));
  wrap.appendChild(btn('⚡ 爱发电赞助', 'https://afdian.com/a/zsy2026', '#6eb5ff'));
  document.body.appendChild(wrap);
}

export default function initDungeon() {
  const loading = showLoadingUI();
  const canvas = document.querySelector('canvas') || document.createElement('canvas');
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x5a4a6a);
  scene.fog = new THREE.Fog(0x5a4a6a, 22, 45);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const loader = new GLTFLoader();
  const models = {};
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const keys = {};

  // 灯光（地牢暗光）
  scene.add(new THREE.HemisphereLight(0xfff0d0, 0x6a5a8a, 2.2));
  const light = new THREE.DirectionalLight(0xffd0a0, 2.2);
  light.position.set(4, 10, 4);
  light.castShadow = true;
  scene.add(light);
  const torchLight = new THREE.PointLight(0xffa060, 12, 20);
  torchLight.position.set(0, 3, 0);
  scene.add(torchLight);

  function loadModel(path) {
    // 加超时（8s）：资源挂起时返回 null，保证加载不卡死
    return Promise.race([
      loader.loadAsync(path).then(g => {
        const m = g.scene;
        m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        return m;
      }),
      new Promise(res => setTimeout(() => res(null), 25000)),
    ]).catch(() => null);
  }
  let loadedCount = 0, totalToLoad = 0;
  async function ensure(name, path) {
    if (!(name in models)) { totalToLoad++; models[name] = await loadModel(path); loadedCount++; loading.set(loadedCount / Math.max(1, totalToLoad) * 100); }
    return models[name];
  }
  function place(name, x, y, z, scale, rotY) {
    const tpl = models[name];
    if (!tpl) return null;
    const m = tpl.clone();
    m.position.set(x, y, z);
    m.scale.setScalar(scale);
    m.rotation.y = rotY;
    scene.add(m);
    return m;
  }

  // 游戏状态
  const game = {
    hp: 100, maxHp: 100, room: 1, kills: 0, gold: 0,
    weaponIdx: 0, dmgMul: 1, rateMul: 1, spdMul: 1, crit: 0.05,
    nextAttack: 0, enemies: [], bullets: [], lastTime: 0,
    over: false, touchMove: null,
  };

  // 测试接口
  if (TEST) {
    window.__game_state = {
      get hp() { return Math.max(0, game.hp); },
      get score() { return game.kills; },
      get wave() { return game.room; },
      get weapons() { return WEAPONS.map(w => w.name); },
      get enemies() { return game.enemies.length; },
      get screen() { return game.over ? 'gameover' : 'game'; },
    };
  }

  // 玩家
  const player = new THREE.Group();
  scene.add(player);
  let playerModel = null;
  let weaponModel = null;
  // 几何体人形兜底（manneko 失败时用）
  function buildHuman() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8794f, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x4a3a6a, roughness: 0.6 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), mat); head.position.y = 1.5; g.add(head);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 8), dark); body.position.y = 1.0; g.add(body);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), mat); armL.position.set(-0.3, 1.1, 0); armL.rotation.z = 0.3; g.add(armL);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), mat); armR.position.set(0.3, 1.1, 0); armR.rotation.z = -0.3; g.add(armR);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6), dark); legL.position.set(-0.13, 0.3, 0); g.add(legL);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6), dark); legR.position.set(0.13, 0.3, 0); g.add(legR);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // 地牢构建（墙 + 地板 + 火把）
  async function buildRoom() {
    // 清旧
    scene.children.filter(c => c.userData.roomObj).forEach(c => scene.remove(c));
    game.enemies = [];
    // 地板
    const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a7a9a, roughness: 0.85 }));
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    floor.userData.roomObj = true;
    scene.add(floor);
    // 墙（四周）
    for (let i = -4; i <= 4; i += 2) {
      for (const z of [-5, 5]) {
        const w = new THREE.Mesh(wallGeo, wallMat);
        w.position.set(i, 0.9, z);
        w.castShadow = true; w.receiveShadow = true;
        w.userData.roomObj = true;
        scene.add(w);
      }
      for (const x of [-5, 5]) {
        const w = new THREE.Mesh(wallGeo, wallMat);
        w.position.set(x, 0.9, i);
        w.rotation.y = Math.PI / 2;
        w.castShadow = true; w.receiveShadow = true;
        w.userData.roomObj = true;
        scene.add(w);
      }
    }
    // 彩色水晶柱（提升色彩丰富度）
    const crystalColors = [0x6eb5ff, 0xff6b9d, 0x9a6bff, 0xffd166];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 1.4, 6),
        new THREE.MeshStandardMaterial({ color: crystalColors[i % 4], emissive: crystalColors[i % 4], emissiveIntensity: 0.6 })
      );
      c.position.set(Math.random() * 7 - 3.5, 0.7, Math.random() * 7 - 3.5);
      c.userData.roomObj = true;
      scene.add(c);
    }
    // 火把（照明）
    // 火把（几何体发光）
    for (const [fx, fz] of [[-4, -4.5], [4, -4.5], [-4, 4.5], [4, 4.5]]) {
      const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x5a3a20 }));
      torch.position.set(fx, 0.6, fz);
      torch.userData.roomObj = true;
      scene.add(torch);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 6),
        new THREE.MeshBasicMaterial({ color: 0xffa060 }));
      flame.position.set(fx, 1.4, fz);
      flame.userData.roomObj = true;
      scene.add(flame);
    }
    // 装饰：箱子（几何体）
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x8a6a3f, roughness: 0.7 }));
    chest.position.set(Math.random() * 4 - 2, 0.25, Math.random() * 4 - 2);
    chest.userData.roomObj = true;
    scene.add(chest);
    // 刷怪
    const count = 3 + game.room;
    for (let i = 0; i < count; i++) spawnEnemy();
  }

  function spawnEnemy() {
    const types = ENEMIES.slice(0, Math.min(ENEMIES.length, 1 + Math.floor(game.room / 2)));
    const t = types[Math.floor(Math.random() * types.length)];
    // 位置：环形分布（保证不在玩家旁），最多重试 5 次
    let x = 0, z = 0;
    for (let tryN = 0; tryN < 5; tryN++) {
      x = Math.random() * 6 - 3; z = Math.random() * 6 - 3;
      if (Math.hypot(x, z) >= 2.5) break;
      x = 3 + Math.random() * 2; z = 3 + Math.random() * 2;  // 兜底：放角落
    }
    // 卡通发光敌人（球体+眼睛，保证可见）
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.5 * t.scale, 12, 12),
      new THREE.MeshStandardMaterial({ color: t.color, emissive: t.color, emissiveIntensity: 0.35, roughness: 0.6 })
    );
    body.position.y = 0.6;
    g.add(body);
    // 眼睛
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeMat);
      eye.position.set(side * 0.18, 0.75, 0.4);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), pupilMat);
      pupil.position.set(side * 0.18, 0.75, 0.5);
      g.add(eye); g.add(pupil);
    }
    g.position.set(x, 0, z);
    g.castShadow = true;
    scene.add(g);
    game.enemies.push({ mesh: g, type: t, hp: t.hp, x, z, hitFlash: 0 });
  }

  // 武器攻击
  function attack() {
    const now = performance.now();
    if (now < game.nextAttack) return;
    const w = WEAPONS[game.weaponIdx];
    game.nextAttack = now + w.rate / (game.rateMul || 1) / SPEED;
    // 弹道（近战=挥舞，远程=投射物）
    if (w.range > 3) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.8),
        new THREE.MeshBasicMaterial({ color: w.color }));
      b.position.copy(player.position);
      b.position.y = 1.2;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      b.userData = { dir, dmg: w.dmg * (game.dmgMul || 1), range: w.range, dist: 0 };
      scene.add(b);
      game.bullets.push(b);
    } else {
      // 近战：挥砍特效 + 前方检测
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      swingEffect();
      for (const e of game.enemies) {
        const toE = new THREE.Vector3(e.x - player.position.x, 0, e.z - player.position.z);
        if (toE.length() < w.range) {
          const crit = Math.random() < (game.crit || 0.05);
          e.hp -= w.dmg * (game.dmgMul || 1) * (crit ? 2 : 1);
          e.hitFlash = 0.2;
          sfx(500, 0.1);
          if (e.hp <= 0) { killEnemy(e); }
        }
      }
    }
  }

  function killEnemy(e) {
    scene.remove(e.mesh);
    game.enemies = game.enemies.filter(x => x !== e);
    game.kills++;
    game.gold += 5 + game.room;
    if (game.enemies.length === 0 && game.room >= 1) showUpgrade();
  }

  // 几何体武器（剑：柄+刃+护手，按武器颜色）
  function buildWeapon(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3 });
    // 刃
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), mat);
    blade.position.y = 0.45;
    g.add(blade);
    // 尖端
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.25, 6), mat);
    tip.position.y = 0.95;
    g.add(tip);
    // 护手
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: 0x8a6a3f, metalness: 0.7 }));
    guard.position.y = 0.05;
    g.add(guard);
    // 柄
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0x5a3a20 }));
    handle.position.y = -0.15;
    g.add(handle);
    g.userData.isWeapon = true;
    return g;
  }

  // 挥砍特效（前方弧形闪光）
  let swingFx = null;
  function swingEffect() {
    if (swingFx) { scene.remove(swingFx); swingFx = null; }
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const cx = player.position.x + dir.x * 1.2;
    const cz = player.position.z + dir.z * 1.2;
    swingFx = new THREE.Mesh(
      new THREE.CircleGeometry(0.8, 16, 0, Math.PI * 0.8),
      new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    swingFx.position.set(cx, 0.8, cz);
    swingFx.lookAt(player.position.x, 0.8, player.position.z);
    scene.add(swingFx);
    setTimeout(() => { if (swingFx) { scene.remove(swingFx); swingFx = null; } }, 600 / SPEED);
  }

  // 升级三选一
  function showUpgrade() {
    if (game.over) return;
    const opts = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 3);
    const panel = document.createElement('div');
    panel.id = 'upgrade-panel';
    panel.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:99';
    panel.innerHTML = '<div style="color:#fff;font:bold 24px Arial;margin-bottom:8px">⚡ 选择升级</div>';
    opts.forEach(o => {
      const b = document.createElement('button');
      b.textContent = `${o.name} — ${o.desc}`;
      b.style.cssText = 'background:#e8794f;color:#fff;font:bold 16px Arial;padding:12px 30px;border:none;border-radius:12px;cursor:pointer';
      b.onclick = () => {
        o.apply(game);
        panel.remove();
        game.room++;
        buildRoom();
      };
      panel.appendChild(b);
    });
    document.body.appendChild(panel);
    // 测试模式自动选第一个
    if (TEST) setTimeout(() => { const b = panel.querySelector('button'); if (b) b.click(); }, 800 / SPEED);
  }

  // UI
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;top:10px;left:10px;font:bold 14px Arial;color:#ddd;background:rgba(0,0,0,0.6);padding:8px 12px;border-radius:10px;z-index:99';
  document.body.appendChild(hud);
  function updateHUD() {
    hud.innerHTML = `❤ ${Math.max(0, Math.round(game.hp))}/${game.maxHp} &nbsp;🔪 ${WEAPONS[game.weaponIdx].name} &nbsp;💀 ${game.kills} &nbsp;💰 ${game.gold} &nbsp;🏰 第${game.room}层`;
  }
  function flash(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;top:15%;left:50%;transform:translateX(-50%);font:bold 22px Arial;color:#ffe28a;background:rgba(0,0,0,0.7);padding:8px 18px;border-radius:12px;z-index:99;transition:opacity .8s;pointer-events:none';
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 800); }, 1400 / SPEED);
  }
  let bgm;
  function sfx(freq, dur) {
    try {
      if (!bgm) return;
      const o = bgm.ctx.createOscillator(), g = bgm.ctx.createGain();
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.08, bgm.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, bgm.ctx.currentTime + dur);
      o.connect(g).connect(bgm.ctx.destination);
      o.start(); o.stop(bgm.ctx.currentTime + dur);
    } catch (e) {}
  }

  // 输入
  window.addEventListener('keydown', e => { keys[e.code] = true; ensureAudio(); });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  renderer.domElement.addEventListener('pointerdown', e => {
    ensureAudio();
    game.touchMove = { x: e.clientX, y: e.clientY };
    attack();
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (game.touchMove) {
      const dx = e.clientX - game.touchMove.x, dy = e.clientY - game.touchMove.y;
      if (Math.abs(dx) + Math.abs(dy) > 20) {
        player.position.x += dx * 0.02 * (game.spdMul || 1);
        player.position.z += dy * 0.02 * (game.spdMul || 1);
        game.touchMove = { x: e.clientX, y: e.clientY };
      }
    }
  });
  renderer.domElement.addEventListener('pointerup', () => { game.touchMove = null; });
  function ensureAudio() { if (!bgm) { bgm = new BgmPlayer(); bgm.ensure(); bgm.play(); } }

  // 主循环
  function animate(time) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (time - game.lastTime) / 1000) * SPEED;
    game.lastTime = time;

    if (!game.over) {
      // 武器旋转展示
      if (weaponModel) weaponModel.rotation.y += dt * 2;
      // 玩家移动（WASD）
      let mx = 0, mz = 0;
      if (keys['KeyW'] || keys['ArrowUp']) mz -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) mz += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
      if (mx || mz) {
        const len = Math.hypot(mx, mz);
        player.position.x += mx / len * 3.2 * (game.spdMul || 1) * dt;
        player.position.z += mz / len * 3.2 * (game.spdMul || 1) * dt;
        player.position.x = Math.max(-4.5, Math.min(4.5, player.position.x));
        player.position.z = Math.max(-4.5, Math.min(4.5, player.position.z));
      }
      if (keys['Space']) attack();
      // 自动攻击（简化：有敌人在范围就攻击）
      if (TEST && game.enemies.length) attack();

      // 敌人 AI（追踪玩家）
      for (const e of [...game.enemies]) {
        const dx = player.position.x - e.x, dz = player.position.z - e.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.8) {
          e.x += dx / dist * e.type.speed * dt;
          e.z += dz / dist * e.type.speed * dt;
        } else {
          // 接触伤害
          game.hp -= e.type.dmg * dt;
          if (game.hp <= 0 && !game.over) gameOver();
        }
        e.mesh.position.x = e.x;
        e.mesh.position.z = e.z;
        if (e.hitFlash > 0) {
          e.hitFlash -= dt;
          e.mesh.traverse(o => { if (o.isMesh && o.material) o.material.emissive && o.material.emissive.setHex(0xff4444); });
        }
      }

      // 弹道更新
      for (const b of [...game.bullets]) {
        b.position.add(b.userData.dir.clone().multiplyScalar(10 * dt));
        b.userData.dist += 10 * dt;
        // 命中检测
        for (const e of game.enemies) {
          if (Math.hypot(e.x - b.position.x, e.z - b.position.z) < 0.6) {
            const crit = Math.random() < (game.crit || 0.05);
            e.hp -= b.userData.dmg * (crit ? 2 : 1);
            e.hitFlash = 0.2;
            scene.remove(b);
            game.bullets = game.bullets.filter(x => x !== b);
            if (e.hp <= 0) killEnemy(e);
            break;
          }
        }
        if (b.userData.dist > b.userData.range) {
          scene.remove(b);
          game.bullets = game.bullets.filter(x => x !== b);
        }
      }

      // 相机跟随
      camera.position.x = player.position.x;
      camera.position.z = player.position.z + 7;
      camera.position.y = 8;
      camera.lookAt(player.position.x, 1, player.position.z);
    }
    updateHUD();
    renderer.render(scene, camera);
  }

  function gameOver() {
    game.over = true;
    flash(`☠️ 倒在${game.room}层 · 击杀${game.kills}`);
    setTimeout(() => { if (confirm('再来一局？')) location.reload(); }, 1500 / SPEED);
  }

  // 启动
  async function start() {
    const base = (import.meta.env && import.meta.env.BASE_URL) || './';
    const A = `${base}assets/3d/`;
    // 并行加载（Promise.all，总耗时 = 最慢单个 ≤8s）
    await Promise.all([
      ensure('wall', `${A}environment/wall.gltf.glb`),
      ensure('torchWall', `${A}environment/torchWall.gltf.glb`),
      ensure('chest_common', `${A}environment/chest_common.gltf.glb`),
      ensure('player', `${A}characters/manneko_low_poly_girl.glb`),
      ...WEAPONS.map(w => ensure(w.name, `${A}weapons/${w.model}`)),
    ]);
    loading.set(100);
    // 玩家模型
    playerModel = place('player', 0, 0.4, 0, 0.8, 0);
    if (!playerModel) playerModel = buildHuman();
    if (playerModel) { player.add(playerModel); playerModel.position.y = 0; }
    // 武器（几何体剑，保证可见，不依赖 GLB）
    weaponModel = buildWeapon(WEAPONS[game.weaponIdx].color);
    player.add(weaponModel);
    weaponModel.position.set(0.9, 0.9, 0.4);
    weaponModel.rotation.z = -0.5;
    buildRoom();
    loading.done();
    donateButtons('dungeon-roguelike');
    donateButtons('dungeon-roguelike');
    flash('深境地牢 · WASD移动 · 点击/空格攻击');
    requestAnimationFrame(animate);
  }
  start();

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  onResize();
}
