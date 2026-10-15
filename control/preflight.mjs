import fs from 'node:fs';
const base='https://negocios.automtizationninameu.es',secret=process.env.SECRETO_999,kind=process.argv[2];if(!secret)throw new Error('Falta secreto de servicio');
const read=async p=>{const r=await fetch(base+p,{headers:{authorization:'Bearer '+secret},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error('No se puede comprobar pausa/trabajo: HTTP '+r.status);return r.json();};
const h=await read('/correo/salud');let active=false;
if(h.mantenimiento!==true){if(kind==='nota'){const p=await read('/999/nota/pendientes');active=p.mantenimiento!==true&&p.pendientes>0;}else if(kind==='evaluar'){const p=await read('/999/evaluar/estado');active=p.mantenimiento===false&&Array.isArray(p.cola)&&p.cola.length>0;}else if(kind==='capturas'){const p=await read('/999/capturas/pendientes');active=p.mantenimiento!==true&&Array.isArray(p.webs)&&p.webs.length>0;}else if(kind==='buscar')active=true;else throw new Error('Proceso desconocido');}
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'activo='+active+'\n');console.log(active?'Trabajo disponible':'Pausado o sin trabajo: no instalar ni ejecutar');
