// Portada: hojas 3D que caen y que el visitante puede soplar con el cursor.
// Recurso artístico: estas hojas no representan datos.
import * as THREE from 'three';

export function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.35, -0.3, 0.5, 0.05, 0.28, 0.32);
  s.bezierCurveTo(0.18, 0.42, 0.06, 0.5, 0, 0.62);
  s.bezierCurveTo(-0.06, 0.5, -0.18, 0.42, -0.28, 0.32);
  s.bezierCurveTo(-0.5, 0.05, -0.35, -0.3, 0, -0.5);
  const g = new THREE.ShapeGeometry(s, 6);
  // Curvar ligeramente la hoja a lo largo del nervio central
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, -0.25 * p.getX(i) ** 2);
  g.computeVertexNormals();
  return g;
}

export const LEAF_COLORS = ['#d9822b', '#b5481f', '#e8b04a', '#8f3b1b', '#c96a2a', '#a8742e', '#e39a3b'];

export function createHero(canvas, { reduced }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  scene.add(new THREE.HemisphereLight('#ffe2b8', '#1b2f3a', 1.6));
  const sun = new THREE.DirectionalLight('#ffd29a', 1.8);
  sun.position.set(4, 6, 8);
  scene.add(sun);

  const N = innerWidth < 700 ? 140 : 320;
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
  const mesh = new THREE.InstancedMesh(leafGeometry(), mat, N);
  const color = new THREE.Color();
  const leaves = [];
  for (let i = 0; i < N; i++) {
    leaves.push({
      p: new THREE.Vector3((Math.random() - 0.5) * 26, Math.random() * 20 - 10, (Math.random() - 0.5) * 10),
      v: new THREE.Vector3(0, -(0.6 + Math.random() * 0.8), 0),
      r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      w: new THREE.Vector3(Math.random() * 2 + 0.5, Math.random() * 2 + 0.5, Math.random() + 0.3),
      s: 0.35 + Math.random() * 0.5,
      ph: Math.random() * 10,
    });
    mesh.setColorAt(i, color.set(LEAF_COLORS[i % LEAF_COLORS.length]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12));
  }
  scene.add(mesh);

  const mouse = new THREE.Vector2(9, 9);
  const prevMouse = new THREE.Vector2(9, 9);
  const wind = new THREE.Vector2();
  canvas.parentElement.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  });

  let steal = 0; // 0..1 según el scroll: el viento se lleva las hojas
  const dummy = new THREE.Object3D();
  const v = new THREE.Vector3();

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  let running = true, last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    wind.set(mouse.x - prevMouse.x, mouse.y - prevMouse.y).multiplyScalar(60);
    prevMouse.copy(mouse);
    v.set(mouse.x, mouse.y, 0.5).unproject(camera).sub(camera.position).normalize();
    const cursor = camera.position.clone().add(v.multiplyScalar(14 / -v.z));
    leaves.forEach((l, i) => {
      const t = now / 1000 + l.ph;
      l.v.x += (Math.sin(t * 0.7) * 0.4 + steal * 9) * dt;
      l.v.y += steal * 3 * dt;
      const d = l.p.distanceTo(cursor);
      if (d < 3) {
        l.v.x += wind.x * dt * (3 - d);
        l.v.y += wind.y * dt * (3 - d);
      }
      l.v.x *= 0.98;
      l.v.y = l.v.y * 0.98 - 0.02 * (1 - steal) * (l.v.y + 0.9);
      l.p.addScaledVector(l.v, dt);
      l.p.x += Math.sin(t * l.w.z * 2) * 0.012;
      l.r.x += l.w.x * dt;
      l.r.y += l.w.y * dt;
      if (l.p.y < -11 || l.p.x > 16 || l.p.y > 13) {
        if (steal > 0.6) { l.p.set(99, 99, 0); }
        else {
          // Vuelve a caer justo por encima del borde visible, para que reaparezca enseguida al volver arriba
          const z = (Math.random() - 0.5) * 10, half = Math.tan((camera.fov * Math.PI) / 360) * (camera.position.z - z);
          l.p.set((Math.random() - 0.5) * 2 * half * camera.aspect, half + 0.4 + Math.random() * 7, z);
          l.v.set(0, -(0.6 + Math.random() * 0.8), 0);
        }
      }
      dummy.position.copy(l.p);
      dummy.rotation.copy(l.r);
      dummy.scale.setScalar(l.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
    if (running && !reduced) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  new IntersectionObserver(([e]) => {
    const was = running;
    running = e.isIntersecting;
    if (running && !was && !reduced) { last = performance.now(); requestAnimationFrame(frame); }
  }).observe(canvas);

  return {
    setSteal(x) {
      steal = x;
      if (reduced) requestAnimationFrame(frame);
    },
  };
}
