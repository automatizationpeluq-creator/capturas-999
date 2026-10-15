import {validarConfirmacion,validarPendientes} from './contrato-runner.mjs';
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
const IDLE_MS = Number(process.env.IDLE_MIN || 10) * 60000; // (13-oct) sin nada que medir, la máquina espera hasta esto por si la nube hace otra web (una a una): no se arranca una máquina por web
const cab = { authorization: 'Bearer ' + S };
const t0 = Date.now();
const RAIZ = path.resolve(process.env.RUNNER_TEMP || '/tmp', 'evaluador-999');
const CODIGO = path.join(RAIZ, 'codigo');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function correr(cmd, args, cwd, segundos) {
  return new Promise((ok) => {
    const p = spawn(cmd, args, { cwd, env: process.env, windowsHide:true });
    const t = setTimeout(() => p.kill('SIGKILL'), segundos * 1000);
    let out = '';
    p.on('error', (e) => { clearTimeout(t); ok({ code: -1, out: out + 'spawn: ' + e.message }); });
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => { clearTimeout(t); ok({ code, out }); });
  });
}

// Verificación barata antes de descargar código, instalar dependencias o tocar archivos.
const diagnostico=process.env.PRUEBA_AISLADA_999==='1';
const pre = diagnostico?new Response(JSON.stringify({mantenimiento:false,cola:['caso-sintetico']})):await pedirNube(BASE+'/999/evaluar/estado',{headers:cab});
if(!pre.ok)throw new Error('No se puede comprobar la pausa del evaluador: HTTP '+pre.status);
if(!validarPendientes(await pre.json())){log('sin trabajo o en mantenimiento: no se instala ni se mide');process.exit(0);}
// 1. El código del evaluador, desde la nube.
fs.rmSync(RAIZ, { recursive: true, force: true }); fs.mkdirSync(RAIZ, { recursive: true });
// (13-oct 18:55) Medido: el 13-oct a las 17:58 y 18:13 la nube contestó 500 a los 20–36 s (se reiniciaba por CPU) y la vuelta acababa en
// salida 3 («All jobs have failed»). Ahora con los mismos reintentos que el resto de llamadas (pedirNube, también ante 5xx).
const rz = await pedirNube(BASE + '/999/evaluador/codigo', { headers: cab }, 4);
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
  // HTML exacto: la intención del productor está vinculada a estos bytes por SHA-256.
  fs.writeFileSync(path.join(dir, 'web', 'index.html'), String(t.html), 'utf8');
  for (const i of t.imagenes || []) fs.writeFileSync(path.join(dir, 'web', 'imagenes', path.basename(i.nombre)), Buffer.from(i.base64, 'base64'));
  // (14-oct, C129) Las fotos de otras rutas de la web (img-suyas/, icono.svg, logo.jpg…), en su sitio: antes la medida las daba por ausentes.
  for (const x of t.archivos || []) { const rel = String(x.ruta || '').split(String.fromCharCode(92)).join('/'); if (!rel || rel.includes('..') || path.isAbsolute(rel)) continue; const dest = path.join(dir, 'web', rel); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, Buffer.from(x.base64, 'base64')); }
  if (t.fuentes) { fs.mkdirSync(path.join(dir, 'web', 'fuentes'), { recursive: true }); for (const [n, b64] of Object.entries(t.fuentes)) fs.writeFileSync(path.join(dir, 'web', 'fuentes', path.basename(n)), Buffer.from(b64, 'base64')); }
  const informe = path.join(dir, 'informe.md'); fs.writeFileSync(informe, t.informe || '', 'utf8');
  const salida = path.join(dir, 'evaluacion');
  const automation={schema:'automatizacion-evaluador-999-1',capture:{enabled:true,timeout_seconds:900,lab_samples:3},acquisition:true};
  const modelRoot=process.env.MODELOS_999_DIR;
  if(modelRoot){const perception=path.join(dir,'PERCEPCION.json');fs.writeFileSync(perception,JSON.stringify({schema:'percepcion-local-config-999-1',enabled:true,model_root:path.resolve(modelRoot),channels:['semantics','visual','layout'],threads:2,max_images:32,max_regions:128,max_units:1000,timeout_seconds:1200,network_policy:'deny'}));automation.perception=perception;automation.require_complete_perception=true;}
  const automationFile=path.join(dir,'AUTOMATIZACION.json');fs.writeFileSync(automationFile,JSON.stringify(automation));
  process.env.CRITERIO_AUTOMATIZACION_FILE=automationFile;
  const args = [EVALUADOR, '--web', path.join(dir, 'web'), '--salida', salida, '--nombre', t.nombre || '', '--direccion', t.direccion || '', '--movil', t.movil || '', '--telefonos', (t.telefonos || []).join(','), '--informe', informe, '--id', String(t.id), '--sin-banco'];
  // Cuando el productor entrega su intención original, se conserva en privado.
  // El evaluador verifica HTML, ficha y negocio; no reconstruirla de la web.
  if(t.generacion){const gf=path.join(dir,'GENERACION.json');fs.writeFileSync(gf,JSON.stringify(t.generacion),{encoding:'utf8',mode:0o600});args.push('--generacion',gf);}
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

// Diagnóstico técnico con un caso sintético: no reserva colas, no publica resultados ni envía mensajes.
if(diagnostico){
 const html='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Taller de prueba</title></head><body><h1>Taller de prueba</h1><p>Reparación de bicicletas con cita en Calle de Prueba 1, Ciudad.</p><a href="tel:+34900000000">Llamar al taller</a></body></html>';
 const informe='# Taller de prueba · bicicletas · Ciudad\n## 7. Contacto\n- Teléfono: 900000000\n- Dirección: Calle de Prueba 1, Ciudad';
 const id='caso-sintetico-999',version=1;
 const generacion={schema:'intencion-generador-999-1',business_id:id,source_index_sha256:createHash('sha256').update(html).digest('hex'),brief_sha256:createHash('sha256').update(informe).digest('hex'),approved_by_business:false,quality_score:null};
 const res=await evaluarTrabajo({id,version,html,informe,nombre:'Taller de prueba',direccion:'Calle de Prueba 1, Ciudad',movil:'900000000',telefonos:['900000000'],imagenes:[],archivos:[],fuentes:{},generacion});
 const summary={schema:'diagnostico-linux-999-1',estado:res.estado,stderr:res.stderr||null,segundos:res.segundos_servidor,codigo_sha256:process.env.EVALUADOR_CODIGO_SHA256,criterio_maestro:res.criterio_maestro||null,evidencias:res.evidencias,cola_reservada:false,publicado:false,mensajes:0};
 fs.writeFileSync(path.join(process.env.GITHUB_WORKSPACE||RAIZ,'DIAGNOSTICO-LINUX.json'),JSON.stringify(summary,null,2));console.log('::notice title=Diagnóstico Linux 999::'+JSON.stringify({estado:res.estado,segundos:res.segundos_servidor,codigo_sha256:process.env.EVALUADOR_CODIGO_SHA256,mensajes:0}));
 if(res.estado!=='ok'){console.error(res.stderr);process.exit(1);}process.exit(0);
}
// 3. La vuelta.
let hechas = 0, errores = 0, ultimo = null, quedan = false, ultimaMedida = Date.now();
// (13-oct 13:30) La nube se reinicia al desplegar: un fetch sin plazo ni reintento tiraba el proceso entero (exit 1, «All jobs have failed» en
// el correo de Manuel). Cada llamada a la nube: plazo de 2 min y 3 intentos con 20 s entre ellos; si aun así falla, se para esta vuelta con
// salida 0 (la nube la relanza) en vez de reventar.
async function pedirNube(url, opts = {}, intentos = 3) {
  let ultimo;
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(url, Object.assign({}, opts, { signal: AbortSignal.timeout(120000) }));
      // (13-oct 18:55) Un 5xx es la nube reiniciándose (CPU, despliegue): se reintenta igual que si no contestara.
      if (r.status >= 500 && i < intentos) { ultimo = new Error('HTTP ' + r.status); log('nube con error ' + r.status + ' (' + i + '/' + intentos + '): reintento en 20 s'); await new Promise((ok) => setTimeout(ok, 20000)); continue; }
      return r;
    }
    catch (e) { ultimo = e; log('nube no contesta (' + i + '/' + intentos + '): ' + String(e.message || e).slice(0, 120)); if (i < intentos) await new Promise((r) => setTimeout(r, 20000)); }
  }
  return { ok: false, status: 0, error: ultimo, json: async () => ({}), text: async () => String(ultimo && ultimo.message || 'sin respuesta') };
}
for (;;) {
  if ((Date.now() - t0) / 60000 >= MAX_MIN) { quedan = true; log('tiempo de la vuelta agotado'); break; }
  const rs = await pedirNube(BASE + '/999/evaluar/siguiente?runner=' + encodeURIComponent(process.env.GITHUB_RUN_ID || 'github'), { headers: cab });
  if (rs.status === 204) { if (rs.headers.get('x-999-pausado') === 'mantenimiento') break; if (Date.now() - ultimaMedida >= IDLE_MS) break; await new Promise((r) => setTimeout(r, 15000)); continue; } // (13-oct) se espera un rato por si llega otra
  if (!rs.ok) { log('siguiente: HTTP ' + rs.status); quedan = true; break; }
  let t; try { t = await rs.json(); } catch (e) { log('siguiente: respuesta ilegible'); quedan = true; break; } if (!t || !t.id) break;
  if (ultimo === t.id + ':' + t.version) { log('la nube repite', t.id, '(no aplicó el resultado): paro'); break; }
  ultimo = t.id + ':' + t.version;
  log('midiendo', t.id);
  let res; try { res = await evaluarTrabajo(t); } catch (e) { res = { estado: 'error', stderr: String(e.stack || e).slice(-1500) }; }
  const rr = await pedirNube(BASE + '/999/evaluar/resultado', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, cab), body: JSON.stringify({ id: t.id, version: t.version, token:t.arriendo?.token, resultado: res }) });
  const j = await rr.json().catch(() => ({}));
  try { validarConfirmacion(rr,j,t); } catch(e) { errores++;log('resultado no aceptado:',t.id,e.message,'HTTP',rr.status);break; }
  if (res.estado === 'ok') hechas++; else errores++;
  ultimaMedida = Date.now();
  log(res.estado, t.id, res.segundos_servidor + ' s', res.fallos ? res.fallos.length + ' fallos' : '', 'bloquean', j.bloquean, rr.ok ? '' : 'HTTP ' + rr.status);
}
log('vuelta: medidas', hechas, 'errores', errores, 'en', ((Date.now() - t0) / 60000).toFixed(1), 'min');
if (quedan) { const c = await pedirNube(BASE + '/999/evaluar/continuar', { method: 'POST', headers: cab }); log('siguiente vuelta:', await c.text()); }
