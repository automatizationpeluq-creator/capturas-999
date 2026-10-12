// Expedientes cifrados: el repositorio del runner es público. Nunca subir texto privado en claro.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createCipheriv,createDecipheriv,hkdfSync,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const MAGIC=Buffer.from('999EVID1');
function key(secret,salt){if(typeof secret!=='string'||secret.length<16)throw Error('La clave debe tener al menos 16 caracteres');return hkdfSync('sha256',Buffer.from(secret,'utf8'),salt,Buffer.from('999-evidence-archive-v1'),32);}
export function encrypt(bytes,secret){const salt=randomBytes(32),iv=randomBytes(12);const c=createCipheriv('aes-256-gcm',key(secret,salt),iv);c.setAAD(MAGIC);const ciphertext=Buffer.concat([c.update(bytes),c.final()]);return Buffer.concat([MAGIC,salt,iv,c.getAuthTag(),ciphertext]);}
export function decrypt(bytes,secret){if(bytes.length<68||!bytes.subarray(0,8).equals(MAGIC))throw Error('Formato de archivo no válido');const d=createDecipheriv('aes-256-gcm',key(secret,bytes.subarray(8,40)),bytes.subarray(40,52));d.setAAD(MAGIC);d.setAuthTag(bytes.subarray(52,68));return Buffer.concat([d.update(bytes.subarray(68)),d.final()]);}
export function archive(salida,job,secret,out){
 fs.mkdirSync(out,{recursive:true});
 const name=createHash('sha256').update(String(job.id)+'\0'+String(job.version)).digest('hex')+'-'+randomBytes(4).toString('hex')+'.zip.enc';
 const temp=path.join(out,name+'.plain');
 const py=`from pathlib import Path\nfrom zipfile import ZipFile,ZIP_DEFLATED\nimport sys\nr=Path(sys.argv[1]).resolve()\nkeep=['evidencias-completas','maestro','capacidades','RESULTADO-EVALUACION.json','RESULTADO-UNIFICADO.json','ESTADO-FUNCIONAL-203.json','INVENTARIO-EVIDENCIAS.json','INFORME-UNIFICADO.html','REGISTRO-SUBPROCESOS.json','LECTURA-888.json']\nwith ZipFile(sys.argv[2],'w',ZIP_DEFLATED,compresslevel=6) as z:\n for name in keep:\n  p=r/name\n  paths=sorted(p.rglob('*')) if p.is_dir() else [p]\n  for f in paths:\n   if f.is_file() and not f.is_symlink() and f.resolve().is_relative_to(r):z.write(f,f.relative_to(r).as_posix())\n`;
 const r=spawnSync(process.env.PYTHON_BIN||'python3',['-c',py,salida,temp],{encoding:'utf8'});
 if(r.status!==0)throw Error('No se pudo conservar el expediente: '+String(r.stderr||r.error).slice(-700));
 try{const bytes=encrypt(fs.readFileSync(temp),secret);const target=path.join(out,name);fs.writeFileSync(target,bytes,{flag:'wx'});return {file:name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,encrypted:true,format:'999EVID1',run_id:process.env.GITHUB_RUN_ID||null,repository:process.env.GITHUB_REPOSITORY||null,retention_days:7,requires_original_secret:true};}
 finally{fs.rmSync(temp,{force:true});}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const [op,input,output]=process.argv.slice(2);
 if(op!=='descifrar'||!input||!output||!process.env.SECRETO_999)throw Error('Uso: SECRETO_999 en entorno; node archivo-evidencias.mjs descifrar entrada.zip.enc salida.zip');
 fs.writeFileSync(output,decrypt(fs.readFileSync(input),process.env.SECRETO_999),{flag:'wx'});
}
