// Revisión textual de Ollama: texto y enlaces contrastados con la ficha.
// Guarda hallazgos y uso; no sustituye al criterio maestro ni aprueba una web.
const BASE = 'https://negocios.automtizationninameu.es', S = process.env.SECRETO_999, MODELO = process.env.MODELO || 'qwen2.5:3b-instruct';
if (!S) { console.error('falta SECRETO_999'); process.exit(2); }
const cab = { authorization: 'Bearer ' + S, 'user-agent': 'nota-999' };
const t0 = Date.now(), MAX = (Number(process.env.MAX_MIN) || 50) * 60000;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function nube(url, o = {}) { for (let i = 1; i <= 3; i++) { try { const r = await fetch(BASE + url, Object.assign({}, o, { headers: Object.assign({}, cab, o.headers || {}), signal: AbortSignal.timeout(120000) })); if (r.status < 500) return r; log('nube', r.status, 'reintento'); } catch (e) { log('nube no contesta', e.message); } await new Promise((r) => setTimeout(r, 15000)); } return null; }
const CRITERIO = `Eres el revisor de calidad de una agencia que hace webs de muestra para pequeños negocios de España y se las envía para venderles la web.
Solo has visto texto y enlaces: no has visto capturas, imágenes ni interacción. Tu resultado es parcial y no autoriza enviar una web.
Pon una NOTA TEXTUAL orientativa de 0 a 10 a la web, con decimales, pensando en si el dueño del negocio la recibiría y diría «esta es mi web, la quiero». Mira:
1. Verdad: todo lo que dice la web sale de la ficha (nombre, dirección, teléfono, horario, servicios, precios). Un dato inventado o equivocado baja mucho la nota.
2. Que sea SU web: habla de su negocio concreto (su barrio, sus servicios, sus fotos, sus reseñas), no un texto genérico que valdría para cualquiera.
3. Claridad: se entiende en 5 segundos qué es, dónde está y cómo pedir/llamar; botones de llamar o WhatsApp correctos.
4. Español correcto, sin faltas, sin notas de trabajo, sin «lorem ipsum», sin frases raras ni repetidas.
5. Profesional y atractiva para el cliente final; nada exagerado ni falso.
Escala textual: 9-10 excelente; 8,3-8,9 buena; 6-8,2 tiene fallos que hay que arreglar; menos de 6 mal.
Responde SOLO con JSON: {"nota": número, "motivos": ["frase corta", ...], "fallos": ["fallo concreto a corregir", ...]}`;
function textoExpediente(x) {
  const ficha = x?.ficha?.informe;
  const web = typeof x?.web === 'string' ? x.web : x?.web?.texto;
  if (typeof ficha !== 'string' || !ficha.trim()) throw new Error('expediente sin texto de ficha');
  if (typeof web !== 'string' || !web.trim()) throw new Error('expediente sin texto de web');
  const enlaces = Array.isArray(x.web?.enlaces) ? JSON.stringify(x.web.enlaces).slice(0, 1000) : '';
  return ['NEGOCIO: ' + (x.nombre || '') + ' · ' + (x.oficio || '') + ' · ' + (x.ciudad || ''), '',
    'FICHA (lo que se sabe del negocio):', ficha.slice(0, 4500), '',
    'TEXTO DE LA WEB (revisión textual parcial):', web.slice(0, enlaces ? 3500 : 4500),
    enlaces ? 'ENLACES DE LA WEB: ' + enlaces : ''].join('\n');
}
function listaTextos(valor, nombre, max) {
  if (!Array.isArray(valor) || valor.some((s) => typeof s !== 'string' || !s.trim())) throw new Error('el modelo no dio ' + nombre + ' válidos');
  return valor.slice(0, max).map((s) => s.trim().slice(0, 300));
}
async function juzgar(x) {
  const texto = textoExpediente(x);
  const r = await fetch('http://localhost:11434/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(900000),
    body: JSON.stringify({ model: MODELO, stream: false, format: 'json', options: { temperature: 0.1, num_ctx: 4096 }, messages: [{ role: 'system', content: CRITERIO }, { role: 'user', content: texto }] }) });
  if (!r.ok) throw new Error('Ollama respondió HTTP ' + r.status);
  const d = await r.json();
  if (d.error || d.done !== true || typeof d.message?.content !== 'string') throw new Error('Ollama no terminó una respuesta válida');
  const j = JSON.parse(d.message.content);
  if (typeof j.nota !== 'number' || !Number.isFinite(j.nota) || j.nota < 0 || j.nota > 10) throw new Error('el modelo no dio nota válida entre 0 y 10');
  const motivos = listaTextos(j.motivos, 'motivos', 8), fallos = listaTextos(j.fallos, 'fallos', 12);
  if (!motivos.length) throw new Error('el modelo no justificó la nota');
  const uso = { modelo: d.model || MODELO, caracteres_entrada: texto.length };
  for (const k of ['total_duration', 'load_duration', 'prompt_eval_count', 'prompt_eval_duration', 'eval_count', 'eval_duration']) {
    if (typeof d[k] === 'number' && Number.isFinite(d[k]) && d[k] >= 0) uso[k] = d[k];
  }
  log('uso_ollama', JSON.stringify(uso)); // Duraciones de Ollama en ns; no equivale a una factura.
  return { nota: Math.round(j.nota * 10) / 10, motivos, fallos, uso };
}
let hechas = 0, errores = 0;
const r0 = await nube('/999/nota/pendientes'); if (!r0 || !r0.ok) { log('no se pudo leer la lista', r0 && r0.status); process.exit(1); }
const { webs, pendientes } = await r0.json();
if (!Array.isArray(webs) || !Number.isInteger(pendientes) || pendientes < 0) throw new Error('lista de pendientes inválida');
log('webs esperando nota:', pendientes);
for (const w of webs) {
  if (Date.now() - t0 > MAX) { log('tiempo agotado'); break; }
  try {
    const re = await nube('/999/revision/expediente?id=' + encodeURIComponent(w.id)); if (!re || !re.ok) { errores++; continue; }
    const x = await re.json();
    if (x.id !== w.id || !Number.isFinite(x.version) || x.version <= 0 || x.version !== w.version) throw new Error('el expediente cambió de versión o no coincide con la ficha pendiente');
    const t = Date.now(); const v = await juzgar(x);
    const notas = 'Ollama ' + MODELO + ' · nota ' + v.nota + '\nMotivos: ' + v.motivos.join(' · ') + (v.fallos.length ? '\nA corregir: ' + v.fallos.join(' · ') : '');
    const rr = await nube('/999/revision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: w.id, version: x.version, alcance: 'texto', fallos: v.fallos, notas, criterio: 'ollama ' + MODELO, texto: { nota: v.nota, modelo: MODELO, uso: v.uso } }) });
    if (!rr || !rr.ok) throw new Error('la nube no aceptó la revisión: ' + (rr ? 'HTTP ' + rr.status : 'sin respuesta'));
    const res = await rr.json(); if (!res || res.ok !== true || res.error) { errores++; log(w.id, 'la nube no la aceptó:', res?.error || 'respuesta sin confirmación'); continue; }
    hechas++; log(w.id, 'nota', v.nota, '·', Math.round((Date.now() - t) / 1000) + ' s');
  } catch (e) { errores++; log(w.id, 'error', String(e.message || e).slice(0, 150)); }
}
log('hechas', hechas, 'errores', errores, 'duracion_ms', Date.now() - t0);
if (errores) process.exitCode = 1;
