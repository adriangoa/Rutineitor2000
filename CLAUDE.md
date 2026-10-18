# Contexto para Claude

App personal de rutina de gimnasio de Adrián. PWA estática **sin dependencias ni framework**
(HTML + CSS + JS puro), publicada en GitHub Pages vía Actions. Interfaz y textos en español (México).
App en vivo: https://adriangoa.github.io/rutineitor2000/ (instalada en su Android).

## Cómo trabajar con Adrián
- Está **aprendiendo**: sigue los cambios archivo por archivo en VS Code. Responde en español.
- Antes de editar, explica en 2–3 líneas qué vas a cambiar y en qué archivos. Después, resume
  qué hace cada cambio y por qué (conceptos nuevos de JS/CSS/PWA en lenguaje simple, sin sermones).
- Cambios pequeños y enfocados: una mejora por commit, con mensaje en español.
- Mantén el proyecto sin dependencias ni paso de compilación (nada de npm/frameworks) salvo que él lo pida.
- `main` se publica solo en cada push. Prueba en local antes de hacer push (ver abajo) y pregunta
  antes de hacer push si él no lo pidió.

## Requisitos del usuario
- Se usa desde un celular **Android** (Chrome, app instalada) en el gimnasio. Debe funcionar
  sin internet y gastar el mínimo de datos.
- Solo quiere **marcar series hechas**, no registrar peso.
- Va de lunes a viernes, 60–90 min. Lunes y jueves terminan con cardio (elíptica o escaladora).
  El viernes es el **único** día de pierna; de lunes a jueves no hay ejercicios de pierna.
- Los ejercicios deben salir de **su inventario**: `referencia/inventario.json` (61 ejercicios, copia
  del Excel original "Rutina_Personalizada_y_Inventario_Gimnasio.xlsx"). No inventes ejercicios fuera de ahí.

## Lógica de la rutina (v1)
Lun Pecho+Tríceps · Mar Espalda+Bíceps+Lumbar · Mié Hombro+Trapecio+Abdomen ·
Jue Torso B (pecho/espalda con otras variantes, superseries) + brazos · Vie Pierna completa.
Pecho cada 72–96 h, espalda/bíceps cada 48 h, hombro con 48 h tras el empuje del lunes.
Al proponer cambios de ejercicios, respeta estos tiempos de recuperación y el límite de 60–90 min
(~2.5 min por serie, cardio 15–20 min).

## Archivos
| Archivo | Qué es |
|---|---|
| `data/routine.json` | La rutina (fuente de verdad). Subir `version` al cambiarla. |
| `index.html`, `styles.css`, `app.js` | Interfaz. Todo el JS en `app.js`, organizado por secciones comentadas. |
| `sw.js` | Service worker (modo sin internet). |
| `scripts/build.mjs` | Arma `_site/` para publicar: calcula versión por hash y lista de precache. |
| `.github/workflows/pages.yml` | Publica `_site/` en Pages en cada push a `main`. |
| `images/<Id>/0.webp, 1.webp` | Imágenes que **sí** se publican (solo las de la rutina actual). |
| `referencia/inventario.json` | Inventario completo + imagen sugerida (`img`) y alternativas por ejercicio. |
| `referencia/imagenes/<Id>/` | Imágenes ya convertidas del resto del inventario. **No se publican.** |

## Cambiar o agregar un ejercicio
1. Elige el ejercicio en `referencia/inventario.json` (campo `inv`).
2. Usa su `img` (o una de `img_alternativas`). Si la carpeta no existe en `images/`, **muévela**
   desde `referencia/imagenes/` a `images/` (git mv). Si quitas un ejercicio de la rutina, regresa su
   carpeta a `referencia/imagenes/` para no publicar imágenes que nadie usa.
3. Edita `data/routine.json` (campos documentados en README.md) y sube `version`.
4. No cambies el `id` de un ejercicio existente: el registro del usuario está guardado por `id`.
Si hace falta una imagen que no esté en ningún lado: búscala en
https://github.com/yuhonas/free-exercise-db (`exercises/<Id>/0.jpg` y `1.jpg`, dominio público) y
conviértela a WebP, máximo 480 px de lado, calidad ~68.

## Arquitectura (detalles)
- Registro en `localStorage` (`r2k.log.v1`): `{ "YYYY-MM-DD": { "<exerciseId>": [1,0,1,...] } }`.
  La fecha es la del día de la semana mostrado (sábado/domingo muestran la semana siguiente).
  Si cambias este formato, migra los datos existentes; el usuario no debe perder su historial.
- `sw.js`: en local `VERSION='dev'` → red primero (ves cambios al recargar). Publicado → caché primero.
  El build inyecta `VERSION` (hash del contenido) y `ASSETS`. Al detectar versión nueva, la app
  muestra un toast "Toca para actualizar" (mensaje `skipWaiting`). En la primera visita no recarga.
- `BUILD` en `app.js` también lo reemplaza el build (se ve en ⋮ Opciones).
- Rutas siempre relativas (el sitio vive en `/rutineitor2000/`, no en la raíz).
- Fuentes del sistema (`sans-serif-condensed` en Android) para no descargar fuentes. Única excepción:
  `fonts/PressStart2P-latin.woff2` (12.5 KB, OFL, licencia en `fonts/OFL.txt`) solo para el tema Game Boy;
  el navegador la usa solo con ese tema y el build la precachea (los `.md`/`.txt` no se precachean).
- Temas: sin atributo = automático (oscuro, o claro con `prefers-color-scheme`); `data-theme="hc"` alto
  contraste, `data-theme="synth"` synthwave y `data-theme="gb"` Game Boy (pantalla verde, carcasa morada
  "Grape" del Game Boy Color, fuente pixelada) en `<html>`. Colores en variables de `:root`. Se guarda en
  `r2k.theme` y un script en línea en `index.html` lo aplica antes de pintar (sin parpadeo).
- Efectos de sonido (`sfx()` en `app.js`): onda cuadrada con Web Audio, sin archivos; melodías
  originales. Encendidos por omisión, interruptor en Opciones (`r2k.sfx` = "0" apagado). Comparten el
  `AudioContext` del descanso; `sfxBusyUntil` evita dormir el audio a media fanfarria.
- Logros (`celebrate()`): popover al completar un ejercicio y celebración con confeti al completar el día.
  Frases y emojis en `data/logros.json` (al azar sin repetir la anterior). Con el modal abierto el
  popover se mueve dentro del `<dialog>`; si no, el modal lo vuelve inerte y tocarlo cerraría el modal.
- Descanso: al marcar una serie arranca un temporizador con el `rest` del ejercicio (90 s por omisión).
  En superserie solo arranca tras el último del grupo; antes muestra "Ahora: <siguiente>". Se guarda la
  hora de término en `r2k.rest.v1` (sobrevive a que Android congele la página). El aviso es un tono corto
  de Web Audio programado desde el inicio (suena con pantalla apagada y se mezcla con la música; confirmado en su Android) + vibración.

## Probar
- Rápido: `python3 -m http.server 8000` en la raíz y abrir http://localhost:8000
- Como en producción: `node scripts/build.mjs` y servir `_site/`.
- En el celular sin publicar: Chrome DevTools → modo dispositivo (Ctrl+Shift+M), y en
  Application → Service Workers marcar "Offline" para probar sin internet.

## Ideas pendientes
- Logros con emojis animados: Noto Animated Emoji de Google (CC BY 4.0, dar crédito), WebP/GIF sin fondo.
  ~10–15 pesan 0.5–1 MB; precachear solo los que se usen. Hoy son emojis del sistema + CSS.
- Rutina A/B alternando semanas: mismos días y grupos; la semana B usa otras variantes del inventario.
  Ya acordado con Adrián hacerla en una segunda tanda, proponiéndole la semana B antes de meterla.
