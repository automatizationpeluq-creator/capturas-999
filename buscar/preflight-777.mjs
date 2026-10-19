// Antes de instalar nada (fase 5, 19-oct-2026): ¿hay algo que buscar? Pregunta al núcleo (GET /api/777/estado, con el secreto).
// Si no hay (apagado o sin cola), ESPERA aquí, preguntando cada 2 minutos, hasta ESPERA_MIN: así el 777 empieza en menos de 2 minutos después de
// encenderlo en el panel, sin clave de GitHub en el núcleo y sin coste (Manuel, 19-oct: «sería mejor hacerlo en un repositorio ilimitado»; medido:
// la vuelta programada de GitHub en este repositorio llega cada 2–6 h). Esperando no baja caché ni código: sólo pregunta (unas 720 veces al día).
// (La comprobación de octubre, control/preflight.mjs, es compartida con el 999 y daba siempre «activo» al 777: ésta es sólo del 777.)
// Deja en GITHUB_OUTPUT: activo (true/false), overture (la versión publicada de Overture, para la clave de su caché) y esperado (minutos).
import fs from 'node:fs';
const BASE = (process.env.NUCLEO || 'https://negocios.automtizationninameu.es').replace(/\/$/, ''), S = process.env.SECRETO_999, SOLA = (process.env.SOLA || '').trim();
const ESPERA_MIN = Number(process.env.ESPERA_MIN ?? 60), CADA_MS = Number(process.env.CADA_MS || 120000);
if (!S) throw new Error('Falta el secreto del 999');
const t0 = Date.now(), log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const estado = async () => { const r = await fetch(BASE + '/api/777/estado', { headers: { authorization: 'Bearer ' + S }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('El núcleo no contesta al estado del 777: HTTP ' + r.status); return r.json(); };
let e = {}, activo = Boolean(SOLA), fallos = 0;
for (;;) {
  try { e = await estado(); fallos = 0; } catch (x) { fallos++; log(String(x.message || x)); if (fallos >= 5) throw x; } // (el núcleo se reinicia al subir: unos intentos)
  if (SOLA || (e.encendido && e.hayQueBuscar)) { activo = true; break; }
  if ((Date.now() - t0) / 60000 >= ESPERA_MIN) break;
  await new Promise((r) => setTimeout(r, CADA_MS));
}
let overture = 'sin-leer';
if (activo) { try { const tx = await (await fetch('https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/', { signal: AbortSignal.timeout(30000) })).text(); overture = [...tx.matchAll(/<Prefix>release\/([^<]+)\/<\/Prefix>/g)].map((m) => m[1]).sort().pop() || overture; } catch {} }
const esperado = Math.round((Date.now() - t0) / 60000);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'activo=' + activo + '\noverture=' + overture + '\nesperado=' + esperado + '\n');
log(activo ? 'Hay que buscar' + (SOLA ? ' (sola: ' + SOLA + ')' : '') + ' · en cola ' + e.enCola + ' · esperado ' + esperado + ' min' : (e.encendido ? 'Encendido, sin nada que buscar' : 'Apagado') + ' en ' + esperado + ' min de espera: la vuelta siguiente sigue esperando');
