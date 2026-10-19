// Antes de instalar nada (fase 5, 19-oct-2026): ¿hay algo que buscar? Pregunta al núcleo (GET /api/777/estado, con el secreto). Apagado o sin cola,
// la vuelta se acaba aquí en segundos, sin bajar caché ni código: la que corre cada media hora por si acaso no gasta nada. (La comprobación de
// octubre, control/preflight.mjs, es compartida con el 999 y daba siempre «activo» al 777: ésta es sólo del 777.)
// Deja en GITHUB_OUTPUT: activo (true/false) y overture (la versión publicada de Overture, para la clave de su caché).
import fs from 'node:fs';
const BASE = (process.env.NUCLEO || 'https://negocios.automtizationninameu.es').replace(/\/$/, ''), S = process.env.SECRETO_999, SOLA = (process.env.SOLA || '').trim();
if (!S) throw new Error('Falta el secreto del 999');
const r = await fetch(BASE + '/api/777/estado', { headers: { authorization: 'Bearer ' + S }, signal: AbortSignal.timeout(30000) });
if (!r.ok) throw new Error('El núcleo no contesta al estado del 777: HTTP ' + r.status);
const e = await r.json();
const activo = Boolean(SOLA) || Boolean(e.encendido && e.hayQueBuscar);
let overture = 'sin-leer';
if (activo) { try { const tx = await (await fetch('https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/', { signal: AbortSignal.timeout(30000) })).text(); overture = [...tx.matchAll(/<Prefix>release\/([^<]+)\/<\/Prefix>/g)].map((m) => m[1]).sort().pop() || overture; } catch {} }
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'activo=' + activo + '\noverture=' + overture + '\n');
console.log(activo ? 'Hay que buscar' + (SOLA ? ' (sola: ' + SOLA + ')' : '') + ' · en cola ' + e.enCola : (e.encendido ? 'Encendido, sin nada que buscar' : 'Apagado') + ': no se instala ni se corre nada');
