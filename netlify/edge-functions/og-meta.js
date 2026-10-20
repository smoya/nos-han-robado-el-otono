// Un enlace con ?provincia= (y &nacimiento=) se previsualiza con su propia denuncia, no con la genérica
export default async (req, context) => {
  const url = new URL(req.url);
  const prov = (url.searchParams.get('provincia') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!prov) return;
  const born = (url.searchParams.get('nacimiento') || '').replace(/\D/g, '').slice(0, 4);
  const q = `provincia=${prov}${born ? `&nacimiento=${born}` : ''}`;
  const res = await context.next();
  const html = (await res.text())
    .replace(/(<meta property="og:image" content=")[^"]*/, `$1${url.origin}/otono/denuncia.png?${q.replace('&', '&amp;')}&amp;v=1`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url.origin}/otono/?${q.replace('&', '&amp;')}`)
    .replace(/(<meta property="og:image:alt" content=")[^"]*/, '$1Denuncia por robo de otoño');
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  return new Response(html, { status: res.status, headers });
};

export const config = { path: '/otono/' };
