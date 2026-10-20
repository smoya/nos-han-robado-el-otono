// Dibuja de antemano la vista previa de cada provincia, para que el primer enlace compartido no espere
import { readFileSync } from 'node:fs';
import { slug } from '../public/otono/js/card.js';

const spain = JSON.parse(readFileSync(new URL('../public/otono/data/spain.json', import.meta.url), 'utf8'));
const names = Object.values(spain.provinces).filter((p) => spain.stations[p.ref]?.shift?.trend).map((p) => slug(p.name));
const base = process.argv[2] || 'https://noshanrobado.es';
const res = await Promise.all(names.map((n) => fetch(`${base}/otono/denuncia.png?provincia=${n}&v=1`).then((r) => r.status)));
console.log(`${res.filter((s) => s === 200).length}/${names.length} vistas previas listas`);
