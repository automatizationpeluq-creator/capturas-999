// El evaluador 10×10 del 999 corriendo en GitHub Actions (11-oct-2026). Mismo método que en el PC y que en Render: la nube entrega
// cada web por medir (GET /999/evaluar/siguiente), aquí se escribe en disco, se pasa evaluar_web.py con Chrome y el resultado vuelve
// a la nube (POST /999/evaluar/resultado), que lo aplica en la web y en el panel.
// El código del evaluador NO vive en este repositorio: lo guarda la nube y se baja aquí con el secreto en cada vuelta.
// Bucle: cada vuelta mide hasta MAX_MIN minutos; si quedan webs, avisa a la nube (POST /999/evaluar/continuar) y la nube lanza otra vuelta.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {archive} from './archivo-evidencias.mjs';
import {createHash} from 'node:crypto';

const BASE = 'https://negocios.automtizationninameu.es';
const S = process.env.SECRETO_999; if (!S) { console.error('falta SECRETO_999'); process.exit(2); }
const MAX_MIN = Number(process.env.MAX_MIN || 55);          // una vuelta no pasa de esto (GitHub corta a las 360); luego, otra vuelta
const MAX_S_WEB = Number(process.env.MAX_S_WEB || 900);     // igual que tiempo_maximo_s en evaluador.config.json
const cab = { authorization: 'Bearer ' + S };
const t0 = Date.now();
const RAIZ = path.resolve(process.env.RUNNER_TEMP || '/tmp', 'evaluador-999');
const CODIGO = path.join(RAIZ, 'codigo');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function correr(cmd, args, cwd, segundos) {
  return new Promise((ok) => {
    const p = spawn(cmd, args, { cwd, env: process.env });
    const t = setTimeout(() => p.kill('SIGKILL'), segundos * 1000);
    let out = '';
    p.on('error', (e) => { clearTimeout(t); ok({ code: -1, out: out + 'spawn: ' + e.message }); });
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => { clearTimeout(t); ok({ code, out }); });
  });
}

// 1. El código del evaluador, desde la nube.
fs.rmSync(RAIZ, { recursive: true, force: true }); fs.mkdirSync(RAIZ, { recursive: true });
const rz = await fetch(BASE + '/999/evaluador/codigo', { headers: cab });
if (!rz.ok) { console.error('código del evaluador: HTTP ' + rz.status); process.exit(3); }
const zip = path.join(RAIZ, 'codigo.zip'); fs.writeFileSync(zip, Buffer.from(await rz.arrayBuffer()));
process.env.EVALUADOR_CODIGO_SHA256=createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
let r = await correr('python3', ['-m', 'zipfile', '-e', zip, RAIZ], RAIZ, 120); if (r.code !== 0) { console.error('descomprimir: ' + r.out.slice(-500)); process.exit(3); }
const V7 = path.join(CODIGO, 'estudio-mundial', 'v7');
r = await correr('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], V7, 300); if (r.code !== 0) { console.error('npm: ' + r.out.slice(-500)); process.exit(3); }
const EVALUADOR = path.join(V7, 'evaluador-operativo', 'evaluador-operativo-10x10', 'evaluar_web.py');
r = await correr('python3', ['-m','pip','install','--disable-pip-version-check','--quiet','-r',path.join(path.dirname(EVALUADOR),'requirements-capacidades.txt')], RAIZ, 180); if(r.code!==0){console.error('dependencias de observación: '+r.out.slice(-500));process.exit(3);}
const CHROME = path.join(RAIZ, 'chromium-999');
fs.writeFileSync(CHROME, '#!/bin/sh\nexec "' + (process.env.CHROME_BIN || '/usr/bin/google-chrome') + '" --no-sandbox --disable-dev-shm-usage --disable-gpu "$@"\n'); fs.chmodSync(CHROME, 0o755);
Object.assign(process.env, { CHROME_PATH: CHROME, AXE_PATH: path.join(V7, 'node_modules', 'axe-core', 'axe.min.js'), PYTHONIOENCODING: 'utf-8', PYTHONUTF8:'1' });
log('código listo en', ((Date.now() - t0) / 1000).toFixed(0), 's');

// 2. Medir una web (lo mismo que hacía servidor.mjs en Render, sin el archivo de evidencias).
async function evaluarTrabajo(t) {
  if (!t || !/^[a-z0-9][a-z0-9_-]{0,120}$/i.test(String(t.id)) || t.version == null || typeof t.html !== 'string') throw new Error('Trabajo sin identidad, versión o HTML válido');
  const dir = path.join(RAIZ, 'webs', String(t.id) + '-' + String(t.version).replace(/[^a-z0-9_-]/gi, '_'));
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'web', 'imagenes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'web', 'index.html'), t.html, 'utf8');
  for (const i of t.imagenes || []) fs.writeFileSync(path.join(dir, 'web', 'imagenes', path.basename(i.nombre)), Buffer.from(i.base64, 'base64'));
  if (t.fuentes) { fs.mkdirSync(path.join(dir, 'web', 'fuentes'), { recursive: true }); for (const [n, b64] of Object.entries(t.fuentes)) fs.writeFileSync(path.join(dir, 'web', 'fuentes', path.basename(n)), Buffer.from(b64, 'base64')); }
  const informe = path.join(dir, 'informe.md'); fs.writeFileSync(informe, t.informe || '', 'utf8');
  const salida = path.join(dir, 'evaluacion');
  const args = [EVALUADOR, '--web', path.join(dir, 'web'), '--salida', salida, '--nombre', t.nombre || '', '--direccion', t.direccion || '', '--movil', t.movil || '', '--telefonos', (t.telefonos || []).join(','), '--informe', informe, '--id', String(t.id), '--sin-banco'];
  const ti = Date.now();
  const r = await correr('python3', args, path.dirname(EVALUADOR), MAX_S_WEB);
  const archivo = path.join(salida, 'RESULTADO-EVALUACION.json');
  let res;
  if (r.code === 0 && fs.existsSync(archivo)) { try { res = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch (e) { res = { estado: 'error', stderr: 'Resultado ilegible: ' + e.message }; } }
  else res = { estado: 'error', stderr: ('código ' + r.code + ': ' + r.out).slice(-1500) };
  res.segundos_servidor = Math.round((Date.now() - ti) / 100) / 10;
  res.servidor = 'github'; res.site_version = t.version;
  // Primero conservar el expediente cifrado; no destruirlo antes de poder recuperarlo.
  fs.mkdirSync(salida,{recursive:true});fs.writeFileSync(path.join(salida,'RESULTADO-EVALUACION.json'),JSON.stringify(res,null,2));
  res.evidencias=archive(salida,t,S,process.env.EVIDENCIAS_DIR||path.join(process.env.RUNNER_TEMP||'/tmp','evidencias-999'));
  fs.rmSync(dir, { recursive: true, force: true });
  return res;
}

// 3. La vuelta.
let hechas = 0, errores = 0, ultimo = null, quedan = false;
for (;;) {
  if ((Date.now() - t0) / 60000 >= MAX_MIN) { quedan = true; log('tiempo de la vuelta agotado'); break; }
  const rs = await fetch(BASE + '/999/evaluar/siguiente', { headers: cab });
  if (rs.status === 204) break;
  if (!rs.ok) { log('siguiente: HTTP ' + rs.status); break; }
  const t = await rs.json(); if (!t || !t.id) break;
  if (ultimo === t.id + ':' + t.version) { log('la nube repite', t.id, '(no aplicó el resultado): paro'); break; }
  ultimo = t.id + ':' + t.version;
  log('midiendo', t.id);
  let res; try { res = await evaluarTrabajo(t); } catch (e) { res = { estado: 'error', stderr: String(e.stack || e).slice(-1500) }; }
  const rr = await fetch(BASE + '/999/evaluar/resultado', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, cab), body: JSON.stringify({ id: t.id, version: t.version, resultado: res }) });
  const j = await rr.json().catch(() => ({}));
  if (res.estado === 'ok') hechas++; else errores++;
  log(res.estado, t.id, res.segundos_servidor + ' s', res.fallos ? res.fallos.length + ' fallos' : '', 'bloquean', j.bloquean, rr.ok ? '' : 'HTTP ' + rr.status);
}
log('vuelta: medidas', hechas, 'errores', errores, 'en', ((Date.now() - t0) / 60000).toFixed(1), 'min');
if (quedan) { const c = await fetch(BASE + '/999/evaluar/continuar', { method: 'POST', headers: cab }); log('siguiente vuelta:', await c.text()); }
