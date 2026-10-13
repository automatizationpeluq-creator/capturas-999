// Captura las webs «en espera» (las que Cloudflare no pudo por su tope) con el mismo método: un navegador, dos pestañas a la vez
// (móvil ×1,5 y ordenador), página completa, jpeg 70, tope 5 s por web; un solo intento. Sube las dos por /999/captura/subir.
// Al acabar apunta en la nube los minutos gastados (redondeados hacia arriba, como factura GitHub). Si no quedan minutos, no captura.
import { chromium } from 'playwright';
const BASE = 'https://negocios.automtizationninameu.es';
const S = process.env.SECRETO_999; if (!S) { console.error('falta SECRETO_999'); process.exit(2); }
const cab = { authorization: 'Bearer ' + S };
const t0 = Date.now();
const apuntar = async (webs) => { const min = Math.ceil((Date.now() - t0) / 60000); const r = await fetch(BASE + '/999/capturas/uso-github?minutos=' + min + '&webs=' + webs, { method: 'POST', headers: cab }); console.log('apuntado:', await r.text()); };
const p = await (await fetch(BASE + '/999/capturas/pendientes', { headers: cab })).json();
console.log('en espera:', p.webs.length, '· minutos de GitHub que quedan este mes:', p.quedaMinutosGithub);
if (!p.webs.length) { await apuntar(0); process.exit(0); }
if (p.quedaMinutosGithub < 5) { console.log('sin minutos: no se captura'); await apuntar(0); process.exit(0); }
const maxWebs = Math.min(p.webs.length, Math.floor((p.quedaMinutosGithub - 3) * 60 / 6)); // 6 s por web con subida, y 3 min de margen
const browser = await chromium.launch();
let hechas = 0, fallidas = 0;
const una = async (w, vp, nombre) => {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
  const page = await ctx.newPage();
  try { await page.goto(w.url, { waitUntil: 'load', timeout: 4000 }); } catch (e) { /* se captura lo que haya */ }
  const img = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 70 });
  await ctx.close();
  return [nombre, img];
};
for (const w of p.webs.slice(0, maxWebs)) {
  const ti = Date.now();
  try {
    let reloj; const limite = new Promise((_, no) => { reloj = setTimeout(() => no(new Error('más de ' + p.msPorWeb / 1000 + ' s')), p.msPorWeb); });
    const imgs = await Promise.race([Promise.all([una(w, p.movil, 'movil'), una(w, p.pc, 'pc')]), limite]);
    clearTimeout(reloj);
    for (const [n, img] of imgs) {
      const r = await fetch(BASE + '/999/captura/subir/' + encodeURIComponent(w.id) + '/' + n + '.jpg?version=' + w.version + '&donde=github', { method: 'POST', headers: Object.assign({ 'content-type': 'image/jpeg' }, cab), body: img });
      if (!r.ok) throw new Error('subida ' + n + ': HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
    }
    hechas++; console.log('ok', w.id, Date.now() - ti, 'ms');
  } catch (e) {
    fallidas++; console.log('FALLÓ', w.id, String(e.message).slice(0, 160));
    // Queda «fallida» en la nube: un solo intento, nunca se repite (regla de Manuel).
    await fetch(BASE + '/999/captura/fallida/' + encodeURIComponent(w.id) + '?version=' + w.version + '&motivo=' + encodeURIComponent(String(e.message).slice(0, 120)), { method: 'POST', headers: cab }).catch(() => {});
  }
  if ((Date.now() - t0) / 60000 > p.quedaMinutosGithub - 3) { console.log('se acaba el margen de minutos: paro'); break; }
}
await browser.close();
console.log('hechas', hechas, 'fallidas', fallidas, 'en', Math.round((Date.now() - t0) / 1000), 's');
// (13-oct) Si quedaron webs sin capturar (tope de la vuelta), la nube lanza otra vuelta.
if (p.webs.length > hechas + fallidas) { const c = await fetch(BASE + '/999/capturas/continuar', { method: 'POST', headers: cab }).catch(() => null); console.log('siguiente vuelta:', c ? await c.text() : 'sin respuesta'); }
await apuntar(hechas);
