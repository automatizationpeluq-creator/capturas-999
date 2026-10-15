// Una inferencia real, expediente sintético y emisor falso: ninguna llamada de escritura a la nube.
import fs from 'node:fs';import vm from 'node:vm';
const fixture={id:'caso-sintetico-999',version:1,nombre:'Taller de prueba',oficio:'Reparación de bicicletas',ciudad:'Ciudad',ficha:{informe:'Taller de prueba. Repara bicicletas con cita en Calle de Prueba 1, Ciudad. Teléfono 900000000. No vende bicicletas.'},web:{texto:'Taller de prueba. Reparamos bicicletas con cita. Estamos en Calle de Prueba 1, Ciudad. No vendemos bicicletas.',enlaces:['tel:+34900000000']}};
const source=fs.readFileSync(new URL('./notar-en-espera.mjs',import.meta.url),'utf8'),originalFetch=fetch;let sent=null,models=0;
const response=x=>new Response(JSON.stringify(x));
const fakeFetch=async(url,opts={})=>{url=String(url);if(url==='http://localhost:11434/api/chat'){models++;return originalFetch(url,opts);}if(url.endsWith('/999/nota/pendientes'))return response({pendientes:1,webs:[{id:fixture.id,version:1}]});if(url.includes('/999/revision/expediente?'))return response(fixture);if(url.endsWith('/999/revision')){sent=JSON.parse(opts.body);return response({ok:true,alcance:'texto',ficha:{id:fixture.id,hecha:1,revisionTextoV:1,notaTexto:sent.texto.nota}});}throw new Error('Red externa de negocio no permitida en el ensayo');};
const proc={env:{SECRETO_999:'credencial-sintetica-no-utilizable',MODELO:process.env.MODELO||'qwen2.5:3b-instruct',MAX_MIN:'10'},exit(c){throw new Error('Cliente finalizado con código '+c)}};
await new vm.Script('(async()=>{'+source+'})()').runInNewContext({process:proc,fetch:fakeFetch,Response,AbortSignal,setTimeout,console});
if(models!==1||!sent||sent.alcance!=='texto'||typeof sent.texto.nota!=='number')throw new Error('El cliente no produjo una única revisión textual válida');
const result={schema:'prueba-ollama-real-999-1',modelo:sent.texto.modelo,nota_sintetica:sent.texto.nota,uso:sent.texto.uso,inferencias:models,escrituras_nube:0,mensajes:0,caso:'sintético; no prueba calidad del criterio maestro'};
fs.writeFileSync('DIAGNOSTICO-OLLAMA.json',JSON.stringify(result,null,2));console.log('::notice title=Inferencia Ollama real::'+JSON.stringify(result));
