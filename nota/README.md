# Revisión textual del 999

Ollama compara el texto y los enlaces de una web con su ficha. Es una revisión textual parcial: guarda hallazgos, nota orientativa, modelo, tokens y tiempos. No certifica las 203 dimensiones ni sustituye al criterio maestro o a la aprobación manual.

La nube guarda estos resultados en `revisionTexto`, separados de `revisionIA` y `notaMaestro`. Una revisión textual terminada no se repite para la misma versión. Los fallos de lectura, modelo o guardado hacen fallar la ejecución; no cuentan como revisiones terminadas.

El flujo comprueba si hay trabajo antes de instalar o descargar Ollama. Los tiempos se registran en nanosegundos según la API de Ollama; los contadores no son una factura.

Pruebas sin red: `node --test nota/notar-en-espera.test.mjs`.
