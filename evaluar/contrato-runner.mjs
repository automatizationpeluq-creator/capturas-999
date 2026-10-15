export function validarConfirmacion(response,body,trabajo) {
 if(!response?.ok||body?.ok!==true||body.error||body.ignorado||body.id!==trabajo.id||body.version!==trabajo.version)throw new Error('La nube no confirmó la aceptación del resultado y su versión');
 return body;
}
export function validarPendientes(body){if(!body||!Array.isArray(body.cola)||typeof body.mantenimiento!=='boolean')throw new Error('Estado del evaluador sin contrato de pausa/cola');return !body.mantenimiento&&body.cola.length>0;}
