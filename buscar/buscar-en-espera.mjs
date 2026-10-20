// El 777 (búsqueda de negocios por localidad) en GitHub Actions: la máquina pública, gratis, hace el trabajo contra Google con los programas del
// 4-oct (busqueda\ del repositorio del 999, reglas 2026-10-19 para toda España). Adecuado el 19-oct (fase 5) al núcleo: el núcleo da cada localidad
// (GET /api/777/siguiente, con el secreto), le da el código (GET /api/777/codigo: el repositorio público no lleva el código ni los datos), y recibe el
// resultado (POST /api/777/resultado). El núcleo es el único que escribe en Drive. Este registro, público, sólo enseña cifras: lo que trae nombres,
// teléfonos o correos va al núcleo. Una localidad a la vez («una contra Google», 4-oct).
//   Lo que devuelve de cada localidad: hecha (con sus archivos) · espera (Google limita: la cola espera 15 min) · sigue (ciudad grande: quedan
//   búsquedas por zona o se acabó su tiempo; lo consultado queda en la caché y la vuelta siguiente continúa) · no-pasa (con el motivo).
// Si al acabar su tiempo queda cola, deja dicho que se lance otra vuelta (quedan=true): el flujo la pide a GitHub con su propio permiso.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { estadoDe } from './estado-777.mjs';

const BASE = (process.env.NUCLEO || 'https://negocios.automtizationninameu.es').replace(/\/$/, '');
const S = process.env.SECRETO_999; if (!S) { console.error('falta SECRETO_999'); process.exit(2); }
const MAX_MIN = Number(process.env.MAX_MIN || 280), IDLE_MS = Number(process.env.IDLE_MIN || 5) * 60000, SOLA = (process.env.SOLA || '').trim();
const LIMITE_LOCALIDAD = Number(process.env.LIMITE_LOCALIDAD_MIN || 150) * 60; // segundos de lista.js por localidad (como en octubre); si se pasa, «sigue»
const ESPERA_VACIA = Number(process.env.ESPERA_VACIA_MS || 30000);
const cab = { authorization: 'Bearer ' + S };
const t0 = Date.now();
const W = path.resolve(process.env.TRABAJO || path.join(process.env.RUNNER_TEMP || '/tmp', 'trabajo-777')); // (la caché guarda listas/, proceso/web_cache.json y proceso/overture/)
const P = path.join(W, 'proceso'), L = path.join(W, 'listas');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const salida = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, k + '=' + v + '\n'); };

function correr(cmd, args, cwd, segundos, registro) {
  return new Promise((ok) => {
    const p = spawn(cmd, args, { cwd, env: process.env }); let cortado = false;
    const t = setTimeout(() => { cortado = true; p.kill('SIGKILL'); }, segundos * 1000);
    let out = ''; const apunta = (d) => { out += d; if (registro) fs.appendFileSync(registro, d); if (out.length > 4e6) out = out.slice(-2e6); };
    p.on('error', (e) => { clearTimeout(t); ok({ code: -1, out: out + 'spawn: ' + e.message, cortado }); });
    p.stdout.on('data', apunta); p.stderr.on('data', apunta);
    p.on('close', (code) => { clearTimeout(t); ok({ code, out, cortado }); });
  });
}
// Cada llamada al núcleo: plazo de 2 min y 3 intentos (el núcleo se reinicia al subir una versión).
async function nucleo(ruta, opts = {}, intentos = 3) {
  let ultimo;
  for (let i = 1; i <= intentos; i++) {
    try { const r = await fetch(BASE + '/api' + ruta, Object.assign({}, opts, { headers: Object.assign({}, cab, opts.headers || {}), signal: AbortSignal.timeout(120000) })); const j = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, j }; }
    catch (e) { ultimo = e; log('el núcleo no contesta (' + i + '/' + intentos + ')'); if (i < intentos) await new Promise((r) => setTimeout(r, 20000)); }
  }
  return { ok: false, status: 0, j: { error: String(ultimo && ultimo.message || 'sin respuesta') } };
}

// 0 · Apagado o sin nada que buscar (y no es «sola»): se acaba aquí, sin preparar nada.
if (!SOLA) {
  const e = await nucleo('/777/estado');
  if (!e.ok) { console.error('estado del 777: HTTP ' + e.status); process.exit(3); }
  if (!e.j.encendido || !e.j.hayQueBuscar) { log('777', e.j.encendido ? 'encendido, sin nada que buscar' : 'apagado', '· en cola', e.j.enCola); salida('quedan', 'false'); process.exit(0); }
}
// 1 · El código de la búsqueda, del núcleo (busqueda\ tal cual: los programas, sus pruebas fijas y espana.json).
fs.mkdirSync(P, { recursive: true });
const cod = await nucleo('/777/codigo');
if (!cod.ok || !cod.j.archivos) { console.error('código del 777: HTTP ' + cod.status); process.exit(3); }
for (const [rel, texto] of Object.entries(cod.j.archivos)) { const f = path.join(P, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, texto); }
log('código del 777:', Object.keys(cod.j.archivos).length, 'archivos, huella', cod.j.huella);
let r = fs.existsSync(path.join(P, 'node_modules', '@duckdb')) ? { code: 0 } : await correr('npm', ['install', '--no-audit', '--no-fund', '--no-save', '@duckdb/node-api@1.5.6-r.1'], P, 300);
if (r.code !== 0) { console.error('npm: ' + r.out.slice(-300)); process.exit(3); }
// La prueba fija (400 casos) tiene que dar BIEN: si no, no se busca nada (lista.js también la exige al arrancar).
r = await correr(process.execPath, ['prueba_reglas.js'], P, 300); if (r.code !== 0) { console.error('PRUEBA FIJA: NO PASA. No se busca nada.\n' + r.out.split('\n').filter((l) => /BIEN|FALLAN/.test(l)).slice(-3).join('\n')); process.exit(4); }
log('prueba fija:', (r.out.match(/BIEN[^\n]*/) || ['BIEN'])[0].slice(0, 80));
// Overture de España por provincia (ov.js, ovwebs.js): se rehace si la caché es de otra versión o no está («una vez al mes como mucho», 3-oct).
let ultimaOv = ''; try { const tx = await (await fetch('https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/', { signal: AbortSignal.timeout(30000) })).text(); ultimaOv = [...tx.matchAll(/<Prefix>release\/([^<]+)\/<\/Prefix>/g)].map((m) => m[1]).sort().pop() || ''; } catch {}
for (const [que, prog] of [['correo', 'ov.js'], ['webs', 'ovwebs.js']]) {
  const v = path.join(P, 'overture', 'version-' + que + '.txt'), hay = fs.existsSync(v) ? fs.readFileSync(v, 'utf8').trim() : '';
  const completo = fs.existsSync(path.join(P, 'overture', que + '-41.json')) && (que !== 'webs' || fs.existsSync(path.join(P, 'overture', 'webs-telefonos.json')));
  if (completo && (!ultimaOv || hay === ultimaOv)) { log('Overture (' + que + ') de la caché', hay); continue; }
  const ti = Date.now(); r = await correr(process.execPath, [prog], P, 1800); if (r.code !== 0) { console.error('Overture (' + que + '): ' + r.out.slice(-300)); process.exit(3); }
  log('Overture (' + que + ')', ultimaOv || '(versión sin leer)', 'bajada en', Math.round((Date.now() - ti) / 1000), 's');
}
fs.mkdirSync(L, { recursive: true });

// 2 · Una localidad.
async function hacer(t) {
  const dir = path.join(L, t.slug), ti = Date.now();
  const registro = path.join(W, 'registro-' + t.slug + '.log'); fs.writeFileSync(registro, '');
  // (20-oct) una que se vuelve a buscar (t.nueva) y que ya se buscó aquí: la caché guarda su HECHO.txt y su lista de entonces; si se dejaran, no se
  // buscaría nada y se entregaría lo de antes. Se busca entera (lo que ya es contacto va en «conocidos» y no se repite).
  if (t.nueva && fs.existsSync(path.join(dir, 'HECHO.txt'))) { fs.rmSync(dir, { recursive: true, force: true }); log('se vuelve a buscar entera:', t.slug); }
  // lo que ya existe (regla 04f: teléfono o correo en otra lista entregada → «ya en otra lista»): una lista con esas filas, marcada como entregada
  const K = path.join(L, '_conocidos'); fs.rmSync(K, { recursive: true, force: true }); fs.mkdirSync(K, { recursive: true });
  const q = (v) => '"' + String(v || '').replace(/"/g, '""') + '"';
  const cabecera = 'Prioridad;Nombre;Sector;Teléfono;Móvil;Correo;Dirección;Localidad;Valoración Maps;Enlace que pone en Maps;Comprobación;Ficha en Maps;Su página (Facebook, Instagram u otra ficha)';
  const tels = (t.conocidos && t.conocidos.tels) || [], mails = (t.conocidos && t.conocidos.mails) || [];
  const filas = []; for (let i = 0; i < Math.max(tels.length, mails.length); i++) filas.push(['3', 'ya hecho', '', tels[i] || '', '', mails[i] || '', '', '', '', '', '', '', ''].map(q).join(';'));
  fs.writeFileSync(path.join(K, '_conocidos_sin_web_con_correo.csv'), '﻿' + cabecera + '\n' + filas.join('\n'));
  for (const m of ['HECHO.txt', 'ENTREGADA.txt']) fs.writeFileSync(path.join(K, m), '{"conocidos":true}');
  // lista.js: la localidad entera (con sus empresas del .txt; si ya hay algo guardado de ella, --forzar sigue donde se quedó sin repetir consultas)
  let res = { estado: 'no-pasa', motivo: '' };
  const hecha = fs.existsSync(path.join(dir, 'HECHO.txt'));
  if (!hecha) {
    const args = ['lista.js', t.loc, t.prov].concat(t.empresas != null ? ['--empresas=' + t.empresas] : [], fs.existsSync(path.join(dir, 'maps.json')) ? ['--forzar'] : []);
    const rl = await correr(process.execPath, args, P, LIMITE_LOCALIDAD, registro);
    res = estadoDe(rl, fs.existsSync(path.join(dir, 'maps.json')), LIMITE_LOCALIDAD);
  }
  if (res.estado === 'hecha' || hecha) {
    const rc = await correr(process.execPath, ['comprueba_localidad.js', t.slug], P, 600, registro);
    if (rc.code !== 0) res = { estado: 'no-pasa', motivo: 'no pasa su comprobación: ' + ((rc.out.match(/FALTA[^\n]*/g) || []).slice(0, 3).join(' | ') || 'salida ' + rc.code) };
    else { const re = await correr(process.execPath, ['entregada.js', t.slug, '--puesto=' + (t.puesto || '')], P, 300, registro); res = re.code === 0 ? { estado: 'hecha', motivo: '' } : { estado: 'no-pasa', motivo: 'entregada.js salió con ' + re.code }; }
  }
  const archivos = {};
  if (res.estado === 'hecha') for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); if (fs.statSync(p).isFile() && fs.statSync(p).size < 20e6) archivos[f] = fs.readFileSync(p, 'utf8'); }
  archivos['registro-777.log'] = fs.readFileSync(registro, 'utf8').slice(-3e6); // (el registro entero de la localidad, como los cola_NN.log del 4-oct)
  let resumen = {}; try { resumen = JSON.parse(fs.readFileSync(path.join(dir, 'resumen.json'), 'utf8')); } catch {}
  const cifras = res.estado === 'hecha' ? resumen.enLaLista + ' en la lista (' + [resumen.prioridad1, resumen.prioridad2, resumen.prioridad3].join('·') + ') · ' + resumen.fichasMaps + ' fichas · ' + resumen.consultasMaps + ' consultas · ' + resumen.erroresMaps + ' errores' : res.estado;
  log('localidad', t.puesto || '', t.slug, '·', cifras, '·', Math.round((Date.now() - ti) / 60000), 'min'); // (público: sólo cifras)
  const rr = await nucleo('/777/resultado', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: t.id, estado: res.estado, motivo: res.motivo, archivos: res.estado === 'hecha' ? archivos : { 'registro-777.log': archivos['registro-777.log'] } }) });
  if (!rr.ok || rr.j.error) { log('el núcleo no aceptó el resultado:', rr.status, String(rr.j.error || '').slice(0, 120)); return false; }
  // la caché sólo guarda lo necesario de lo ya entregado (sus dos listas y sus marcas): lo grande de una localidad hecha no se arrastra
  if (res.estado === 'hecha') for (const f of fs.readdirSync(dir)) if (!/_sin_web_con_correo\.csv$|_web_caida\.csv$|^(HECHO|ENTREGADA)\.txt$|^resumen\.json$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  return true;
}

// 3 · La vuelta.
let hechas = 0, quedan = false, ultima = Date.now();
for (;;) {
  if ((Date.now() - t0) / 60000 >= MAX_MIN) { quedan = true; log('tiempo de la vuelta agotado'); break; }
  const rs = await nucleo('/777/siguiente?runner=' + encodeURIComponent(process.env.GITHUB_RUN_ID || 'github') + (SOLA ? '&sola=' + encodeURIComponent(SOLA) : ''));
  if (!rs.ok) { log('siguiente: HTTP ' + rs.status, String(rs.j.error || '').slice(0, 160)); break; }
  const t = rs.j;
  if (!t.id) { // parado, vacía, Google limitando o una ya en búsqueda: con «sola», se acaba; si no, se espera un poco por si llega algo
    log('siguiente: nada (' + Object.keys(t).join(', ') + ')');
    if (SOLA || t.parado || t.vacia) break;
    if (t.espera) { const ms = Math.min(t.espera * 60000, MAX_MIN * 60000 - (Date.now() - t0)); log('Google limitando: se esperan', t.espera, 'min'); await new Promise((x) => setTimeout(x, Math.max(1000, ms))); ultima = Date.now(); continue; } // (dentro de la vuelta: no se lanza otra para esperar)
    if (Date.now() - ultima >= IDLE_MS) break;
    await new Promise((x) => setTimeout(x, ESPERA_VACIA)); continue;
  }
  await hacer(t); hechas++; ultima = Date.now();
  if (t.sola) break;
}
log('vuelta:', hechas, 'localidades en', ((Date.now() - t0) / 60000).toFixed(1), 'min');
salida('quedan', quedan && !SOLA ? 'true' : 'false');
