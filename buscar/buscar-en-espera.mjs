// El 777 (búsqueda de negocios por localidad) corriendo en GitHub Actions (13-oct-2026). Mismo patrón que el evaluador: la nube da cada
// localidad (GET /999/777/siguiente, con el secreto), aquí se hace entera con los programas del 4-oct TAL CUAL (lista.js y los suyos, reglas
// 2026-10-04g; su código lo guarda la nube y se baja con el secreto), y el resultado vuelve a la nube (POST /999/777/resultado), que es la
// única que escribe en Drive. Repositorio público: este registro sólo enseña cifras; lo que trae nombres, teléfonos o correos va a la nube.
// Una localidad a la vez («una contra Google», 4-oct). La vuelta dura hasta MAX_MIN; si queda cola, la nube lanza otra (/999/777/continuar).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BASE = 'https://negocios.automtizationninameu.es';
const S = process.env.SECRETO_999; if (!S) { console.error('falta SECRETO_999'); process.exit(2); }
const MAX_MIN = Number(process.env.MAX_MIN || 280), IDLE_MS = Number(process.env.IDLE_MIN || 5) * 60000, PRUEBA = (process.env.PRUEBA || '').trim();
const cab = { authorization: 'Bearer ' + S };
const t0 = Date.now();
const W = path.resolve(process.env.TRABAJO || path.join(process.env.RUNNER_TEMP || '/tmp', 'trabajo-777')); // (la caché de GitHub guarda listas/ y proceso/web_cache.json)
const P = path.join(W, 'proceso'), L = path.join(W, 'listas');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function correr(cmd, args, cwd, segundos, salida) {
  return new Promise((ok) => {
    const p = spawn(cmd, args, { cwd, env: process.env });
    const t = setTimeout(() => p.kill('SIGKILL'), segundos * 1000);
    let out = ''; const apunta = (d) => { out += d; if (salida) fs.appendFileSync(salida, d); if (out.length > 4e6) out = out.slice(-2e6); };
    p.on('error', (e) => { clearTimeout(t); ok({ code: -1, out: out + 'spawn: ' + e.message }); });
    p.stdout.on('data', apunta); p.stderr.on('data', apunta);
    p.on('close', (code) => { clearTimeout(t); ok({ code, out }); });
  });
}
// Cada llamada a la nube: plazo de 2 min y 3 intentos (la nube se reinicia al desplegar).
async function nube(url, opts = {}, intentos = 3) {
  let ultimo;
  for (let i = 1; i <= intentos; i++) {
    try { return await fetch(BASE + url, Object.assign({}, opts, { headers: Object.assign({}, cab, opts.headers || {}), signal: AbortSignal.timeout(120000) })); }
    catch (e) { ultimo = e; log('la nube no contesta (' + i + '/' + intentos + ')'); if (i < intentos) await new Promise((r) => setTimeout(r, 20000)); }
  }
  return { ok: false, status: 0, json: async () => ({}), text: async () => String(ultimo && ultimo.message || 'sin respuesta') };
}

// 0 · Apagado o sin nada que buscar (y no es una prueba): se acaba aquí, sin preparar nada (la vuelta de cada hora no gasta).
if (!PRUEBA) {
  const re = await nube('/999/777/estado'); const e = await re.json().catch(() => ({}));
  if (!re.ok) { console.error('estado del 777: HTTP ' + re.status); process.exit(3); }
  if (!e.encendido || !e.hayQueBuscar) { log('777', e.encendido ? 'encendido, sin nada que buscar' : 'apagado', '· en cola', e.enCola); process.exit(0); }
}
// 1 · El código del 4-oct, desde la nube (proceso/ con sus pruebas fijas y la cola de localidades de Andalucía).
fs.mkdirSync(W, { recursive: true });
const rz = await nube('/999/777/codigo');
if (!rz.ok) { console.error('código del 777: HTTP ' + rz.status); process.exit(3); }
const zip = path.join(W, 'codigo-777.zip'); fs.writeFileSync(zip, Buffer.from(await rz.arrayBuffer()));
let r = await correr('python3', ['-m', 'zipfile', '-e', zip, W], W, 120); if (r.code !== 0) { console.error('descomprimir: ' + r.out.slice(-300)); process.exit(3); }
r = await correr('npm', ['install', '--no-audit', '--no-fund', '@duckdb/node-api@1.5.6-r.1'], P, 300); if (r.code !== 0) { console.error('npm: ' + r.out.slice(-300)); process.exit(3); }
// La prueba fija (348 casos) tiene que dar BIEN: si no, no se busca nada (lista.js también la exige al arrancar).
r = await correr(process.execPath, ['prueba_reglas.js'], P, 300); if (r.code !== 0) { console.error('PRUEBA FIJA: NO PASA. No se busca nada.\n' + r.out.split('\n').filter((l) => /BIEN|MAL|casos/i.test(l)).slice(-5).join('\n')); process.exit(4); }
log('prueba fija:', (r.out.match(/BIEN[^\n]*/) || ['BIEN'])[0].slice(0, 80));
// Overture (base abierta): toda Andalucía, como el 3-oct; se rehace si la caché es de otra versión o no está.
const ov = path.join(P, 'overture_andalucia.json'), ow = path.join(P, 'overture_webs_andalucia.json'), ovv = path.join(P, 'overture_version.txt');
// (ov.js baja siempre la última versión publicada; si la que hay en la caché es otra, se rehace: «una vez al mes como mucho», 3-oct)
let ultimaOv = ''; try { const tx = await (await fetch('https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/', { signal: AbortSignal.timeout(30000) })).text(); ultimaOv = [...tx.matchAll(/<Prefix>release\/([^<]+)\/<\/Prefix>/g)].map((m) => m[1]).sort().pop() || ''; } catch {}
const cacheOv = fs.existsSync(ovv) ? fs.readFileSync(ovv, 'utf8').trim() : '';
if (!fs.existsSync(ov) || !fs.existsSync(ow) || (ultimaOv && cacheOv !== ultimaOv)) {
  const ti = Date.now();
  r = await correr(process.execPath, ['ov.js'], P, 1800); if (r.code !== 0) { console.error('Overture (correo): ' + r.out.slice(-300)); process.exit(3); }
  r = await correr(process.execPath, ['ovwebs.js'], P, 1800); if (r.code !== 0) { console.error('Overture (webs): ' + r.out.slice(-300)); process.exit(3); }
  if (ultimaOv) fs.writeFileSync(ovv, ultimaOv);
  log('Overture', ultimaOv || '(versión sin leer)', 'bajada en', Math.round((Date.now() - ti) / 1000), 's');
} else log('Overture de la caché', cacheOv);
fs.mkdirSync(L, { recursive: true });
const COLA = path.join(W, 'localidades-andalucia-negocios-activos.csv');

// 2 · Una localidad.
async function hacer(t) {
  const dir = path.join(L, t.slug), ti = Date.now();
  const registro = path.join(W, 'registro-' + t.slug + '.log'); fs.writeFileSync(registro, '');
  // lo ya hecho (regla 04f: teléfono o correo en otra lista entregada → «ya en otra lista»): una lista con esas filas, marcada como entregada
  const K = path.join(L, '_conocidos'); fs.rmSync(K, { recursive: true, force: true }); fs.mkdirSync(K, { recursive: true });
  const q = (v) => '"' + String(v || '').replace(/"/g, '""') + '"';
  const cabecera = 'Prioridad;Nombre;Sector;Teléfono;Móvil;Correo;Dirección;Localidad;Valoración Maps;Enlace que pone en Maps;Comprobación;Ficha en Maps;Su página (Facebook, Instagram u otra ficha)';
  const tels = (t.conocidos && t.conocidos.tels) || [], mails = (t.conocidos && t.conocidos.mails) || [];
  const filas = []; for (let i = 0; i < Math.max(tels.length, mails.length); i++) filas.push(['3', 'ya hecho', '', tels[i] || '', '', mails[i] || '', '', '', '', '', '', '', ''].map(q).join(';'));
  fs.writeFileSync(path.join(K, '_conocidos_sin_web_con_correo.csv'), '﻿' + cabecera + '\n' + filas.join('\n'));
  for (const m of ['HECHO.txt', 'ENTREGADA.txt']) fs.writeFileSync(path.join(K, m), '{"reglas":"2026-10-04g","conocidos":true}');
  // la localidad en la cola de Andalucía (la de 610 del 4-oct; si es nueva, se añade su fila)
  const cola = fs.readFileSync(COLA, 'utf8');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cola.split(/\r?\n/).some((l) => { const c = l.split(';'); return norm(c[1]) === norm(t.loc) && norm(c[2]) === norm(t.prov); })) fs.appendFileSync(COLA, (t.puesto || 999) + ';' + t.loc + ';' + t.prov + ';' + (t.empresas ?? 'sin dato publicado') + '\r\n');
  // lista.js: la localidad entera. Si ya hay algo guardado de ella (un intento anterior), --forzar sigue donde se quedó sin repetir consultas.
  let estado = 'no-pasa', motivo = '';
  const hecha = fs.existsSync(path.join(dir, 'HECHO.txt'));
  if (!hecha) {
    const args = ['lista.js', t.loc, t.prov].concat(fs.existsSync(path.join(dir, 'maps.json')) ? ['--forzar'] : []);
    const rl = await correr(process.execPath, args, P, 150 * 60, registro);
    if (rl.code === 2 && /errores seguidos|plantilla|limitando/i.test(rl.out)) { estado = 'espera'; motivo = (rl.out.match(/PARADO:[^\n]*/) || ['Google limitando'])[0]; }
    else if (rl.code !== 0) motivo = (rl.out.match(/(NO SE DA POR HECHA|PARADO|ERROR):[^\n]*/) || ['lista.js salió con ' + rl.code])[0];
  }
  if (estado !== 'espera' && (hecha || fs.existsSync(path.join(dir, 'HECHO.txt')))) {
    const rc = await correr(process.execPath, ['comprueba_localidad.js', t.slug], P, 600, registro);
    if (rc.code !== 0) motivo = 'no pasa su comprobación: ' + ((rc.out.match(/FALTA[^\n]*/g) || []).slice(0, 3).join(' | ') || 'salida ' + rc.code);
    else { const re = await correr(process.execPath, ['entregada.js', t.slug], P, 300, registro); if (re.code === 0) { estado = 'hecha'; motivo = ''; } else motivo = 'entregada.js salió con ' + re.code; }
  }
  const archivos = {};
  if (estado === 'hecha') for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isFile() && fs.statSync(p).size < 20e6) archivos[f] = fs.readFileSync(p, 'utf8'); }
  archivos['registro-777.log'] = fs.readFileSync(registro, 'utf8').slice(-3e6); // (el registro entero de la localidad, como los cola_NN.log del 4-oct)
  let resumen = {}; try { resumen = JSON.parse(fs.readFileSync(path.join(dir, 'resumen.json'), 'utf8')); } catch {}
  const cifras = estado === 'hecha' ? resumen.enLaLista + ' en la lista (' + [resumen.prioridad1, resumen.prioridad2, resumen.prioridad3].join('·') + ') · ' + resumen.fichasMaps + ' fichas · ' + resumen.consultasMaps + ' consultas · ' + resumen.erroresMaps + ' errores' : estado + ': ' + motivo.replace(/[0-9]{9}|\S+@\S+/g, '…').slice(0, 160);
  log(t.prueba ? 'PRUEBA' : 'localidad', t.puesto || '', t.slug, '·', cifras, '·', Math.round((Date.now() - ti) / 60000), 'min');
  const rr = await nube('/999/777/resultado', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: t.slug, estado, motivo, archivos: estado === 'hecha' || t.prueba ? archivos : { 'registro-777.log': archivos['registro-777.log'] }, prueba: !!t.prueba }) });
  const j = await rr.json().catch(() => ({}));
  if (!rr.ok || j.error) { log('la nube no aceptó el resultado:', rr.status, String(j.error || '').slice(0, 120)); return false; }
  // la caché sólo guarda lo necesario de lo ya entregado (sus dos listas y sus marcas): lo grande de una localidad hecha no se arrastra
  if (estado === 'hecha' && !t.prueba) for (const f of fs.readdirSync(dir)) if (!/_sin_web_con_correo\.csv$|_web_caida\.csv$|^(HECHO|ENTREGADA)\.txt$|^resumen\.json$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  if (t.prueba) fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

// 3 · La vuelta.
let hechas = 0, quedan = false, ultima = Date.now();
for (;;) {
  if ((Date.now() - t0) / 60000 >= MAX_MIN) { quedan = true; log('tiempo de la vuelta agotado'); break; }
  const rs = await nube('/999/777/siguiente?runner=' + encodeURIComponent(process.env.GITHUB_RUN_ID || 'github') + (PRUEBA ? '&prueba=' + encodeURIComponent(PRUEBA) : ''));
  if (rs.status === 204) { if (Date.now() - ultima >= IDLE_MS) break; await new Promise((r) => setTimeout(r, 30000)); continue; }
  if (!rs.ok) { log('siguiente: HTTP ' + rs.status); quedan = true; break; }
  const t = await rs.json().catch(() => null); if (!t || !t.slug) { log('siguiente: respuesta sin localidad'); break; }
  await hacer(t); hechas++; ultima = Date.now();
  if (t.prueba) break;
}
log('vuelta:', hechas, 'localidades en', ((Date.now() - t0) / 60000).toFixed(1), 'min');
if (quedan && !PRUEBA) { const c = await nube('/999/777/continuar', { method: 'POST' }); log('siguiente vuelta:', (await c.text()).slice(0, 120)); }
