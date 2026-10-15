// Captura las webs «en espera» (las que Cloudflare no pudo por su tope) con el mismo método: un navegador, dos pestañas a la vez
// (móvil ×1,5 y ordenador), página completa, jpeg 70, tope 5 s por web; un solo intento. Sube las dos por /999/captura/subir.
// Al acabar apunta en la nube los minutos gastados capturando (redondeados hacia arriba). Si no quedan minutos, no captura.
// (13-oct 04:30, Manuel: «soluciona el tiempo ese de GitHub») Antes cada web nueva arrancaba una máquina (1–2 min de arranque):
// ahora la máquina, sin nada que capturar, espera hasta IDLE_MIN por si el bucle de la 999 (una web a la vez) hace otra, preguntando
// cada 15 s; en todo caso se apaga a los MAX_MIN. Sólo cuenta como gasto el tiempo capturando, no la espera.
import { chromium } from 'playwright';
const BASE = 'https://negocios.automtizationninameu.es';
const S = process.env.SECRETO_999; if (!S) { console.error('falta SECRETO_999'); process.exit(2); }
const cab = { authorization: 'Bearer ' + S };
// (13-oct 13:20) Ninguna llamada a la nube sin plazo: si la nube se reinicia a mitad de una subida, el runner no se queda colgado (lo estuvo 14 min).
const conPlazo = (ms) => ({ signal: AbortSignal.timeout(ms) });
const IDLE_MS = Number(process.env.IDLE_MIN || 8) * 60000, MAX_MS = Number(process.env.MAX_MIN || 25) * 60000;
const t0 = Date.now();
let activoMs = 0, hechas = 0, fallidas = 0, browser = null, ultimaWeb = Date.now(), quedaban = 0;
const apuntar = async () => { try { const min = Math.ceil(activoMs / 60000); const r = await fetch(BASE + '/999/capturas/uso-github?minutos=' + min + '&webs=' + hechas, Object.assign({ method: 'POST', headers: cab }, conPlazo(30000))); console.log('apuntado:', await r.text()); } catch (e) { console.log('apuntar:', String(e.message).slice(0, 100)); } };
const una = async (w, vp, nombre) => {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
  const page = await ctx.newPage();
  try { await page.goto(w.url, { waitUntil: 'load', timeout: 4000 }); } catch (e) { /* se captura lo que haya */ }
  const img = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 });
  await ctx.close();
  return [nombre, img];
};
for (;;) {
  let p;
  try { p = await (await fetch(BASE + '/999/capturas/pendientes', Object.assign({ headers: cab }, conPlazo(30000)))).json(); } catch (e) { console.log('pendientes:', String(e.message).slice(0, 120)); await new Promise((r) => setTimeout(r, 15000)); if (Date.now() - t0 >= MAX_MS) break; continue; }
  if(p.mantenimiento) break;
  if (!p.webs || !p.webs.length) {
    quedaban = 0;
    if (Date.now() - ultimaWeb >= IDLE_MS || Date.now() - t0 >= MAX_MS) break;
    await new Promise((r) => setTimeout(r, 15000)); continue;
  }
  if (p.quedaMinutosGithub < 5) { console.log('sin minutos: no se captura'); quedaban = 0; break; }
  console.log('en espera:', p.webs.length, '· minutos de GitHub que quedan este mes:', p.quedaMinutosGithub);
  const maxWebs = Math.min(p.webs.length, Math.floor((p.quedaMinutosGithub - 3) * 60 / 6)); // 6 s por web con subida, y 3 min de margen
  if (!browser) browser = await chromium.launch();
  const tanda0 = Date.now(); let enTanda = 0;
  for (const w of p.webs.slice(0, maxWebs)) {
    const ti = Date.now();
    try {
      let reloj; const limite = new Promise((_, no) => { reloj = setTimeout(() => no(new Error('más de ' + p.msPorWeb / 1000 + ' s')), p.msPorWeb); });
      const imgs = await Promise.race([Promise.all([una(w, p.movil, 'movil'), una(w, p.pc, 'pc')]), limite]);
      clearTimeout(reloj);
      for (const [n, img] of imgs) {
        const r = await fetch(BASE + '/999/captura/subir/' + encodeURIComponent(w.id) + '/' + n + '.jpg?version=' + w.version + '&donde=github', Object.assign({ method: 'POST', headers: Object.assign({ 'content-type': 'image/jpeg' }, cab), body: img }, conPlazo(90000)));
        if (!r.ok) throw new Error('subida ' + n + ': HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
      }
      hechas++; console.log('ok', w.id, Date.now() - ti, 'ms');
    } catch (e) {
      fallidas++; console.log('FALLÓ', w.id, String(e.message).slice(0, 160));
      // Queda «fallida» en la nube: un solo intento, nunca se repite (regla de Manuel).
      await fetch(BASE + '/999/captura/fallida/' + encodeURIComponent(w.id) + '?version=' + w.version + '&motivo=' + encodeURIComponent(String(e.message).slice(0, 120)), Object.assign({ method: 'POST', headers: cab }, conPlazo(30000))).catch(() => {});
    }
    enTanda++; ultimaWeb = Date.now();
    if ((activoMs + Date.now() - tanda0) / 60000 > p.quedaMinutosGithub - 3) { console.log('se acaba el margen de minutos: paro'); break; }
  }
  activoMs += Date.now() - tanda0;
  quedaban = p.webs.length - enTanda;
  if (Date.now() - t0 >= MAX_MS) break;
}
if (browser) await browser.close();
console.log('hechas', hechas, 'fallidas', fallidas, 'capturando', Math.round(activoMs / 1000), 's, en máquina', Math.round((Date.now() - t0) / 1000), 's');
// Si quedaron webs sin capturar (tope de la vuelta o de minutos), la nube lanza otra vuelta.
if (quedaban > 0) { const c = await fetch(BASE + '/999/capturas/continuar', Object.assign({ method: 'POST', headers: cab }, conPlazo(30000))).catch(() => null); console.log('siguiente vuelta:', c ? await c.text() : 'sin respuesta'); }
await apuntar();
