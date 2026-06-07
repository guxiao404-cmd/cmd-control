const canvas = document.querySelector("#game");
const context = canvas?.getContext("2d");

if (!canvas || !context) {
  throw new Error("Game canvas is not available.");
}

const CONFIG = {
  worldWidth: 3600,
  worldHeight: canvas.height,
  minLaneY: 300,
  maxLaneY: 456,
  playerSpeed: 250,
  allySpeed: 205,
  enemySpeed: 116,
  attackRange: 92,
  skillRange: 150,
  aggroRange: 360,
};

const input = {
  keys: new Set(),
  joystickX: 0,
  joystickY: 0,
  targetPoint: null,
  attackQueued: false,
  skillQueued: false,
  rallyQueued: false,
};

const camera = { x: 0 };
const particles = [];

const player = {
  name: "玄甲校尉",
  x: 140,
  y: 398,
  width: 44,
  height: 72,
  facing: 1,
  hp: 140,
  maxHp: 140,
  rage: 42,
  maxRage: 100,
  attackCooldown: 0,
  skillCooldown: 0,
  rallyCooldown: 0,
  kills: 0,
};

const gate = {
  x: 3430,
  y: 292,
  width: 118,
  height: 182,
  hp: 260,
  maxHp: 260,
};

const allies = createAllies();
const enemies = createEnemies();
let selectedEnemy = null;
let gameState = "playing";
let message = "攻破黄巾营门。摇杆移动，点敌人锁定，右侧按钮出招。";
let messageTimer = 4;
let lastFrameTime = performance.now();

const keyBindings = new Map([
  ["arrowleft", "left"],
  ["a", "left"],
  ["arrowright", "right"],
  ["d", "right"],
  ["arrowup", "up"],
  ["w", "up"],
  ["arrowdown", "down"],
  ["s", "down"],
]);

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const bound = keyBindings.get(key);
  if (bound) {
    event.preventDefault();
    input.keys.add(bound);
  }

  if (key === "j") input.attackQueued = true;
  if (key === "k") input.skillQueued = true;
  if (key === "l") input.rallyQueued = true;
  if (key === "r") resetGame();
});

window.addEventListener("keyup", (event) => {
  const bound = keyBindings.get(event.key.toLowerCase());
  if (bound) input.keys.delete(bound);
});

setupActionButtons();
setupJoystick();
setupBattlefieldTouch();

function createAllies() {
  return [
    createSoldier("青州兵", 72, 420, "#60a5fa"),
    createSoldier("陷阵兵", 36, 372, "#93c5fd"),
    createSoldier("弓弩手", 10, 448, "#38bdf8"),
  ];
}

function createSoldier(name, x, y, color) {
  return {
    name,
    x,
    y,
    width: 34,
    height: 52,
    color,
    hp: 70,
    maxHp: 70,
    attackCooldown: 0,
    alive: true,
  };
}

function createEnemies() {
  return [
    createEnemy("黄巾刀兵", 760, 392, 80, 10),
    createEnemy("黄巾枪兵", 920, 340, 86, 11),
    createEnemy("黄巾力士", 1260, 430, 124, 15, 1.14),
    createEnemy("黄巾弓手", 1540, 322, 72, 9),
    createEnemy("黑山贼", 1880, 404, 92, 12),
    createEnemy("黑山贼", 2100, 352, 92, 12),
    createEnemy("渠帅亲卫", 2460, 424, 120, 16, 1.12),
    createEnemy("黄巾渠帅", 3040, 386, 210, 22, 1.28),
  ];
}

function createEnemy(name, x, y, hp, damage, scale = 1) {
  return {
    name,
    x,
    y,
    width: 40 * scale,
    height: 58 * scale,
    hp,
    maxHp: hp,
    damage,
    scale,
    attackCooldown: randomBetween(0.2, 1.1),
    alive: true,
  };
}

function setupActionButtons() {
  for (const button of document.querySelectorAll("[data-action]")) {
    const action = button.dataset.action;

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      input[`${action}Queued`] = true;
    });

    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }
}

function setupJoystick() {
  const joystick = document.querySelector("[data-joystick]");
  const knob = document.querySelector("[data-joystick-knob]");
  if (!joystick || !knob) return;

  let activePointerId = null;

  joystick.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    activePointerId = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    updateJoystick(event, joystick, knob);
  });

  joystick.addEventListener("pointermove", (event) => {
    if (event.pointerId === activePointerId) updateJoystick(event, joystick, knob);
  });

  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    joystick.addEventListener(eventName, () => {
      activePointerId = null;
      input.joystickX = 0;
      input.joystickY = 0;
      knob.style.transform = "translate(-50%, -50%)";
    });
  }
}

function updateJoystick(event, joystick, knob) {
  const bounds = joystick.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const maxDistance = bounds.width * 0.34;
  const deltaX = event.clientX - centerX;
  const deltaY = event.clientY - centerY;
  const distance = Math.hypot(deltaX, deltaY);
  const limitedDistance = Math.min(distance, maxDistance);
  const angle = Math.atan2(deltaY, deltaX);
  const knobX = Math.cos(angle) * limitedDistance;
  const knobY = Math.sin(angle) * limitedDistance;

  input.joystickX = distance > 8 ? knobX / maxDistance : 0;
  input.joystickY = distance > 8 ? knobY / maxDistance : 0;
  input.targetPoint = null;
  knob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
}

function setupBattlefieldTouch() {
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const point = screenToWorld(event.clientX, event.clientY);
    const enemy = findEnemyAt(point.x, point.y);

    if (enemy) {
      selectedEnemy = enemy;
      input.targetPoint = { x: enemy.x - player.facing * 66, y: enemy.y };
      input.attackQueued = true;
      message = `锁定目标：${enemy.name}`;
      messageTimer = 1.4;
      return;
    }

    selectedEnemy = null;
    input.targetPoint = {
      x: clamp(point.x, 0, CONFIG.worldWidth - 80),
      y: clamp(point.y, CONFIG.minLaneY, CONFIG.maxLaneY),
    };
    message = "已下达移动指令";
    messageTimer = 0.8;
  });
}

function screenToWorld(clientX, clientY) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((clientX - bounds.left) / bounds.width) * canvas.width + camera.x,
    y: ((clientY - bounds.top) / bounds.height) * canvas.height,
  };
}

function findEnemyAt(x, y) {
  return enemies.find((enemy) => enemy.alive && pointInRect(x, y, getBodyRect(enemy)));
}

function resetGame() {
  Object.assign(player, {
    x: 140,
    y: 398,
    facing: 1,
    hp: player.maxHp,
    rage: 42,
    attackCooldown: 0,
    skillCooldown: 0,
    rallyCooldown: 0,
    kills: 0,
  });

  gate.hp = gate.maxHp;
  selectedEnemy = null;
  input.targetPoint = null;
  input.attackQueued = false;
  input.skillQueued = false;
  input.rallyQueued = false;
  input.keys.clear();
  camera.x = 0;
  particles.length = 0;

  const freshAllies = createAllies();
  allies.splice(0, allies.length, ...freshAllies);
  const freshEnemies = createEnemies();
  enemies.splice(0, enemies.length, ...freshEnemies);

  gameState = "playing";
  message = "重整军势，再攻黄巾营门！";
  messageTimer = 2.4;
}

function update(deltaSeconds) {
  if (gameState === "playing") {
    updatePlayer(deltaSeconds);
    updateAllies(deltaSeconds);
    updateEnemies(deltaSeconds);
    updateGate();
  }

  updateParticles(deltaSeconds);
  updateCamera();
  messageTimer = Math.max(0, messageTimer - deltaSeconds);
}

function updatePlayer(deltaSeconds) {
  const manual = getManualMovement();
  let moveX = manual.x;
  let moveY = manual.y;

  if (Math.hypot(moveX, moveY) < 0.05 && input.targetPoint) {
    const toTargetX = input.targetPoint.x - player.x;
    const toTargetY = input.targetPoint.y - player.y;
    const distance = Math.hypot(toTargetX, toTargetY);

    if (distance > 8) {
      moveX = toTargetX / distance;
      moveY = toTargetY / distance;
    } else {
      input.targetPoint = null;
    }
  }

  moveCharacter(player, moveX, moveY, CONFIG.playerSpeed, deltaSeconds);
  player.attackCooldown = Math.max(0, player.attackCooldown - deltaSeconds);
  player.skillCooldown = Math.max(0, player.skillCooldown - deltaSeconds);
  player.rallyCooldown = Math.max(0, player.rallyCooldown - deltaSeconds);
  player.rage = clamp(player.rage + deltaSeconds * 5, 0, player.maxRage);

  if (input.attackQueued) performPlayerAttack();
  if (input.skillQueued) performPlayerSkill();
  if (input.rallyQueued) rallyAllies();

  input.attackQueued = false;
  input.skillQueued = false;
  input.rallyQueued = false;
}

function getManualMovement() {
  const keyX = Number(input.keys.has("right")) - Number(input.keys.has("left"));
  const keyY = Number(input.keys.has("down")) - Number(input.keys.has("up"));
  const x = keyX || input.joystickX;
  const y = keyY || input.joystickY;
  const length = Math.hypot(x, y);

  if (length <= 1) return { x, y };
  return { x: x / length, y: y / length };
}

function moveCharacter(character, moveX, moveY, speed, deltaSeconds) {
  if (Math.abs(moveX) > 0.05) character.facing = Math.sign(moveX);
  character.x = clamp(character.x + moveX * speed * deltaSeconds, 20, CONFIG.worldWidth - 80);
  character.y = clamp(character.y + moveY * speed * 0.72 * deltaSeconds, CONFIG.minLaneY, CONFIG.maxLaneY);
}

function performPlayerAttack() {
  if (player.attackCooldown > 0) return;

  player.attackCooldown = 0.34;
  const target = selectedEnemy?.alive ? selectedEnemy : findNearestEnemy(CONFIG.attackRange);
  spawnSlash(player.x + player.facing * 50, player.y - 22, "#f59e0b");

  if (target && distanceBetween(player, target) <= CONFIG.attackRange) {
    damageEnemy(target, 24, "破甲斩");
    player.rage = clamp(player.rage + 8, 0, player.maxRage);
  } else if (distanceToGate() <= CONFIG.attackRange) {
    damageGate(18);
  } else {
    message = "敌人还在攻击距离外";
    messageTimer = 0.9;
  }
}

function performPlayerSkill() {
  if (player.skillCooldown > 0) {
    message = "无双还在冷却";
    messageTimer = 0.9;
    return;
  }

  if (player.rage < 45) {
    message = "怒气不足，继续普攻积攒怒气";
    messageTimer = 1.2;
    return;
  }

  player.skillCooldown = 4.8;
  player.rage -= 45;
  spawnShockwave(player.x, player.y, CONFIG.skillRange);
  let hits = 0;

  for (const enemy of enemies) {
    if (enemy.alive && distanceBetween(player, enemy) <= CONFIG.skillRange) {
      damageEnemy(enemy, 46, "无双乱舞");
      hits += 1;
    }
  }

  if (distanceToGate() <= CONFIG.skillRange + 40) damageGate(34);
  message = hits > 0 ? `无双乱舞命中 ${hits} 名敌军` : "无双挥空，靠近敌军再放";
  messageTimer = 1.4;
}

function rallyAllies() {
  if (player.rallyCooldown > 0) {
    message = "亲兵正在整队";
    messageTimer = 0.9;
    return;
  }

  player.rallyCooldown = 5.5;
  for (const ally of allies) {
    ally.alive = true;
    ally.hp = Math.min(ally.maxHp, ally.hp + 28);
    ally.x = player.x - randomBetween(42, 92);
    ally.y = clamp(player.y + randomBetween(-38, 38), CONFIG.minLaneY, CONFIG.maxLaneY);
  }

  message = "亲兵集结！一起推进战线。";
  messageTimer = 1.5;
}

function updateAllies(deltaSeconds) {
  allies.forEach((ally, index) => {
    if (!ally.alive) return;

    ally.attackCooldown = Math.max(0, ally.attackCooldown - deltaSeconds);
    const target = findNearestEnemy(210, ally) ?? selectedEnemy;
    const formation = {
      x: player.x - 64 - index * 36,
      y: clamp(player.y + (index - 1) * 34, CONFIG.minLaneY, CONFIG.maxLaneY),
    };

    if (target?.alive) {
      const distance = distanceBetween(ally, target);
      if (distance > 62) {
        moveToward(ally, target, CONFIG.allySpeed, deltaSeconds);
      } else if (ally.attackCooldown <= 0) {
        ally.attackCooldown = 0.78;
        damageEnemy(target, 10, ally.name);
        spawnSlash(ally.x + 28, ally.y - 18, ally.color);
      }
    } else {
      moveToward(ally, formation, CONFIG.allySpeed, deltaSeconds);
    }
  });
}

function updateEnemies(deltaSeconds) {
  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - deltaSeconds);
    const target = findEnemyTarget(enemy);

    if (target && distanceBetween(enemy, target) > 58) {
      moveToward(enemy, target, CONFIG.enemySpeed * enemy.scale, deltaSeconds);
    } else if (target && enemy.attackCooldown <= 0) {
      enemy.attackCooldown = 1.1;
      damageHero(target, enemy.damage);
      spawnSlash(enemy.x - 26, enemy.y - 18, "#dc2626");
    }
  }
}

function findEnemyTarget(enemy) {
  const livingAllies = allies.filter((ally) => ally.alive);
  const candidates = [player, ...livingAllies];
  return candidates
    .filter((candidate) => distanceBetween(enemy, candidate) <= CONFIG.aggroRange)
    .sort((a, b) => distanceBetween(enemy, a) - distanceBetween(enemy, b))[0];
}

function damageHero(target, damage) {
  target.hp -= damage;

  if (target === player) {
    message = `受到 ${damage} 点伤害`;
    messageTimer = 0.8;
  }

  if (target.hp <= 0) {
    if (target === player) {
      player.hp = 0;
      gameState = "lost";
      message = "主将倒下，战役失败。按 R 重新开始。";
      messageTimer = Number.POSITIVE_INFINITY;
      return;
    }

    target.alive = false;
  }
}

function damageEnemy(enemy, damage, source) {
  enemy.hp -= damage;
  spawnDamageNumber(enemy.x, enemy.y - enemy.height, damage);

  if (enemy.hp <= 0) {
    enemy.alive = false;
    player.kills += 1;
    player.rage = clamp(player.rage + 13, 0, player.maxRage);
    if (selectedEnemy === enemy) selectedEnemy = null;
    message = `${source} 击破 ${enemy.name}`;
    messageTimer = 1.2;
  }
}

function damageGate(damage) {
  gate.hp = Math.max(0, gate.hp - damage);
  spawnDamageNumber(gate.x + 36, gate.y, damage);
  message = `营门耐久 ${gate.hp}/${gate.maxHp}`;
  messageTimer = 1;
}

function updateGate() {
  if (gate.hp > 0) return;

  gameState = "won";
  message = `攻破营门！斩敌 ${player.kills}，暗黑三国原型通关。按 R 再战。`;
  messageTimer = Number.POSITIVE_INFINITY;
}

function moveToward(character, target, speed, deltaSeconds) {
  const deltaX = target.x - character.x;
  const deltaY = target.y - character.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance < 3) return;
  moveCharacter(character, deltaX / distance, deltaY / distance, speed, deltaSeconds);
}

function findNearestEnemy(range, origin = player) {
  return enemies
    .filter((enemy) => enemy.alive && distanceBetween(origin, enemy) <= range)
    .sort((a, b) => distanceBetween(origin, a) - distanceBetween(origin, b))[0];
}

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToGate() {
  return Math.hypot(player.x - gate.x, player.y - (gate.y + gate.height * 0.72));
}

function getBodyRect(character) {
  return {
    x: character.x - character.width / 2,
    y: character.y - character.height,
    width: character.width,
    height: character.height,
  };
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function updateCamera() {
  const targetX = player.x - canvas.width * 0.38;
  camera.x = clamp(targetX, 0, CONFIG.worldWidth - canvas.width);
}

function updateParticles(deltaSeconds) {
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index];
    particle.life -= deltaSeconds;
    particle.x += particle.velocityX * deltaSeconds;
    particle.y += particle.velocityY * deltaSeconds;
    if (particle.life <= 0) particles.splice(index, 1);
  }
}

function spawnSlash(x, y, color) {
  particles.push({ type: "slash", x, y, color, life: 0.22, velocityX: 0, velocityY: 0 });
}

function spawnShockwave(x, y, radius) {
  particles.push({ type: "shockwave", x, y, radius, color: "#f59e0b", life: 0.48, velocityX: 0, velocityY: 0 });
}

function spawnDamageNumber(x, y, damage) {
  particles.push({ type: "damage", x, y, text: `-${damage}`, color: "#fecaca", life: 0.75, velocityX: 0, velocityY: -34 });
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function render() {
  drawBackground();
  context.save();
  context.translate(-camera.x, 0);
  drawWarRoad();
  drawTargetMarker();
  drawGate();
  drawCharacters();
  drawParticles();
  context.restore();
  drawHud();
}

function drawBackground() {
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#020617");
  gradient.addColorStop(0.55, "#111827");
  gradient.addColorStop(1, "#3f1d0b");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "rgba(127, 29, 29, 0.28)";
  for (let i = 0; i < 7; i += 1) {
    const x = (i * 210 - camera.x * 0.18) % (canvas.width + 260);
    context.beginPath();
    context.ellipse(x, 112 + (i % 3) * 32, 120, 26, -0.12, 0, Math.PI * 2);
    context.fill();
  }

  context.fillStyle = "rgba(15, 23, 42, 0.62)";
  context.beginPath();
  context.moveTo(0, 282);
  for (let x = -40; x < canvas.width + 80; x += 90) {
    context.lineTo(x, 236 + Math.sin((x + camera.x * 0.25) * 0.012) * 24);
  }
  context.lineTo(canvas.width, 540);
  context.lineTo(0, 540);
  context.fill();
}

function drawWarRoad() {
  context.fillStyle = "#2f1f15";
  context.fillRect(camera.x - 40, 282, canvas.width + 80, 206);
  context.fillStyle = "rgba(248, 113, 113, 0.08)";
  context.fillRect(camera.x - 40, 300, canvas.width + 80, 32);
  context.fillRect(camera.x - 40, 426, canvas.width + 80, 30);

  context.strokeStyle = "rgba(251, 191, 36, 0.15)";
  context.lineWidth = 2;
  for (let x = 0; x < CONFIG.worldWidth; x += 180) {
    context.beginPath();
    context.moveTo(x, 296);
    context.lineTo(x + 70, 482);
    context.stroke();
  }

  drawBanner(520, 275, "汉");
  drawBanner(1710, 270, "讨");
  drawBanner(2820, 268, "黄");
}

function drawBanner(x, y, text) {
  context.fillStyle = "#1f2937";
  context.fillRect(x, y - 16, 8, 114);
  context.fillStyle = "#991b1b";
  context.fillRect(x + 8, y, 48, 62);
  context.fillStyle = "#fde68a";
  context.font = "700 24px serif";
  context.fillText(text, x + 20, y + 40);
}

function drawTargetMarker() {
  if (!input.targetPoint) return;

  context.strokeStyle = "rgba(251, 191, 36, 0.75)";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(input.targetPoint.x, input.targetPoint.y - 8, 20, 0, Math.PI * 2);
  context.stroke();
}

function drawGate() {
  context.fillStyle = "#1f2937";
  context.fillRect(gate.x, gate.y, gate.width, gate.height);
  context.fillStyle = "#7f1d1d";
  context.fillRect(gate.x + 16, gate.y + 26, gate.width - 32, gate.height - 26);
  context.fillStyle = "#f59e0b";
  context.fillRect(gate.x + 12, gate.y + 62, gate.width - 24, 10);
  drawHealthBar(gate.x, gate.y - 16, gate.width, gate.hp, gate.maxHp, "#f97316");
}

function drawCharacters() {
  const drawList = [
    ...allies.filter((ally) => ally.alive).map((ally) => ({ type: "ally", item: ally })),
    ...enemies.filter((enemy) => enemy.alive).map((enemy) => ({ type: "enemy", item: enemy })),
    { type: "player", item: player },
  ].sort((a, b) => a.item.y - b.item.y);

  for (const entry of drawList) {
    if (entry.type === "player") drawPlayer();
    if (entry.type === "ally") drawSoldier(entry.item);
    if (entry.type === "enemy") drawEnemy(entry.item);
  }
}

function drawPlayer() {
  const rect = getBodyRect(player);
  context.fillStyle = "rgba(0, 0, 0, 0.35)";
  context.beginPath();
  context.ellipse(player.x, player.y + 3, 30, 9, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#0ea5e9";
  context.fillRect(rect.x, rect.y + 16, rect.width, rect.height - 16);
  context.fillStyle = "#e5e7eb";
  context.fillRect(rect.x + 8, rect.y, rect.width - 16, 20);
  context.fillStyle = "#f59e0b";
  context.fillRect(player.x + player.facing * 16, player.y - 40, player.facing * 54, 7);
  drawHealthBar(rect.x - 10, rect.y - 14, rect.width + 20, player.hp, player.maxHp, "#22c55e");
}

function drawSoldier(soldier) {
  const rect = getBodyRect(soldier);
  context.fillStyle = "rgba(0, 0, 0, 0.32)";
  context.beginPath();
  context.ellipse(soldier.x, soldier.y + 3, 23, 7, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = soldier.color;
  context.fillRect(rect.x, rect.y + 12, rect.width, rect.height - 12);
  context.fillStyle = "#cbd5e1";
  context.fillRect(rect.x + 8, rect.y, rect.width - 16, 16);
  drawHealthBar(rect.x - 4, rect.y - 10, rect.width + 8, soldier.hp, soldier.maxHp, "#38bdf8");
}

function drawEnemy(enemy) {
  const rect = getBodyRect(enemy);
  const selected = selectedEnemy === enemy;
  context.fillStyle = "rgba(0, 0, 0, 0.42)";
  context.beginPath();
  context.ellipse(enemy.x, enemy.y + 3, 27 * enemy.scale, 8, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = selected ? "#f97316" : "#991b1b";
  context.fillRect(rect.x, rect.y + 12, rect.width, rect.height - 12);
  context.fillStyle = "#450a0a";
  context.fillRect(rect.x + 8, rect.y, rect.width - 16, 18);
  drawHealthBar(rect.x - 4, rect.y - 12, rect.width + 8, enemy.hp, enemy.maxHp, "#ef4444");
}

function drawHealthBar(x, y, width, value, max, color) {
  context.fillStyle = "rgba(15, 23, 42, 0.82)";
  context.fillRect(x, y, width, 7);
  context.fillStyle = color;
  context.fillRect(x, y, width * clamp(value / max, 0, 1), 7);
}

function drawParticles() {
  for (const particle of particles) {
    const alpha = clamp(particle.life / 0.75, 0, 1);
    context.save();
    context.globalAlpha = alpha;

    if (particle.type === "slash") {
      context.strokeStyle = particle.color;
      context.lineWidth = 8;
      context.beginPath();
      context.arc(particle.x, particle.y, 34, -0.8, 0.8);
      context.stroke();
    }

    if (particle.type === "shockwave") {
      context.strokeStyle = particle.color;
      context.lineWidth = 5;
      const progress = 1 - particle.life / 0.48;
      context.beginPath();
      context.arc(particle.x, particle.y - 18, particle.radius * progress, 0, Math.PI * 2);
      context.stroke();
    }

    if (particle.type === "damage") {
      context.fillStyle = particle.color;
      context.font = "800 20px Inter, sans-serif";
      context.fillText(particle.text, particle.x, particle.y);
    }

    context.restore();
  }
}

function drawHud() {
  context.fillStyle = "rgba(2, 6, 23, 0.78)";
  context.fillRect(18, 16, 360, 104);
  context.fillStyle = "#e5e7eb";
  context.font = "800 20px Inter, sans-serif";
  context.fillText(`${player.name} · PAL-LX9 横屏`, 34, 44);
  drawHudBar(34, 58, 190, player.hp, player.maxHp, "#22c55e", "生命");
  drawHudBar(34, 84, 190, player.rage, player.maxRage, "#f59e0b", "怒气");
  context.fillStyle = "#cbd5e1";
  context.font = "700 16px Inter, sans-serif";
  context.fillText(`斩敌 ${player.kills}/${enemies.length}`, 246, 72);
  context.fillText(`营门 ${gate.hp}/${gate.maxHp}`, 246, 98);

  context.fillStyle = "rgba(2, 6, 23, 0.78)";
  context.fillRect(canvas.width - 274, 16, 256, 88);
  context.fillStyle = "#fde68a";
  context.font = "700 16px Inter, sans-serif";
  context.fillText("操作：摇杆 / 点击地面 / 点敌锁定", canvas.width - 258, 48);
  context.fillText("键盘：WASD · J斩 · K无双 · L集结", canvas.width - 258, 76);

  if (messageTimer > 0) {
    context.fillStyle = "rgba(2, 6, 23, 0.82)";
    context.fillRect(210, 462, 540, 52);
    context.fillStyle = "#f8fafc";
    context.font = "800 18px Inter, sans-serif";
    context.textAlign = "center";
    context.fillText(message, canvas.width / 2, 494);
    context.textAlign = "start";
  }
}

function drawHudBar(x, y, width, value, max, color, label) {
  context.fillStyle = "rgba(15, 23, 42, 0.9)";
  context.fillRect(x, y, width, 14);
  context.fillStyle = color;
  context.fillRect(x, y, width * clamp(value / max, 0, 1), 14);
  context.fillStyle = "#f8fafc";
  context.font = "700 11px Inter, sans-serif";
  context.fillText(label, x + 6, y + 11);
}

function gameLoop(currentTime) {
  const deltaSeconds = Math.min((currentTime - lastFrameTime) / 1000, 0.05);
  lastFrameTime = currentTime;

  update(deltaSeconds);
  render();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
