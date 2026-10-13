// Sonda del 777 (13-oct-2026): ¿contesta Google Maps desde una máquina de GitHub igual que desde el PC de Manuel el 4-oct?
// y ¿se baja Overture con DuckDB aquí? Mismo método que lista.js (plantilla fresca, 20 por página, 4 a la vez, pausa 300 ms, 6 errores
// seguidos = para). Repo público: el registro sólo enseña cifras y huellas (sha1 recortado) de los id de Maps, nunca nombres ni teléfonos.
import { createHash } from 'node:crypto';
const LOC = process.env.LOC || 'Tomares', PROV = process.env.PROV || 'Sevilla';
const CATS = ["reformas","empresa de construcción","fontanero","electricista","aire acondicionado instalador","carpintería","carpintería de aluminio","cerrajero","pintor","cristalería","taller mecánico","taller chapa y pintura","neumáticos","clínica dental","fisioterapeuta","podólogo","psicólogo","clínica estética","centro de estética","peluquería","barbería","veterinario","óptica","abogado","asesoría","gestoría","inmobiliaria","administrador de fincas","arquitecto","restaurante","bar de tapas","cafetería","catering","pastelería","autoescuela","academia","guardería","gimnasio","tienda de muebles","cocinas"];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const GH = { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9', 'Cookie': 'SOCS=CAESHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmVzIAEaBgiAo_CmBg; CONSENT=YES+' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const h = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 10);
const cierre = (x) => !Array.isArray(x) ? '' : (x[23] === 1 || (Array.isArray(x[88]) && /^(CERRADO|CLOSED)$/.test(String(x[88][0])))) ? 'permanente' : (Array.isArray(x[160]) && x[160].some(Boolean)) ? 'temporal' : '';
const t0 = Date.now(); let tpl = '', greq = 0, gerr = 0, seguidos = 0; const est = {};
const r0 = await fetch('https://www.google.com/maps/search/clinica+dental+sevilla?hl=es&gl=es', { headers: GH }); const html = await r0.text();
console.log('plantilla: HTTP', r0.status, '·', html.length, 'bytes ·', /consent\.google|before you continue|antes de ir a/i.test(html) ? 'PANTALLA DE CONSENTIMIENTO' : 'sin consentimiento', '·', /unusual traffic|captcha|sorry\/index/i.test(html) ? 'CAPTCHA' : 'sin captcha');
const m = html.match(/href="(\/search\?tbm=map[^"]+)"/); if (!m) { console.log('RESULTADO: NO HAY PLANTILLA (Google no da la búsqueda a esta máquina)'); process.exit(1); }
tpl = 'https://www.google.com' + m[1].replace(/&amp;/g, '&');
const url = (q, off) => { const enc = encodeURIComponent(q).replace(/%20/g, '+'); let u = tpl.replace('q=clinica+dental+sevilla', 'q=' + enc).replace('%211sclinica+dental+sevilla', '%211s' + enc); if (off) u = u.replace('%217i20', '%217i20%218i' + off); return u; };
const lugares = (d) => { const out = []; (function w(x) { if (!Array.isArray(x)) return; if (typeof x[11] === 'string' && x.length > 100) { out.push({ id: x[78] || x[10] || (x[11] + '|' + x[39]), tel: x[178] && x[178][0] && x[178][0][0] || '', web: x[7] && x[7][0] || '', dir: x[39] || '', cerrado: cierre(x) }); return; } x.forEach(w); })(d); return out; };
async function maps(q, off) {
  for (let k = 0; k < 2; k++) {
    try {
      const r = await fetch(url(q, off), { headers: GH, signal: AbortSignal.timeout(25000) }); greq++; est[r.status] = (est[r.status] || 0) + 1;
      if (r.status !== 200) { gerr++; if (++seguidos >= 6) throw new Error('PARA: 6 errores seguidos (HTTP ' + r.status + ')'); await sleep(8000); continue; }
      seguidos = 0; return lugares(JSON.parse((await r.text()).replace(/^\)\]\}'\n?/, '')));
    } catch (e) { if (/^PARA/.test(e.message)) throw e; gerr++; await sleep(1500); }
  }
  return null;
}
const vistas = new Map(); const locN = LOC.toLowerCase();
const q = CATS.slice(); let parada = '';
try {
  await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) { const c = q.shift(); for (let off = 0; off < 200; off += 20) { const r = await maps(c + ' en ' + LOC + ', ' + PROV, off); if (r === null) break; if (!r.length) break; let enLoc = 0; for (const p of r) { vistas.set(p.id, p); if (p.dir.toLowerCase().includes(locN)) enLoc++; } if (!enLoc || r.length < 20) break; await sleep(300); } } }));
} catch (e) { parada = e.message; }
const todas = [...vistas.values()], deAqui = todas.filter((p) => p.dir.toLowerCase().includes(locN));
console.log('MAPS ·', LOC, '· categorías', CATS.length, '· consultas', greq, '· errores', gerr, '· estados', JSON.stringify(est), '· segundos', Math.round((Date.now() - t0) / 1000), parada ? '· ' + parada : '');
console.log('MAPS · fichas distintas', todas.length, '· con dirección de', LOC, deAqui.length, '· con teléfono', deAqui.filter((p) => p.tel).length, '· con web', deAqui.filter((p) => p.web).length, '· cerradas', deAqui.filter((p) => p.cerrado).length);
console.log('HUELLAS ' + deAqui.map((p) => h(p.id)).sort().join(','));
// Overture con DuckDB: provincia de Sevilla (recuadro), negocios con correo y teléfono; cuántos de la localidad
const t1 = Date.now();
try {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const S3 = 'https://overturemaps-us-west-2.s3.amazonaws.com/';
  const claves = async (p) => { const t = await (await fetch(S3 + '?list-type=2&prefix=' + encodeURIComponent(p) + '&delimiter=/')).text(); return { pref: [...t.matchAll(/<Prefix>([^<]+)<\/Prefix>/g)].map((m) => m[1]), keys: [...t.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]) }; };
  const rel = (await claves('release/')).pref.filter((p) => p !== 'release/').sort().pop();
  const files = (await claves(rel + 'theme=places/type=place/')).keys.filter((k) => k.endsWith('.parquet')).map((k) => "'" + S3 + k + "'");
  const inst = await DuckDBInstance.create(':memory:'); const con = await inst.connect(); await con.run('INSTALL httpfs; LOAD httpfs;');
  const rows = (await con.runAndReadAll("SELECT count(*), count(*) FILTER (WHERE lower(addresses[1].locality)='" + locN + "') FROM read_parquet([" + files.join(',') + "]) WHERE bbox.xmin BETWEEN -6.55 AND -4.65 AND bbox.ymin BETWEEN 36.85 AND 38.20 AND emails IS NOT NULL AND len(emails)>0 AND phones IS NOT NULL AND len(phones)>0")).getRows()[0];
  console.log('OVERTURE ·', rel, '· ficheros', files.length, '· provincia con correo y teléfono', String(rows[0]), '·', LOC, String(rows[1]), '· segundos', Math.round((Date.now() - t1) / 1000));
} catch (e) { console.log('OVERTURE · ERROR', String(e.message).slice(0, 300)); }
