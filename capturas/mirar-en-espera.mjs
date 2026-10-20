// El 999 en GitHub: mirar y capturar las webs del 999. Siempre GitHub desde el 19-oct 21:50 (Manuel: «quiero que use siempre github que luego
// vienen muchos problemas y siempre funcione así»; antes, 11-oct 18:32: «configura esa segunda opción para cuando el límite de cloudflare
// gratis llegue»; 12-oct 23:17: «eso se hace en github para no agobiar cloudflare y evitar cobros»; 19-oct: «no quiero pagar mas»).
// Cómo arranca (20-oct, como el 777): siempre hay una vuelta viva. Pregunta al núcleo cada minuto (cada 2 con el 999 apagado; cada 15 s si viene
// una web) y, si hay web que mirar, abre Chrome y la mira. Al acabar su tiempo, capturas.yml pide la vuelta siguiente. Medido el 19-oct: la vuelta
// programada de GitHub llega una o dos veces al día, no cada 15 min; sin esto una web esperaría horas. El núcleo no necesita llave de GitHub.
// Si falta el secreto o el núcleo no lo acepta (401): cortar=true y la cadena se corta (si no, una vuelta fallida tras otra sin fin); la
// vuelta programada la retoma cuando esté arreglado. Si el núcleo no contesta (se está subiendo), unos intentos; tras 5 seguidos esta vuelta
// falla y la siguiente vuelve a empezar.
// El núcleo (negocios-nucleo) decide qué se mira: aquí sólo se abre Chrome, se mide con SU código (MEDIR_JS, el mismo que usa Cloudflare; el
// repositorio público no lo lleva) y se le devuelven las capturas y las medidas. Nada de datos ni secretos en el repositorio.
// Sin dependencias: Node 22 (WebSocket propio) y el Chrome que trae la máquina de GitHub, por DevTools Protocol.
//   SECRETO_999 (Secrets del repositorio) · NUCLEO (opcional) · CHROME (opcional: google-chrome) · MINUTOS (opcional: 55) · CADA_MS (60000)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';

const BASE = (process.env.NUCLEO || 'https://negocios.automtizationninameu.es').replace(/\/$/, ''), S = process.env.SECRETO_999;
const MINUTOS = Number(process.env.MINUTOS || 55), CADA_MS = Number(process.env.CADA_MS || 60000);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const hora = () => new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' });
const salida = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, k + '=' + v + '\n'); };
const cortar = (msj) => { console.log(hora(), msj + ': la cadena se corta; la vuelta programada la retoma cuando esté arreglado'); salida('cortar', 'true'); process.exit(0); };
if (!S) cortar('Falta el secreto del 999 (SECRETO_999 en los Secrets del repositorio)');
async function api(metodo, ruta, cuerpo) {
  const r = await fetch(BASE + '/api' + ruta, { method: metodo, headers: { authorization: 'Bearer ' + S, 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, signal: AbortSignal.timeout(120000) });
  if (r.status === 401) cortar('El núcleo no acepta el secreto del 999: HTTP 401'); // (sólo 401: un 403 puede ser del borde de Cloudflare, pasajero; cuenta como fallo y se reintenta)
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = { error: t.slice(0, 200) }; }
  if (!r.ok && r.status !== 409) throw new Error(ruta + ': HTTP ' + r.status + ' ' + (d.error || ''));
  return d;
}
if (process.argv.includes('--solo-estado')) { console.log(hora(), JSON.stringify(await api('GET', '/999/github/estado'))); process.exit(0); }
let MEDIR_JS = '', VISTAS = null; // el código que mide lo da el núcleo (se pide al ir a mirar la primera)

// ---------- Chrome por DevTools Protocol ----------
const CHROME = process.env.CHROME || (() => { for (const c of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) { try { return execSync('command -v ' + c, { shell: '/bin/bash' }).toString().trim(); } catch {} } return ''; })();
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
    try { await cdp.send('Page.bringToFront', {}, sessionId); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId); } catch {} // (una pestaña oculta no da LCP: F16 quedaría «pending»)
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

// ---------- la vuelta ----------
// Chrome se abre sólo al ir a mirar y se cierra si pasan 10 min sin nada.
const fin = Date.now() + MINUTOS * 60000;
let hechas = 0, fallos = 0, cdp = null, ultimaMirada = Date.now(), dicho = '';
const cerrarChrome = async () => { if (cdp) { await cdp.cerrar(); cdp = null; } };
try {
  while (Date.now() < fin) {
    // una pregunta por vuelta del bucle: el estado (barato); sólo si hay web se pide la siguiente
    let e, t = null;
    try { e = await api('GET', '/999/github/estado'); if (e.hay) t = await api('POST', '/999/github/siguiente', {}); fallos = 0; } catch (x) { if (++fallos >= 5) throw x; console.log(hora(), String(x.message || x)); await espera(30000); continue; }
    if (!t || t.nada || !t.numero) {
      const pausa = e.pronto || (t && t.espera) ? 15000 : e.encendido || e.hay ? CADA_MS : 2 * CADA_MS;
      const d = e.encendido ? 'encendido, esperando web' : 'el 999 está apagado'; if (d !== dicho) { console.log(hora(), d); dicho = d; }
      if (cdp && Date.now() - ultimaMirada > 10 * 60000) await cerrarChrome();
      if (Date.now() + pausa >= fin) break;
      await espera(pausa); continue;
    }
    dicho = '';
    if (!VISTAS) { const m = await api('GET', '/999/github/medir'); MEDIR_JS = m.js; VISTAS = m.vistas; console.log(hora(), 'mirar', m.version); }
    if (!cdp) { if (!CHROME) throw new Error('No hay Chrome en la máquina'); cdp = await abrir(); }
    const medidas = {}, capturas = {}, errores = [];
    for (const nombre of ['movil', 'pc', 'estrecho']) {
      try { const r = await vista(cdp, t.url, VISTAS[nombre]); medidas[nombre] = r.medidas; if (!r.medidas) errores.push(nombre + ': sin #medidas-999'); if (nombre !== 'estrecho') { if (r.captura) capturas[nombre] = r.captura; else errores.push(nombre + ': sin captura'); } }
      catch (e) { errores.push(nombre + ': ' + String(e.message || e).slice(0, 160)); }
    }
    const ok = Boolean(capturas.movil && capturas.pc && medidas.movil && medidas.pc && medidas.estrecho);
    const r = await api('POST', '/999/github/entregar', { numero: t.numero, version: t.version, ok, medidas, capturas: ok ? capturas : null, errores });
    hechas++; ultimaMirada = Date.now();
    console.log(hora(), t.numero, ok ? 'mirada' : 'falló: ' + errores.join(' · '), '→', r.etapa || r.error || '');
  }
} finally { await cerrarChrome(); }
console.log(hora(), hechas, 'miradas en esta vuelta; la siguiente la pide capturas.yml');
salida('cortar', 'false');
