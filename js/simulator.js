// ===================== JS Color Swatches Update =====================
// 更新 JS 中的颜色变量，去掉红色和橙色，替换为亮蓝、青色和金色。
const C = {
  blue:   '#00cfff', // 亮蓝色
  cyan:   '#4ecca3', // 青色
  gold:   '#f0c040', // 金色
  gray:   '#8899aa', // 灰色
  bg:     '#16213e', // 深蓝背景 stop
};

const HAS_REAL = !!(window.SIM_DATA && window.SIM_DATA.rabi && window.SIM_DATA.entangle);
if (HAS_REAL) console.log('Using qutip-generated data');
else console.log('Using mock data (generate data with: python gui/generate_data.py)');

// ===================== MOCK DATA ENGINE =====================
function generateRabiData(omega, delta, gamma, tMax, nPts) {
  nPts = nPts || 200;
  const t = Array.from({length: nPts}, (_, i) => i * tMax / (nPts - 1));
  const OmegaEff = Math.sqrt(omega * omega + delta * delta);
  let Pg, Pe;
  if (OmegaEff < 1e-9) {
    Pg = t.map(() => 1);
    Pe = t.map(() => 0);
  } else {
    const sinAlpha = OmegaEff < 1e-9 ? 0 : omega / OmegaEff;
    const cosAlpha = OmegaEff < 1e-9 ? 1 : delta / OmegaEff;
    const sin2a = sinAlpha * sinAlpha;
    const cos2a = cosAlpha * cosAlpha;
    Pg = t.map(ti => {
      const rz = cos2a + sin2a * Math.cos(OmegaEff * ti);
      const damping = Math.exp(-gamma * ti);
      return 0.5 * (1 + rz) * damping + 0.5 * (1 - damping);
    });
    Pe = t.map(ti => {
      const rz = cos2a + sin2a * Math.cos(OmegaEff * ti);
      const damping = Math.exp(-gamma * ti);
      return 0.5 * (1 - rz) * damping;
    });
  }
  // Bloch trajectory
  const sinAlpha = OmegaEff < 1e-9 ? 0 : omega / OmegaEff;
  const cosAlpha = OmegaEff < 1e-9 ? 1 : delta / OmegaEff;
  const bx = [], by = [], bz = [];
  t.forEach(ti => {
    const damp = Math.exp(-gamma * ti);
    const cosOt = Math.cos(OmegaEff * ti);
    const sinOt = Math.sin(OmegaEff * ti);
    bx.push((cosAlpha * sinAlpha * (1 - cosOt)) * damp);
    by.push((-sinAlpha * sinOt) * damp);
    bz.push((cosAlpha * cosAlpha + sinAlpha * sinAlpha * cosOt) * damp);
  });
  return { t, Pg, Pe, bx, by, bz, omega, delta, gamma, tMax };
}

function generateMSData(eta, omega, delta, n0, gamma, tMax, nPts) {
  nPts = nPts || 200;
  const t = Array.from({length: nPts}, (_, i) => i * tMax / (nPts - 1));
  const g = eta * omega / 2;
  const deltaEff = delta * 2 * Math.PI; // effective detuning
  const gateT = (deltaEff > 0) ? 2 * Math.PI / deltaEff : Infinity;

  const A = t.map(ti => {
    if (deltaEff < 1e-9) return 0;
    return (g * g) / (deltaEff * deltaEff) * (deltaEff * ti - Math.sin(deltaEff * ti));
  });

  const theta = A.map(a => 2 * a); // θ = 2A, for |gg> → cosθ|gg> - i sinθ|ee>
  
  // With temperature n0, the fidelity drops
  const tempFactor = Math.exp(-n0 * 0.1); // simplified thermal effect

  const Pgg = theta.map(th => {
    const c = Math.cos(th);
    const damp = Math.exp(-gamma * t[theta.indexOf(th)]);
    return (c * c * tempFactor + (1 - tempFactor) * 0.25) * damp + (1 - damp) * 0.25;
  });
  const Pee = theta.map(th => {
    const s = Math.sin(th);
    const damp = Math.exp(-gamma * t[theta.indexOf(th)]);
    return (s * s * tempFactor + (1 - tempFactor) * 0.25) * damp + (1 - damp) * 0.25;
  });
  // Intermediate Pge/Peg peak between gate times
  const Pge = theta.map((th, i) => {
    const phase = deltaEff * t[i];
    const midPop = Math.sin(deltaEff * t[i] / 2);
    const damp = Math.exp(-gamma * t[i]);
    return (Math.abs(midPop) * Math.abs(Math.sin(2 * th)) * 0.5 * tempFactor) * damp;
  });
  const Peg = Pge.map(v => v); // symmetric

  const concurrence = theta.map((th, i) => {
    const damp = Math.exp(-gamma * t[i]);
    return Math.abs(Math.sin(2 * th)) * tempFactor * damp;
  });

  // Motional coherent amplitude α = (g/δ)(1 - e^{iδt})
  const alphaRe = t.map(ti => {
    if (deltaEff < 1e-9) return 0;
    return (g / deltaEff) * (1 - Math.cos(deltaEff * ti));
  });
  const alphaIm = t.map(ti => {
    if (deltaEff < 1e-9) return 0;
    return (g / deltaEff) * Math.sin(deltaEff * ti);
  });
  const nbar = t.map(ti => {
    if (deltaEff < 1e-9) return 0;
    return (g * g) / (deltaEff * deltaEff) * 2 * (1 - Math.cos(deltaEff * ti));
  });

  // Bell fidelity = (cosθ + sinθ)² / 2 (for optimal phase)
  const bellFid = theta.map((th, i) => {
    const damp = Math.exp(-gamma * t[i]);
    const raw = (Math.cos(th) + Math.sin(th)) ** 2 / 2;
    return raw * tempFactor * damp + 0.25 * (1 - tempFactor * damp);
  });

  const parity = theta.map(th => {
    return Math.cos(th) ** 2 + Math.sin(th) ** 2; // always 1 for this subspace
  });

  return { t, Pgg, Pee, Pge, Peg, concurrence, alphaRe, alphaIm, nbar, bellFid, parity, gateT, eta, omega, delta, n0, gamma, tMax };
}

// ===================== DATA SOURCE SWITCHER =====================
function getRabiData(omega, delta, gamma, tMax) {
  if (HAS_REAL) {
    const key = document.getElementById('rabi-preset').value;
    const real = window.SIM_DATA.rabi[key];
    if (real) {
      // Use real data, slice to tMax
      const t = real.t;
      const idx = t.findIndex(ti => ti >= tMax);
      const n = (idx > 0) ? idx + 1 : t.length;
      return {
        t: t.slice(0, n),
        Pg: real.Pg.slice(0, n),
        Pe: real.Pe.slice(0, n),
        bx: real.bx.slice(0, n),
        by: real.by.slice(0, n),
        bz: real.bz.slice(0, n),
        omega, delta, gamma, tMax,
      };
    }
  }
  return generateRabiData(omega, delta, gamma, tMax);
}

function getEntangleData(eta, omega, delta, n0, gamma, tMax) {
  if (HAS_REAL) {
    const key = document.getElementById('ent-preset').value;
    const real = window.SIM_DATA.entangle[key];
    if (real) {
      const t = real.t;
      const idx = t.findIndex(ti => ti >= tMax);
      const n = (idx > 0) ? idx + 1 : t.length;
      return {
        t: t.slice(0, n),
        Pgg: real.Pgg.slice(0, n), Pee: real.Pee.slice(0, n),
        Pge: real.Pge.slice(0, n), Peg: real.Peg.slice(0, n),
        concurrence: real.concurrence.slice(0, n),
        parity: real.parity.slice(0, n),
        nbar: real.nbar.slice(0, n),
        bellFid: real.bell_fid.slice(0, n),
        gateT: real.gate_time,
        alphaRe: real.alpha_re.slice(0, n),
        alphaIm: real.alpha_im.slice(0, n),
        eta, omega, delta, n0, gamma, tMax,
      };
    }
  }
  return generateMSData(eta, omega, delta, n0, gamma, tMax);
}

// ===================== CHART.JS HELPERS =====================
function makeLineChart(canvasId, datasets, yMin, yMax, xLabel, yLabel) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  const existing = Chart.getChart(canvasId);
  
  // 🚀 核心修复：如果图表已存在，只更新数据，不销毁重建
  if (existing) {
    existing.data.datasets = datasets;
    existing.update('none'); // 'none' 表示关闭过渡动画，保证拖动时的实时跟手感
    return existing;
  }
  
  // 如果图表不存在，则首次创建
  return new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: false,
      layout: { padding: { bottom: 12 } },
      scales: {
        x: { type:'linear', title:{display:!!xLabel, text:xLabel||'', color:C.gray}, ticks:{color:C.gray}, grid:{color:'#ffffff10'} },
        y: { min:yMin, max:yMax, title:{display:!!yLabel, text:yLabel||'', color:C.gray}, ticks:{color:C.gray}, grid:{color:'#ffffff10'} }
      },
      plugins: {
        legend: { labels:{color:C.gray, usePointStyle:true, boxWidth:8} }
      }
    }
  });
}

function dataset(label, data, color, dash) {
  return {
    label, data, borderColor: color, backgroundColor: color + '20',
    borderWidth: 1.5, pointRadius: 0, tension: 0.1,
    borderDash: dash || [],
  };
}

// ===================== RABI PAGE =====================
let rabiChart, blochData;

function updateRabi() {
  const omega = parseFloat(document.getElementById('rabi-omega').value);
  const delta = parseFloat(document.getElementById('rabi-delta').value);
  const gamma = parseFloat(document.getElementById('rabi-gamma').value);
  const tMax  = parseFloat(document.getElementById('rabi-tmax').value);
  
  document.getElementById('val-rabi-omega').textContent = omega.toFixed(2);
  document.getElementById('val-rabi-delta').textContent = delta.toFixed(2);
  document.getElementById('val-rabi-tmax').textContent = tMax.toFixed(1);
  document.getElementById('val-rabi-gamma').textContent = gamma.toFixed(2);
  
  blochData = getRabiData(omega, delta, gamma, tMax);
  const d = blochData;
  
  // ===================== CSS MODIFIED: Rabi pop chart data color change =====================
  // 基态改为金色，激发态改为亮蓝
  const xy = d.t.map((ti, i) => ({x:ti, y:d.Pg[i]}));
  const xy2 = d.t.map((ti, i) => ({x:ti, y:d.Pe[i]}));
  rabiChart = makeLineChart('chart-rabi-pop', [
    dataset('基态 P(g)', xy, C.gold),
    dataset('激发态 P(e)', xy2, C.blue),
  ], -0.05, 1.05, '时间 t', '布居数');
  
  // Update Bloch sphere
  updateBlochSphere(d);
  
  // Update tip
  const OmegaEff = Math.sqrt(omega*omega + delta*delta);
  const period = OmegaEff > 0.01 ? (2*Math.PI/OmegaEff).toFixed(1) : '∞';
  let tip = '';
  if (delta < 0.01 && gamma < 0.01) {
    tip = `当前 <em>Rabi 频率 Ω = ${omega.toFixed(2)}</em>，<em>失谐 δ = ${delta.toFixed(2)}</em>。基态与激发态之间发生完全 Rabi 振荡，周期为 <em>2π/Ω ≈ ${period}</em>。`;
  } else if (gamma > 0.01) {
    tip = `耗散速率 <em>γ = ${gamma.toFixed(2)}</em> 使振荡幅度随时间指数衰减，系统最终趋向基态。`;
  } else {
    tip = `失谐 <em>δ = ${delta.toFixed(2)}</em> 时，振荡频率增大为 <em>Ω_eff = ${OmegaEff.toFixed(2)}</em>，但振荡幅度减小，不再能达到纯激发态。`;
  }
  document.getElementById('tip-rabi').innerHTML = tip;
}

// ===================== BLOCH SPHERE RENDERER (THREE.JS VERSION) =====================
let threeBloch; // 全局变量存储 3D 实例

function initThreeBloch() {
  const container = document.getElementById('bloch-sphere');
  if (!container || threeBloch) return; 

  threeBloch = { scene: null, camera: null, renderer: null, stateArrow: null, pathMesh: null };
  
  const W = container.clientWidth;
  const H = container.clientHeight || 320; 

  // 1. 场景与相机初始化 (调整了绝佳的观察视角)
  threeBloch.scene = new THREE.Scene();
  threeBloch.camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
  threeBloch.camera.position.set(2.2, 1.2, 2.8); 
  threeBloch.camera.lookAt(0, 0, 0);

  threeBloch.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  threeBloch.renderer.setSize(W, H);
  threeBloch.renderer.setPixelRatio(window.devicePixelRatio); // 高清渲染
  container.innerHTML = ''; 
  container.appendChild(threeBloch.renderer.domElement);

  const C_CYAN = 0x53a8b6; // 球体网格青色
  const C_BLUE = 0x00cfff; // 向下箭头亮蓝色
  const C_GOLD = 0xf0c040; // 态矢量金色

  // 2. 绘制经纬网格球体 (完美还原图片的线框球)
  const globeGroup = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: C_CYAN, transparent: true, opacity: 0.35 });
  
  // 绘制 8 条经线
  for (let i = 0; i < 8; i++) {
    const geo = new THREE.BufferGeometry();
    const pts = [];
    for (let j = 0; j <= 64; j++) {
      const a = (j / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0));
    }
    geo.setFromPoints(pts);
    const circle = new THREE.Line(geo, lineMat);
    circle.rotation.y = (i * Math.PI) / 8;
    globeGroup.add(circle);
  }
  
  // 绘制 7 条纬线
  for (let i = 1; i < 8; i++) {
    const y = Math.cos((i * Math.PI) / 8);
    const r = Math.sin((i * Math.PI) / 8);
    const geo = new THREE.BufferGeometry();
    const pts = [];
    for (let j = 0; j <= 64; j++) {
      const a = (j / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)));
    }
    geo.setFromPoints(pts);
    const circle = new THREE.Line(geo, lineMat);
    circle.position.y = y;
    globeGroup.add(circle);
  }
  threeBloch.scene.add(globeGroup);

  // 3. 绘制贯穿球心的内部坐标轴交叉线
  const axesGroup = new THREE.Group();
  const axisMat = new THREE.LineBasicMaterial({ color: C_CYAN, opacity: 0.6, transparent: true });
  const drawAxis = (x, y, z) => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-x,-y,-z), new THREE.Vector3(x,y,z)]);
    axesGroup.add(new THREE.Line(geo, axisMat));
  };
  drawAxis(1, 0, 0); drawAxis(0, 1, 0); drawAxis(0, 0, 1);
  threeBloch.scene.add(axesGroup);

  // 4. 固定的向下箭头 (|1>态) 与运动的向上态矢量 (|0>态)
  const fixedArrow = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,0), 0.98, C_BLUE, 0.15, 0.1);
  threeBloch.scene.add(fixedArrow);

  threeBloch.stateArrow = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,0), 0.98, C_GOLD, 0.15, 0.1);
  threeBloch.scene.add(threeBloch.stateArrow);

  // 5. 生成 3D 悬浮文字标签
  const createLabel = (text, pos, color = 'white') => {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.set(0.35, 0.35, 0.35);
    threeBloch.scene.add(sprite);
  };
  createLabel('|0>', new THREE.Vector3(0, 1.15, 0));
  createLabel('|1>', new THREE.Vector3(0, -1.15, 0));
  createLabel('x', new THREE.Vector3(1.15, 0, 0));
  createLabel('y', new THREE.Vector3(0, 0, 1.15));

  // 初次静态渲染
  threeBloch.renderer.render(threeBloch.scene, threeBloch.camera);
}

// 辅助函数：创建全息文本
function createThreeText(text, pos, color, size, isStateLabel) {
  // 由于直接创建3D文字比较复杂，这里使用简化的全息数据气泡方案
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${isStateLabel ? 48 : 32}px sans-serif`;
  ctx.fillStyle = `#${color.toString(16)}`;
  ctx.textAlign = 'center';
  ctx.fillText(text, 256, 128);
  
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.set(pos.x, pos.y, pos.z);
  sprite.scale.set(size * 2, size, 1);
  threeBloch.scene.add(sprite);
}

// 修改后的数据更新函数：实时更新 3D 球体中的态矢量和路径
function updateBlochSphere(d) {
  initThreeBloch();
  if (!threeBloch) return;

  // 每次更新时重置尺寸，防止椭球变形
  const container = document.getElementById('bloch-sphere');
  const W = container.clientWidth;
  const H = container.clientHeight || 320;
  threeBloch.camera.aspect = W / H;
  threeBloch.camera.updateProjectionMatrix();
  threeBloch.renderer.setSize(W, H);

  // 1. 更新态矢量 (金色箭头) 的指向
  const lastIdx = d.bx.length - 1;
  const targetDir = new THREE.Vector3(d.bx[lastIdx], d.bz[lastIdx], d.by[lastIdx]).normalize();
  threeBloch.stateArrow.setDirection(targetDir);

  // 2. 绘制金色实心管道轨迹
  if (threeBloch.pathMesh) {
    threeBloch.scene.remove(threeBloch.pathMesh);
    threeBloch.pathMesh.geometry.dispose();
    threeBloch.pathMesh.material.dispose();
  }

  const points = [];
  for (let i = 0; i < d.bx.length; i++) {
    points.push(new THREE.Vector3(d.bx[i], d.bz[i], d.by[i]));
  }

  if (points.length > 1) {
    const curve = new THREE.CatmullRomCurve3(points);
    // 使用 TubeGeometry 制作出图片里那种粗壮的发光轨迹线
    const tubeGeom = new THREE.TubeGeometry(curve, points.length, 0.015, 8, false);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xf0c040 }); 
    threeBloch.pathMesh = new THREE.Mesh(tubeGeom, tubeMat);
    threeBloch.scene.add(threeBloch.pathMesh);
  }

  // 仅在参数变动时渲染一帧，保持球体绝对静止不自转
  threeBloch.renderer.render(threeBloch.scene, threeBloch.camera);
}
// ==============================================================================

// Rabi preset
document.getElementById('rabi-preset').addEventListener('change', function(e) {
  const v = e.target.value;
  
  // 基础连续演化
  if (v === 'resonant') {
    document.getElementById('rabi-omega').value = 1.57;
    document.getElementById('rabi-delta').value = 0;
    document.getElementById('rabi-gamma').value = 0;
    document.getElementById('rabi-tmax').value = 10;
  } else if (v === 'detuned') {
    document.getElementById('rabi-omega').value = 1.57;
    document.getElementById('rabi-delta').value = 3.14;
    document.getElementById('rabi-gamma').value = 0;
    document.getElementById('rabi-tmax').value = 10;
  } else if (v === 'damped') {
    document.getElementById('rabi-omega').value = 1.57;
    document.getElementById('rabi-delta').value = 0;
    document.getElementById('rabi-gamma').value = 0.3;
    document.getElementById('rabi-tmax').value = 10;
  } 
  
  // ====== 量子逻辑门 (脉冲级模拟) ======
  // X门：共振条件下的 π 脉冲 (ΩT = π)。这里 Ω=1.57, T=2.0 恰好等于 π
  else if (v === 'gate-x') {
    document.getElementById('rabi-omega').value = 1.57;
    document.getElementById('rabi-delta').value = 0;
    document.getElementById('rabi-gamma').value = 0;
    document.getElementById('rabi-tmax').value = 2.0;
  } 
  // H门：需要绕 X轴和Z轴的角平分线旋转 π。设置 Ω = δ，此时 Ω_eff = √2 * Ω。
  // 我们取 Ω=1.11, δ=1.11，则 Ω_eff ≈ 1.57。作用 T=2.0 时间，恰好转过 π 角度！
  else if (v === 'gate-h') {
    document.getElementById('rabi-omega').value = 1.11;
    document.getElementById('rabi-delta').value = 1.11;
    document.getElementById('rabi-gamma').value = 0;
    document.getElementById('rabi-tmax').value = 2.0;
  } 
  // π/2 脉冲：将态从 |0> 打到赤道面，制造等权叠加态。ΩT = π/2。
  else if (v === 'gate-pi2') {
    document.getElementById('rabi-omega').value = 0.79;
    document.getElementById('rabi-delta').value = 0;
    document.getElementById('rabi-gamma').value = 0;
    document.getElementById('rabi-tmax').value = 2.0;
  }
  
  updateRabi();
});

['rabi-omega','rabi-delta','rabi-tmax','rabi-gamma'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    document.getElementById('rabi-preset').value = '';
    updateRabi();
  });
});
document.getElementById('btn-rabi-reset').addEventListener('click', () => {
  document.getElementById('rabi-preset').value = 'resonant';
  document.getElementById('rabi-omega').value = 1.57;
  document.getElementById('rabi-delta').value = 0;
  document.getElementById('rabi-tmax').value = 10;
  document.getElementById('rabi-gamma').value = 0;
  updateRabi();
});

// ===================== ENTANGLE PAGE =====================
let entCharts = {};

function updateEntangle() {
  const eta   = parseFloat(document.getElementById('ent-eta').value);
  const omega = parseFloat(document.getElementById('ent-omega').value);
  const delta = parseFloat(document.getElementById('ent-delta').value);
  const n0    = parseFloat(document.getElementById('ent-n0').value);
  const gamma = parseFloat(document.getElementById('ent-gamma').value);
  const tMax  = parseFloat(document.getElementById('ent-tmax').value);
  
  if (document.getElementById('val-ent-eta')) document.getElementById('val-ent-eta').textContent = eta.toFixed(2);
  if (document.getElementById('val-ent-omega')) document.getElementById('val-ent-omega').textContent = omega.toFixed(2);
  if (document.getElementById('val-ent-delta')) document.getElementById('val-ent-delta').textContent = delta.toFixed(2);
  if (document.getElementById('val-ent-tmax')) document.getElementById('val-ent-tmax').textContent = tMax.toFixed(1);
  if (document.getElementById('val-ent-n0')) document.getElementById('val-ent-n0').textContent = n0.toFixed(1);
  if (document.getElementById('val-ent-gamma')) document.getElementById('val-ent-gamma').textContent = gamma.toFixed(2);
  
  const d = getEntangleData(eta, omega, delta, n0, gamma, tMax);
  const gateT = d.gateT;
  
  // Population chart
  const xy = (arr) => d.t.map((ti, i) => ({x:ti, y:arr[i]}));
  // ===================== CSS MODIFIED: MS pop chart data color change =====================
  entCharts.pop = makeLineChart('chart-ent-pop', [
    dataset('P(gg)', xy(d.Pgg), C.blue),  // gg bright blue
    dataset('P(ee)', xy(d.Pee), C.gold),  // ee gold
    dataset('P(ge)', xy(d.Pge), C.cyan),  // ge peg cyan
    dataset('P(eg)', xy(d.Peg), C.gray),  // peg peg gray (too many levels for 2 colors)
  ], -0.05, 1.05, '时间 t', '布居数');
  
  // ===================== CSS MODIFIED: MS concurrence color gold =====================
  // Concurrence chart gold
  entCharts.conc = makeLineChart('chart-ent-conc', [
    dataset('并发度', xy(d.concurrence), C.gold),
  ], -0.05, 1.1, '时间 t', '并发度');
  
  // Phase space chart cyan trajectory
  const psData = d.alphaRe.map((re, i) => ({x:re, y:d.alphaIm[i]}));
  // Downsample for arrows
  const step = Math.max(1, Math.floor(psData.length / 30));
  const arrowData = [];
  for (let i = 0; i < psData.length - step; i += step) {
    arrowData.push(psData[i]);
  }
  entCharts.phase = makeScatterChart('chart-ent-phase', 
    dataset('相空间轨迹', psData, C.cyan)
  );
  
  // Update gauge
  const lastFid = d.bellFid[Math.floor(d.bellFid.length * 0.99)];
  updateGauge(d.bellFid);
  
  // Update tip
  const gateTdisp = isFinite(gateT) ? gateT.toFixed(1) : '∞';
  const concPeak = Math.max(...d.concurrence).toFixed(2);
  const fidLast = lastFid.toFixed(2);
  let tip = `振动模在相空间画一个圆，门时间 <em>t_g = ${gateTdisp}</em> 处回到原点。此时 <em>并发度峰值 = ${concPeak}</em>，`;
  if (parseFloat(concPeak) > 0.9) {
    tip += `<em>Bell 保真度 = ${(parseFloat(fidLast)*100).toFixed(0)}%</em>，两离子处于最大纠缠态。`;
  } else if (n0 > 0.1) {
    tip += `但由于初始振动模温度 <em>n̄ = ${n0.toFixed(1)}</em>，纠缠质量下降。`;
  } else if (gamma > 0.01) {
    tip += `但由于耗散 <em>γ = ${gamma.toFixed(2)}</em>，纠缠被削弱。`;
  } else {
    tip += `参数未达到最优条件 <em>ηΩ/δ = ${(eta*omega/delta).toFixed(2)}</em>（最优 = 0.50）。`;
  }
  document.getElementById('tip-entangle').innerHTML = tip;
}

function makeScatterChart(canvasId, ...datasets) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  const existing = Chart.getChart(canvasId);
  
  // 🚀 核心修复：复用已存在的图表实例
  if (existing) {
    existing.data.datasets = datasets;
    existing.update('none');
    return existing;
  }
  
  return new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: false,
      layout: { padding: { bottom: 12 } },
      scales: {
        x: { type:'linear', title:{display:true, text:'Re⟨a⟩', color:C.gray}, ticks:{color:C.gray}, grid:{color:'#ffffff10'} },
        y: { title:{display:true, text:'Im⟨a⟩', color:C.gray}, ticks:{color:C.gray}, grid:{color:'#ffffff10'} }
      },
      plugins: { legend:{display:false} }
    }
  });
}

// ===================== CSS MODIFIED: Gauge update using gold, cyan, blue swatches =====================
const C_GUAGE = {
  blue:   '#00cfff',
  cyan:   '#4ecca3',
  gold:   '#f0c040',
};

function updateGauge(fidArr) {
  const fid = fidArr[Math.floor(fidArr.length * 0.99)];
  const pct = Math.round(fid * 100);
  const svg = document.getElementById('gauge-svg');
  document.getElementById('gauge-text').textContent = pct + '%';
  document.getElementById('gauge-text').style.textShadow = C_GUAGE.gold + 'glow';
  
  const angle = -Math.PI + (pct / 100) * Math.PI;
  const cx = 90, cy = 85, r = 55;
  const nx = cx + r * Math.cos(angle);
  const ny = cy + r * Math.sin(angle);
  
  let colorStr = C_GUAGE.gold;
  if (pct > 90) colorStr = C_GUAGE.cyan;
  else if (pct > 50) colorStr = C_GUAGE.gold;
  
  const status = document.getElementById('gauge-status');
  if (pct > 90) status.innerHTML = '✓ 纠缠成功';
  else if (pct > 50) status.innerHTML = '⚠ 部分纠缠';
  else status.innerHTML = '✗ 纠缠不足';
  
  // Gradient from gold to cyan
  svg.innerHTML = `
    <defs>
      <linearGradient id="gGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${C_GUAGE.gold}"/>
        <stop offset="100%" stop-color="${C_GUAGE.cyan}"/>
      </linearGradient>
    </defs>
    <path d="M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}" fill="none" stroke="url(#gGrad)" stroke-width="12" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${colorStr}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="${colorStr}"/>
  `;
}

// Entangle preset
document.getElementById('ent-preset').addEventListener('change', function(e) {
  const v = e.target.value;
  if (v === 'perfect') {
    document.getElementById('ent-eta').value = 0.1;
    document.getElementById('ent-omega').value = 3.14;
    document.getElementById('ent-delta').value = 0.1;
    document.getElementById('ent-n0').value = 0;
    document.getElementById('ent-gamma').value = 0;
  } else if (v === 'thermal') {
    document.getElementById('ent-eta').value = 0.1;
    document.getElementById('ent-omega').value = 3.14;
    document.getElementById('ent-delta').value = 0.1;
    document.getElementById('ent-n0').value = 2;
    document.getElementById('ent-gamma').value = 0;
  } else if (v === 'damped') {
    document.getElementById('ent-eta').value = 0.1;
    document.getElementById('ent-omega').value = 3.14;
    document.getElementById('ent-delta').value = 0.1;
    document.getElementById('ent-n0').value = 0;
    document.getElementById('ent-gamma').value = 0.1;
  }
  updateEntangle();
});

['ent-eta','ent-omega','ent-delta','ent-tmax','ent-n0','ent-gamma'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    document.getElementById('ent-preset').value = '';
    updateEntangle();
  });
});

document.getElementById('btn-ent-reset').addEventListener('click', () => {
  document.getElementById('ent-preset').value = 'perfect';
  document.getElementById('ent-eta').value = 0.1;
  document.getElementById('ent-omega').value = 3.14;
  document.getElementById('ent-delta').value = 0.1;
  document.getElementById('ent-tmax').value = 40;
  document.getElementById('ent-n0').value = 0;
  document.getElementById('ent-gamma').value = 0;
  updateEntangle();
});

// Preset buttons
document.querySelectorAll('[data-preset]').forEach(btn => {
  btn.addEventListener('click', function() {
    const p = this.dataset.preset;
    document.getElementById('ent-preset').value = p;
    document.getElementById('ent-preset').dispatchEvent(new Event('change'));
    document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active-preset'));
    this.classList.add('active-preset');
  });
});

// ===================== TAB SWITCHING =====================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const tab = this.dataset.tab;
    document.querySelectorAll('.main-layout.page').forEach(p => {
      // 🚀 核心修复：统一使用网格布局，彻底释放右侧 AI 面板空间
      p.style.display = (p.id === 'page-' + tab) ? 'grid' : 'none';
    });
    if (tab === 'entangle') updateEntangle();
    if (tab === 'rabi') updateRabi();
  });
});

// ===================== INIT =====================
document.getElementById('page-theory').style.display = 'none';
document.getElementById('page-entangle').style.display = 'none';
updateRabi();
updateEntangle();


// ===================== REAL GEMINI AI INTEGRATION =====================
// ⚠️ 在这里填入你的 Gemini API 密钥
const GEMINI_API_KEY = "AIzaSyDG04n-jH8Y99NWjYZrvZzjxoe5cclRni0"; // 记得换成你的真实密钥

async function handleSend(type) {
  // 终极防错机制：支持 rabi, ent, theory 三个频道
  if (!window.chatHistory) {
    window.chatHistory = {
      'rabi': [],
      'ent': [],
      'theory': [],
      'damped': [],
      'ion': [],
      'laser': [],
      'ep': []
    };
  }

  // 动态获取输入框和聊天框 ID
  const inputId = `chat-in-${type}`;
  const boxId = `chat-box-${type}`;
  
  const inputEl = document.getElementById(inputId);
  const boxEl = document.getElementById(boxId);
  
  if (!inputEl || !boxEl) return; 
  
  const text = inputEl.value.trim();
  if (!text) return;
  
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg user';
  userMsg.textContent = text;
  boxEl.appendChild(userMsg);
  
  inputEl.value = '';
  boxEl.scrollTop = boxEl.scrollHeight;
  
  const typingMsg = document.createElement('div');
  typingMsg.className = 'chat-msg ai';
  typingMsg.innerHTML = '<span style="color:var(--cyan); opacity:0.8;">正在检索物理数据库与量子核心...</span>';
  boxEl.appendChild(typingMsg);
  boxEl.scrollTop = boxEl.scrollHeight;

  // 动态构建系统 Prompt
  let pageName = '物理原理教学';
  if(type === 'rabi') pageName = '单离子 Rabi 振荡';
  else if(type === 'ent') pageName = '两离子 Mølmer-Sørensen 门';
  else if(type === 'ep') pageName = 'ep 点探测';
  else if(type === 'gate') pageName = '量子逻辑门构建';
  else if(type === 'ion') pageName = '离子载入系统';
  else if(type === 'laser') pageName = '激光参数调控序列';
  else if(type === 'damped') pageName = '有耗散的 Rabi 振荡';

  const systemInstruction = `你现在是 IonSimulator 离子阱量子计算教学演示的专属 AI 物理助教。
当前用户正在操作的是【${pageName}】界面。
请用专业、严谨且直白的理论物理语言回答问题。涉及公式时请尽量使用文本友好的表达。尽量简明扼要，符合赛博朋克 UI 助手的冷峻风格。`;

  window.chatHistory[type].push({
    role: "user",
    parts: [{ text: text }]
  });

  const requestBody = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: window.chatHistory[type]
  };

  try {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_API_KEY_HERE") {
      throw new Error("Missing_API_Key");
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (typingMsg.parentNode === boxEl) boxEl.removeChild(typingMsg);

    if (!response.ok || data.error) {
      throw new Error((data.error && data.error.message) || `HTTP 请求失败，状态码: ${response.status}`);
    }

    const aiText = data.candidates[0].content.parts[0].text;

    window.chatHistory[type].push({
      role: "model",
      parts: [{ text: aiText }]
    });

    const aiMsg = document.createElement('div');
    aiMsg.className = 'chat-msg ai';
    
    let formattedText = aiText
      .replace(/\*\*(.*?)\*\*/g, '<b style="color:var(--primary-blue)">$1</b>')
      .replace(/\*(.*?)\*/g, '<em style="color:var(--gold); font-style:normal;">$1</em>')
      .replace(/\n/g, '<br>');
      
    aiMsg.innerHTML = formattedText;
    boxEl.appendChild(aiMsg);
    boxEl.scrollTop = boxEl.scrollHeight;

  } catch (error) {
    if (typingMsg.parentNode === boxEl) boxEl.removeChild(typingMsg);

    const errorMsg = document.createElement('div');
    errorMsg.className = 'chat-msg ai';
    errorMsg.style.borderLeftColor = 'var(--gold)';
    errorMsg.style.color = 'var(--gold)';
    
    if (error.message === "Missing_API_Key") {
      errorMsg.innerHTML = `⚠️ <b>系统警告:</b> 访问拒绝。请在代码顶部的 <code>GEMINI_API_KEY</code> 中填入密钥。`;
    } else {
      errorMsg.innerHTML = `⚠️ <b>量子态坍缩 (网络或接口错误):</b> <br>${error.message}`;
    }
    
    boxEl.appendChild(errorMsg);
    boxEl.scrollTop = boxEl.scrollHeight;
    console.error("Gemini API Error 详情:", error);
    
    window.chatHistory[type].pop();
  }
}

// 绑定三个页面的回车键发送事件
['chat-in-rabi', 'chat-in-ent', 'chat-in-theory', 'chat-in-damped', 'chat-in-ion', 'chat-in-laser', 'chat-in-ep'].forEach(id => {
  const inputElement = document.getElementById(id);
  if (inputElement) {
    inputElement.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.isComposing) {
        const type = id.replace('chat-in-', ''); // 动态提取 rabi, ent 或 theory
        handleSend(type);
      }
    });
  }
});



// ===================== 全局 AI 面板控制 =====================
function toggleAIPanel() {
    const panel = document.getElementById('global-ai-panel');
    if (panel) {
        panel.classList.toggle('open');
    }
}