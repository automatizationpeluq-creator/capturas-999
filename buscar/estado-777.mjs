// Lo que dice lista.js de una localidad, en lo que se devuelve al núcleo (fase 5, 19-oct-2026). Aparte para poder probarlo sin correr nada.
//   0 hecha · 3 SIGUE (ciudad grande: quedan búsquedas por zona) · 2 PARADO (Google limita: espera; otra cosa: no pasa) · cortado por tiempo: sigue si
//   guardó lo consultado (maps.json), si no, no pasa · lo demás, no pasa con su motivo.
export function estadoDe(rl, hayMaps, limiteSegundos = 9000) {
  if (rl.cortado) return hayMaps ? { estado: 'sigue', motivo: 'se acabó su tiempo (' + Math.round(limiteSegundos / 60) + ' min); lo consultado está guardado y continúa en la vuelta siguiente' } : { estado: 'no-pasa', motivo: 'se acabó su tiempo sin guardar nada' };
  if (rl.code === 0) return { estado: 'hecha', motivo: '' };
  if (rl.code === 3) return { estado: 'sigue', motivo: (rl.out.match(/SIGUE:[^\n]*/) || ['sigue'])[0] };
  if (rl.code === 2 && /errores seguidos|plantilla|limitando/i.test(rl.out)) return { estado: 'espera', motivo: (rl.out.match(/PARADO:[^\n]*/) || ['Google limitando'])[0] };
  return { estado: 'no-pasa', motivo: (rl.out.match(/(NO SE DA POR HECHA|PARADO|ERROR):[^\n]*/) || ['lista.js salió con ' + rl.code])[0] };
}
