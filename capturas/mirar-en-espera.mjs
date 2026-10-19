// El 999 en GitHub (19-oct-2026): mirar y capturar las webs cuando se acaban las horas de navegador de Cloudflare incluidas en el plan.
// Manuel, 11-oct 18:32: «configura esa segunda opción para cuando el límite de cloudflare gratis llegue. no se puede pasar»; 12-oct 23:17: «eso
// se hace en github para no agobiar cloudflare y evitar cobros»; 19-oct: «no quiero pagar mas y lo de cloudflare se acaba».
// El núcleo (negocios-nucleo) decide qué se mira y quién: aquí sólo se abre Chrome, se mide con SU código (MEDIR_JS, el mismo que usa Cloudflare;
// el repositorio público no lo lleva) y se le devuelven las capturas y las medidas. Nada de datos ni secretos en el repositorio.
// Sin dependencias: Node 22 (WebSocket propio) y el Chrome que trae la máquina de GitHub, por DevTools Protocol.
//   SECRETO_999 (Secrets del repositorio) · NUCLEO (opcional) · CHROME (opcional: google-chrome) · MINUTOS (opcional: 25)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const BASE = (process.env.NUCLEO || 'https://negocios.automtizationninameu.es').replace(/\/$/, ''), S = process.env.SECRETO_999;
const MINUTOS = Number(process.env.MINUTOS || 25);
if (!S) throw new Error('Falta el secreto del 999');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const hora = () => new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' });
async function api(metodo, ruta, cuerpo) {
  const r = await fetch(BASE + '/api' + ruta, { method: metodo, headers: { authorization: 'Bearer ' + S, 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, signal: AbortSignal.timeout(120000) });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = { error: t.slice(0, 200) }; }
  if (!r.ok && r.status !== 409) throw new Error(ruta + ': HTTP ' + r.status + ' ' + (d.error || ''));
  return d;
}

// ¿Hay algo que mirar? (si no, se acaba aquí en segundos)
const estado = await api('GET', '/999/github/estado');
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'activo=' + Boolean(estado.hay) + '\n');
if (!estado.hay) { console.log(hora(), 'Nada que mirar' + (estado.cloudflareQueda ? ' (Cloudflare tiene horas: mira él)' : '')); process.exit(0); }
if (process.argv.includes('--solo-estado')) process.exit(0);

const { js: MEDIR_JS, vistas: VISTAS, version } = await api('GET', '/999/github/medir');
console.log(hora(), 'mirar', version);

// ---------- Chrome por DevTools Protocol ----------
const CHROME = process.env.CHROME || (() => { for (const c of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) { try { return execSync('command -v ' + c, { shell: '/bin/bash' }).toString().trim(); } catch {} } return ''; })();
if (!CHROME) throw new Error('No hay Chrome en la máquina');
async function abrir() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'mirar999-'));
  const p = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + perfil, '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--disable-extensions', '--hide-scrollbars', '--no-sandbox', '--lang=es-ES', 'about:blank'], { stdio: 'ignore' });
  let url = '';
  for (let i = 0; i < 150 && !url; i++) { try { const [port, ruta] = fs.readFileSync(path.join(perfil, 'DevToolsActivePort'), 'utf8').split(/\r?\n/); if (port && ruta) url = 'ws://127.0.0.1:' + port + ruta; } catch {} if (!url) await espera(100); }
  if (!url) { p.kill(); throw new Error('Chrome no abrió DevTools'); }
  const ws = new WebSocket(url); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(), oyentes = [];
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { const { r, j } = pend.get(m.id); pend.delete(m.id); m.error ? j(new Error(m.error.message)) : r(m.result); } else for (const o of oyentes.slice()) o(m); };
  const send = (method, params = {}, sessionId) => new Promise((r, j) => { const k = ++id; pend.set(k, { r, j }); ws.send(JSON.stringify({ id: k, method, params, sessionId })); });
  const evento = (method, sessionId, ms = 30000) => new Promise((r, j) => { const t = setTimeout(() => { quitar(); j(new Error('sin ' + method)); }, ms); const o = (m) => { if (m.method === method && m.sessionId === sessionId) { clearTimeout(t); quitar(); r(m.params); } }; const quitar = () => { const i = oyentes.indexOf(o); if (i >= 0) oyentes.splice(i, 1); }; oyentes.push(o); });
  const cerrar = async () => { try { await send('Browser.close'); } catch {} try { ws.close(); } catch {} await espera(300); try { p.kill(); } catch {} try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {} };
  return { send, evento, cerrar };
}
// Las medidas dentro del HTML: la de fase «final» si la hay (como leerMedidas del núcleo).
function leerMedidas(html) {
  const re = /<script\b[^>]*\bid=["']?medidas-999["']?[^>]*>([\s\S]*?)<\/script>/gi; const todas = []; let m;
  while ((m = re.exec(String(html || '')))) { try { todas.push(JSON.parse(m[1])); } catch {} }
  const finales = todas.filter((x) => x && x.fase === 'final');
  return (finales.length ? finales[finales.length - 1] : todas[todas.length - 1]) || null;
}
// Una vista, como el snapshot de Cloudflare: ventana exacta, cargar (≈ networkidle0), inyectar el script, leer a los 1,7 s y capturar.
async function vista(cdp, url, v) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  try {
    await cdp.send('Page.enable', {}, sessionId); await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: v.deviceScaleFactor || 1, mobile: false }, sessionId);
    const carga = cdp.evento('Page.loadEventFired', sessionId, 30000);
    await cdp.send('Page.navigate', { url }, sessionId); await carga; await espera(1500);
    const ev = (expression) => cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId).then((r) => r.result.value);
    await ev('(function(){var s=document.createElement("script");s.textContent=' + JSON.stringify(MEDIR_JS) + ';document.body.appendChild(s);return 1})()');
    await espera(1700);
    const medidas = leerMedidas(await ev('document.documentElement.outerHTML'));
    let captura = null;
    const c = v.captura || {};
    if (c.type) {
      let alto = v.height;
      if (c.fullPage) { const lm = await cdp.send('Page.getLayoutMetrics', {}, sessionId); alto = Math.min(16000, Math.ceil((lm.cssContentSize || lm.contentSize).height)); }
      const r = await cdp.send('Page.captureScreenshot', { format: c.type === 'png' ? 'png' : 'jpeg', quality: c.quality || 70, captureBeyondViewport: Boolean(c.fullPage), clip: { x: 0, y: 0, width: v.width, height: alto, scale: 1 } }, sessionId);
      captura = r.data;
    }
    return { medidas, captura };
  } finally { try { await cdp.send('Target.closeTarget', { targetId }); } catch {} }
}

const fin = Date.now() + MINUTOS * 60000;
let hechas = 0;
const cdp = await abrir();
try {
  while (Date.now() < fin) {
    const t = await api('POST', '/999/github/siguiente', {});
    if (!t || t.nada || !t.numero) { console.log(hora(), 'no queda nada que mirar' + (t && t.motivo ? ' (' + t.motivo + ')' : '')); break; }
    const medidas = {}, capturas = {}, errores = [];
    for (const nombre of ['movil', 'pc', 'estrecho']) {
      try { const r = await vista(cdp, t.url, VISTAS[nombre]); medidas[nombre] = r.medidas; if (!r.medidas) errores.push(nombre + ': sin #medidas-999'); if (nombre !== 'estrecho') { if (r.captura) capturas[nombre] = r.captura; else errores.push(nombre + ': sin captura'); } }
      catch (e) { errores.push(nombre + ': ' + String(e.message || e).slice(0, 160)); }
    }
    const ok = Boolean(capturas.movil && capturas.pc && medidas.movil && medidas.pc && medidas.estrecho);
    const r = await api('POST', '/999/github/entregar', { numero: t.numero, version: t.version, ok, medidas, capturas: ok ? capturas : null, errores });
    hechas++;
    console.log(hora(), t.numero, ok ? 'mirada' : 'falló: ' + errores.join(' · '), '→', r.etapa || r.error || '');
  }
} finally { await cdp.cerrar(); }
console.log(hora(), hechas, 'miradas');
