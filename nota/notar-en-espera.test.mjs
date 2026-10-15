import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('./notar-en-espera.mjs', import.meta.url), 'utf8');
const fixture = () => ({
  id: 'negocio-prueba', version: 7, nombre: 'Negocio de prueba', oficio: 'Taller', ciudad: 'Ciudad',
  ficha: { informe: 'Taller de bicicletas. Solo reparaciones con cita.' },
  web: { texto: 'Reparamos bicicletas con cita. No vendemos bicicletas.',
    enlaces: [{ href: 'tel:+34900000000', texto: 'Llamar' }] }
});
async function run(options = {}) {
  const calls = [], logs = [];
  const proc = { env: { SECRETO_999: 'credencial-sintetica', MAX_MIN: '1' },
    exit(code) { throw Object.assign(new Error('salida'), { exitCode: code }); } };
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/999/nota/pendientes')) {
      if (options.listStatus) return response({ error: 'lista no disponible' }, options.listStatus);
      return response({ webs: [{ id: 'negocio-prueba', version: 7 }], pendientes: 1 });
    }
    if (url.includes('/999/revision/expediente?')) return response(options.expediente ?? fixture());
    if (url === 'http://localhost:11434/api/chat') {
      if (options.modelStatus) return response({ error: 'modelo no disponible' }, options.modelStatus);
      return response({ model: 'qwen2.5:3b-instruct', done: options.done ?? true,
        message: { content: JSON.stringify(options.verdict ?? { nota: 8.6, motivos: ['Texto coherente'], fallos: [] }) },
        prompt_eval_count: 120, eval_count: 30, total_duration: 1200000000 });
    }
    if (url.endsWith('/999/revision')) {
      if (options.postThrows) throw new Error('conexión interrumpida');
      if (options.postText) return new Response('respuesta incompleta', { status: 200 });
      return response(options.postBody ?? { ok: true }, options.postStatus ?? 200);
    }
    throw new Error('La prueba no permite acceder a otra URL');
  };
  const context = { process: proc, fetch, Response, AbortSignal, setTimeout: (f) => f(),
    console: { log: (...a) => logs.push(a), error: (...a) => logs.push(a) } };
  let fatal = null;
  try { await new vm.Script('(async () => {\n' + source + '\n})()', { filename: 'notar-en-espera.mjs' }).runInNewContext(context); }
  catch (e) { fatal = e; }
  return { calls, logs, code: fatal?.exitCode ?? (fatal ? 1 : proc.exitCode ?? 0),
    writes: calls.filter(c => c.url.endsWith('/999/revision')).map(c => JSON.parse(c.init.body)),
    prompts: calls.filter(c => c.url === 'http://localhost:11434/api/chat').map(c => JSON.parse(c.init.body).messages[1].content) };
}
test('el modelo recibe el texto y el destino de los enlaces del expediente real', async () => {
  const r = await run();
  assert.equal(r.code, 0);
  assert.match(r.prompts[0], /Reparamos bicicletas con cita/);
  assert.match(r.prompts[0], /tel:\+34900000000/);
  assert.doesNotMatch(r.prompts[0], /\[object Object\]/);
  assert.equal(r.writes.length, 1);
  assert.ok(r.logs.some(row => row[1] === 'uso_ollama' && JSON.parse(row[2]).eval_count === 30));
});
test('conserva los fallos y no anuncia cobertura completa de la rúbrica', async () => {
  const r = await run({ verdict: { nota: 8.6, motivos: ['Revisión parcial'], fallos: ['Teléfono contradictorio'] } });
  assert.equal(r.writes[0].alcance, 'texto');
  assert.equal(r.writes[0].pasa, undefined);
  assert.deepEqual(r.writes[0].fallos, ['Teléfono contradictorio']);
  assert.equal(r.writes[0].maestro, undefined);
  assert.equal(r.writes[0].texto.nota, 8.6);
  assert.equal(r.writes[0].texto.uso.eval_count, 30);
});
test('acepta también el formato antiguo de web como texto', async () => {
  const x = fixture(); x.web = 'Texto de la web anterior';
  const r = await run({ expediente: x });
  assert.equal(r.code, 0); assert.match(r.prompts[0], /Texto de la web anterior/);
});
test('sin ficha o sin web no pide ni publica una nota', async () => {
  for (const field of ['web', 'ficha']) {
    const x = fixture(); x[field] = {};
    const r = await run({ expediente: x });
    assert.equal(r.code, 1); assert.equal(r.prompts.length, 0); assert.equal(r.writes.length, 0);
  }
});
test('un expediente de otra versión no se evalúa ni se publica', async () => {
  const x = fixture(); x.version = 8;
  const r = await run({ expediente: x });
  assert.equal(r.code, 1); assert.equal(r.prompts.length, 0); assert.equal(r.writes.length, 0);
});
test('rechaza notas inválidas en vez de convertirlas en cero o recortarlas', async () => {
  for (const nota of [null, '', '8.5', true, -1, 11]) {
    const r = await run({ verdict: { nota, motivos: ['Motivo'], fallos: [] } });
    assert.equal(r.code, 1); assert.equal(r.writes.length, 0);
  }
});
test('rechaza respuestas incompletas y listas inválidas', async () => {
  for (const options of [
    { done: false },
    { verdict: { nota: 8, motivos: 'texto', fallos: [] } },
    { verdict: { nota: 8, motivos: [], fallos: [] } },
    { verdict: { nota: 8, motivos: ['Motivo'], fallos: 'fallo' } }
  ]) {
    const r = await run(options); assert.equal(r.code, 1); assert.equal(r.writes.length, 0);
  }
});
test('un error de Ollama no produce una revisión', async () => {
  const r = await run({ modelStatus: 500 });
  assert.equal(r.code, 1); assert.equal(r.writes.length, 0);
});
test('un fallo al leer pendientes hace fallar la ejecución', async () => {
  const r = await run({ listStatus: 401 });
  assert.equal(r.code, 1); assert.equal(r.prompts.length, 0);
});
test('solo cuenta como hecha una revisión confirmada por la nube', async () => {
  for (const options of [
    { postStatus: 401 }, { postStatus: 503 }, { postThrows: true },
    { postText: true }, { postBody: {} }, { postBody: { ok: false } },
    { postBody: { error: 'versión distinta' } }
  ]) {
    const r = await run(options);
    assert.equal(r.code, 1);
    const summary = r.logs.find(row => row[1] === 'hechas');
    assert.equal(summary[2], 0); assert.equal(summary[4], 1);
  }
});
