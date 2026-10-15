// El juez de la nota del 999 con Ollama (15-oct-2026). Pide a la nube las webs publicadas que esperan nota (/999/nota/pendientes), lee su
// expediente (web + ficha), pide al modelo una nota de 0 a 10 con sus motivos y la devuelve por /999/revision (maestro.partial_score).
// No rehace ni descarta nada: sólo la nota. La regla la aplica la nube (8,3 o más → por enviar; menos → para Manuel con los motivos).
const BASE = 'https://negocios.automtizationninameu.es', S = process.env.SECRETO_999, MODELO = process.env.MODELO || 'qwen2.5:3b-instruct';
if (!S) { console.error('falta SECRETO_999'); process.exit(2); }
const cab = { authorization: 'Bearer ' + S, 'user-agent': 'nota-999' };
const t0 = Date.now(), MAX = (Number(process.env.MAX_MIN) || 50) * 60000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function nube(url, o = {}) { for (let i = 1; i <= 3; i++) { try { const r = await fetch(BASE + url, Object.assign({}, o, { headers: Object.assign({}, cab, o.headers || {}), signal: AbortSignal.timeout(120000) })); if (r.status < 500) return r; log('nube', r.status, 'reintento'); } catch (e) { log('nube no contesta', e.message); } await new Promise((r) => setTimeout(r, 15000)); } return null; }
const CRITERIO = `Eres el revisor de calidad de una agencia que hace webs de muestra para pequeños negocios de España y se las envía para venderles la web.
Pon una NOTA de 0 a 10 a la web, con decimales, pensando en si el dueño del negocio la recibiría y diría «esta es mi web, la quiero». Mira:
1. Verdad: todo lo que dice la web sale de la ficha (nombre, dirección, teléfono, horario, servicios, precios). Un dato inventado o equivocado baja mucho la nota.
2. Que sea SU web: habla de su negocio concreto (su barrio, sus servicios, sus fotos, sus reseñas), no un texto genérico que valdría para cualquiera.
3. Claridad: se entiende en 5 segundos qué es, dónde está y cómo pedir/llamar; botones de llamar o WhatsApp correctos.
4. Español correcto, sin faltas, sin notas de trabajo, sin «lorem ipsum», sin frases raras ni repetidas.
5. Profesional y atractiva para el cliente final; nada exagerado ni falso.
Escala: 9-10 se puede enviar ya y es excelente; 8,3-8,9 buena, se puede enviar; 6-8,2 tiene fallos que hay que arreglar; menos de 6 mal.
Responde SOLO con JSON: {"nota": número, "motivos": ["frase corta", ...], "fallos": ["fallo concreto a corregir", ...]}`;
async function juzgar(x) {
  const texto = ['NEGOCIO: ' + (x.nombre || '') + ' · ' + (x.oficio || '') + ' · ' + (x.ciudad || ''), '', 'FICHA (lo que se sabe del negocio):', String((x.ficha && x.ficha.informe) || '').slice(0, 4500), '', 'TEXTO DE LA WEB:', String(x.web || '').slice(0, 4500)].join('\n');
  const r = await fetch('http://localhost:11434/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(900000),
    body: JSON.stringify({ model: MODELO, stream: false, format: 'json', options: { temperature: 0.1, num_ctx: 4096 }, messages: [{ role: 'system', content: CRITERIO }, { role: 'user', content: texto }] }) });
  const d = await r.json(); const j = JSON.parse(d.message && d.message.content || '{}');
  const nota = Math.max(0, Math.min(10, Math.round(Number(j.nota) * 10) / 10));
  if (!Number.isFinite(nota)) throw new Error('el modelo no dio nota');
  return { nota, motivos: (j.motivos || []).map(String).slice(0, 8), fallos: (j.fallos || []).map(String).slice(0, 12) };
}
let hechas = 0, errores = 0;
const r0 = await nube('/999/nota/pendientes'); if (!r0 || !r0.ok) { log('no se pudo leer la lista', r0 && r0.status); process.exit(0); }
const { webs = [], pendientes = 0 } = await r0.json(); log('webs esperando nota:', pendientes);
for (const w of webs) {
  if (Date.now() - t0 > MAX) { log('tiempo agotado'); break; }
  try {
    const re = await nube('/999/revision/expediente?id=' + encodeURIComponent(w.id)); if (!re || !re.ok) { errores++; continue; }
    const x = await re.json(); const t = Date.now(); const v = await juzgar(x);
    const notas = 'Ollama ' + MODELO + ' · nota ' + v.nota + '\nMotivos: ' + v.motivos.join(' · ') + (v.fallos.length ? '\nA corregir: ' + v.fallos.join(' · ') : '');
    const rr = await nube('/999/revision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: w.id, version: x.version, pasa: true, fallos: [], notas, criterio: 'ollama ' + MODELO, maestro: { partial_score: v.nota, status: 'ollama', resolved_percent: 100 } }) });
    const res = rr ? await rr.json().catch(() => ({})) : {}; if (res.error) { errores++; log(w.id, 'la nube no la aceptó:', res.error); continue; }
    hechas++; log(w.id, 'nota', v.nota, '·', Math.round((Date.now() - t) / 1000) + ' s');
  } catch (e) { errores++; log(w.id, 'error', String(e.message || e).slice(0, 150)); }
}
log('hechas', hechas, 'errores', errores);
