// Vista previa de cada enlace compartido: la denuncia de esa provincia (y año de nacimiento),
// dibujada con el mismo código que la tarjeta de la web.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drawPreview, lifeOf, slug } from '../../public/otono/js/card.js';

const root = process.env.LAMBDA_TASK_ROOT || process.cwd();
for (const [file, family] of [
  ['BigShouldersDisplay-800.ttf', 'Big Shoulders Display'], ['BigShouldersDisplay-900.ttf', 'Big Shoulders Display'],
  ['JetBrainsMono-400.ttf', 'JetBrains Mono'], ['JetBrainsMono-500.ttf', 'JetBrains Mono'], ['JetBrainsMono-600.ttf', 'JetBrains Mono'],
]) GlobalFonts.registerFromPath(join(root, 'netlify/fonts', file), family);

const spain = JSON.parse(readFileSync(join(root, 'public/otono/data/spain.json'), 'utf8'));
const provinces = Object.values(spain.provinces)
  .map((p) => ({ ...p, st: p.ref ? spain.stations[p.ref] : null }))
  .filter((p) => p.st?.shift?.trend);
const bySlug = Object.fromEntries(provinces.map((p) => [slug(p.name), p]));

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const p = bySlug[slug(q.get('provincia') || '')] || bySlug.barcelona;
  const born = +q.get('nacimiento');
  const life = born >= 1900 && born <= 2025 ? lifeOf(p.st.shift, born) : null;
  const canvas = createCanvas(1200, 630);
  drawPreview(canvas, { p, life, mine: life?.total >= 1, D: 'Big Shoulders Display', M: 'JetBrains Mono' });
  return new Response(await canvas.encode('png'), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
      // Cada combinación se dibuja una vez y se queda en la CDN
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=31536000',
      'Netlify-Vary': 'query=provincia|nacimiento|v',
    },
  });
};

export const config = { path: '/otono/denuncia.png' };
