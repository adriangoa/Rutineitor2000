# Contexto para Claude

App personal de rutina de gimnasio de Adrián. PWA estática **sin dependencias ni framework**
(HTML + CSS + JS puro), publicada en GitHub Pages vía Actions. Interfaz y textos en español (México).
App en vivo: https://adriangoa.github.io/Rutineitor2000/ (instalada en su Android).

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

## Lógica de la rutina (v3, semanas A/B)
Lun Pecho+Tríceps · Mar Espalda+Bíceps+Lumbar · Mié Hombro+Trapecio+Abdomen ·
Jue Torso B (pecho/espalda con otras variantes, superseries) + brazos · Vie Pierna completa.
Pecho cada 72–96 h, espalda/bíceps cada 48 h, hombro con 48 h tras el empuje del lunes.
Semanas A y B alternadas desde el lunes 2026-10-19 (A): mismos días y grupos, la B con otras variantes
del inventario (barra vs mancuerna, polea vs máquina, otro agarre). Adrián aún no confirma en el gym
que todos los de la B se puedan hacer como están descritos.
Al proponer cambios de ejercicios, respeta estos tiempos de recuperación y el límite de 60–90 min
(~2.5 min por serie, cardio 15–20 min).

## Archivos
| Archivo | Qué es |
|---|---|
| `data/routine.json` | La rutina (fuente de verdad): `exercises` = semana A, `exercisesB` = semana B. Subir `version`. |
| `index.html`, `styles.css`, `app.js` | Interfaz. Todo el JS en `app.js`, organizado por secciones comentadas. |
| `sw.js` | Service worker (modo sin internet). |
| `scripts/build.mjs` | Arma `_site/` para publicar: calcula versión por hash y lista de precache. |
| `.github/workflows/pages.yml` | Publica `_site/` en Pages en cada push a `main`. |
| `data/logros.json` | Frases, títulos y emojis de los logros (normales y por temporada) + lista `animados`. |
| `data/generador.json` | Huecos por día para "Generar nueva rutina" (ids de routine.json). |
| `images/<Id>/0.webp, 1.webp` | Imágenes de ejercicios que se publican. **Nunca se quitan** (rutinas generadas). |
| `images/emoji/<código>.webp` | Emojis animados de Noto (CC BY 4.0), 160 px. |
| `fonts/` | Press Start 2P (tema Game Boy) y Creepster (Halloween), con sus licencias OFL. |
| `referencia/inventario.json` | Inventario completo + imagen sugerida (`img`) y alternativas por ejercicio. |
| `referencia/imagenes/<Id>/` | Imágenes ya convertidas del resto del inventario. **No se publican.** |

## Cambiar o agregar un ejercicio
1. Elige el ejercicio en `referencia/inventario.json` (campo `inv`).
2. Usa su `img` (o una de `img_alternativas`). Si la carpeta no existe en `images/`, **muévela**
   desde `referencia/imagenes/` a `images/` (git mv). **Nunca quites carpetas de `images/`**, aunque
   quites el ejercicio de la rutina: las rutinas generadas en otros cels pueden seguir usándolas (~15 KB c/u).
3. Edita `data/routine.json` (campos documentados en README.md) y **sube `version`**: con eso, quien tenga
   una rutina generada recibe el aviso "La rutina original se actualizó".
4. No cambies el `id` de un ejercicio existente: el registro del usuario está guardado por `id`.
5. Agrega el ejercicio nuevo a los huecos que le correspondan en `data/generador.json`, o el generador
   no lo usará. Si quitas uno de routine.json, quítalo también de ahí (el generador solo usa ids existentes).
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
  Al instalar pide cada archivo con `cache: 'reload'` (sin caché HTTP; GitHub Pages pide guardar 10 min y
  se mezclaban versiones: index.html nuevo con app.js viejo). El hash de versión incluye `sw.js`.
  Busca versión nueva al cargar y también al volver a primer plano (`reg.update()` en `visibilitychange`),
  porque Android reanuda la app desde recientes sin recargarla.
- `BUILD` en `app.js` también lo reemplaza el build (se ve en ⋮ Opciones).
- Rutas siempre relativas (el sitio vive en `/Rutineitor2000/`, con R mayúscula como el repo, no en la raíz).
- Fuentes del sistema (`sans-serif-condensed` en Android) para no descargar fuentes. Única excepción:
  `fonts/PressStart2P-latin.woff2` (12.5 KB, OFL, licencia en `fonts/OFL-PressStart2P.txt`) solo para el tema Game Boy;
  el navegador la usa solo con ese tema y el build la precachea (los `.md`/`.txt` no se precachean).
  Igual `fonts/Creepster-latin.woff2` (28 KB, OFL en `fonts/OFL-Creepster.txt`) para títulos del tema Halloween.
- Temas: `data-theme="aero"` Aero (Frutiger Aero: cielo, pasto, burbujas, vidrio y botones de gel, todo con
  degradados CSS; el predeterminado en meses sin temporada); sin atributo = Clásico (valor `auto`: oscuro con azul
  eléctrico, o claro con azul rey si el cel usa `prefers-color-scheme: light`); `data-theme="hc"` alto
  contraste, `data-theme="synth"` synthwave y `data-theme="gb"` Game Boy (pantalla verde, carcasa morada
  "Grape" del Game Boy Color, fuente pixelada) en `<html>`. Colores en variables de `:root`. Se guarda en
  `r2k.theme` y un script en línea en `index.html` lo aplica antes de pintar (sin parpadeo).
- Efectos de sonido (`sfx()` en `app.js`): onda cuadrada con Web Audio, sin archivos; melodías
  originales. Encendidos por omisión, interruptor en Opciones (`r2k.sfx` = "0" apagado). Comparten el
  `AudioContext` del descanso; `sfxBusyUntil` evita dormir el audio a media fanfarria.
- Logros (`celebrate()`): popover al completar un ejercicio y celebración con confeti al completar el día.
  Frases y emojis en `data/logros.json` (al azar sin repetir la anterior). Con el modal abierto el
  popover se mueve dentro del `<dialog>`; si no, el modal lo vuelve inerte y tocarlo cerraría el modal.
  Emojis animados: `images/emoji/<código>.webp` (Noto Emoji Animation, CC BY 4.0, crédito en Opciones y
  `images/CREDITOS.md`), reducidos a 160 px, 1 de cada 2 cuadros, calidad 50, `minimize_size`, `alpha_quality=40`
  (~40–110 KB c/u). Solo se usan los listados en `logros.json` → `animados`; los demás se ven como emoji normal.
  Para agregar uno: bajar `https://fonts.gstatic.com/s/e/notoemoji/latest/<código>/512.webp` y convertir igual.
- Notas por ejercicio (`r2k.notes.v1`): `{ id: { s: "ok"|"adapt"|"no", note, name, inv, fecha } }`. Botón 📝
  en el modal; puntito ámbar/rojo en la foto si es 🔧/❌. Van en el respaldo como `notas`: si Adrián pasa un
  respaldo, léelo y usa las notas para quitar o adaptar ejercicios (y a futuro proponer fuera del inventario).
- Saltar al siguiente (`jumpToNext()`): al completar un ejercicio desde la lista, destello en la tarjeta
  (`.just-done`), scroll suave al siguiente pendiente y entrada con barrido de luz + etiqueta "SIGUE ▶" (`.up-next`).
  Desde el modal no salta. Con `prefers-reduced-motion` salta sin animación.
- Duración (`r2k.times.v1`): `{ fecha: { a: ms 1.ª serie, b: ms última } }`, solo al marcar el día de hoy
  (`stampTime`). Se ve junto a la fecha ("⏱ 34 min"), en la celebración y en 📅. Va en el respaldo como `tiempos`.
- Rachas (`streakDays`/`streakWeeks`): días L–V seguidos con ≥ 80 % de series (`STREAK_PCT`); hoy no rompe
  la racha mientras no termine; semanas completas = los 5 días cumplidos. Se calculan del registro (no se guardan).
  En 📅 y en la celebración del día (desde 2 días; destacada en 3, 5, 10, 15…).
- Recordatorio de respaldo (`r2k.backup.v1` = { last, nag }): al abrir, si pasaron 28 días desde el último
  respaldo (o desde el primer registro), toast con botón para exportar; máximo uno al día y sin tapar el de
  actualización. ⋮ Opciones muestra la fecha del último respaldo.
- Temas de temporada (`SEASONS` en app.js: nombre, ícono, meses, color): botón "🎃 Temporada" en el selector
  → lista con "Automático por fecha" (`season-auto`, elige por mes; si no hay, Aero) y cada temporada.
  **Tema por omisión: `season-auto`** (si nunca eligió tema). El script del `<head>` usa `r2k.theme.auto` (tema
  resuelto la vez anterior) para no parpadear. Frases/emojis/títulos de
  temporada en `logros.json` → `temporadas.<id>` reemplazan a los normales. Confeti con `--confetti` del tema.
  Adrián pedirá uno nuevo cada mes: entrada en `SEASONS` + bloque CSS + (opcional) frases y emojis animados.
  Hecho: halloween (octubre, fuente Creepster, murciélagos, telarañas) y muertos (noviembre: papel picado y flor
  de cempasúchil como SVG dentro del CSS, pétalos cayendo, 💀 en la barra, sin fuente nueva). El botón "Temporada"
  muestra el ícono de la temporada del mes. Frases de Shamuco por temporada en `temporadas.<id>.shamuco`.
  Para probar una temporada: fecha falsa en ese mes (ver "Cómo se probó").
- Instalar como app: si no está en modo standalone, banner abajo (`#installBar`) tras 1.5 s; "Ahora no" lo
  pospone 7 días (`r2k.install.v1`). Con `beforeinstallprompt` (Chrome/Android) instala de un toque; si no, o si
  falla, `showInstallHelp()` muestra pasos para Chrome Android, Samsung Internet, iPhone (con nota: sin vibración
  y el aviso de descanso podría no sonar con pantalla apagada) u otros. "Instalar app" en ⋮ solo si no está instalada.
- Bienvenida (`maybeWelcome`): 3 pantallas la primera vez (`r2k.welcome.v1`); si ya hay registros se da por
  vista (usuarios existentes no la ven). Al cerrarla sale el banner de instalar si aplica.
- Generar nueva rutina (`generateRoutine`): mismos 5 días y grupos; `data/generador.json` define los huecos de
  cada día (ids de routine.json A/B, orden y superseries). Sortea A y B sin repetir ejercicio en la semana
  (`exKey` = inv+img) ni dos variantes del mismo inv en un día, y procura que B difiera de A. Se guarda completa
  en `r2k.custom.v1` y `applyCustom` la sobrepone a `state.baseRoutine` (todo lo demás usa `dayView`). Quien
  la genera deja de recibir cambios de la original hasta "Volver a la rutina original". La rutina generada
  guarda `base` (versión de routine.json al generarla); si la original sube de versión, al abrir sale una vez
  "🆕 La rutina original se actualizó" (`checkRoutineUpdate`, recuerda la versión avisada en `avisado`).
- Compartir (`shareApp`): `navigator.share` con la raíz de la app; si no existe, copia la liga.
- Modo portada (pantalla externa del Razr 50: 469×318 CSS px, dpr 2.25; abierto 411×916, dpr 2.625):
  `@media (max-height: 360px)` oculta encabezado y lista y muestra `#cover` (`renderCover`): un ejercicio a la
  vez, botones grandes, flechas ‹ ›, avance automático (`coverAfterMark`; en superserie alterna dentro del grupo).
  Se redibuja en `updateProgress`. En portada no se muestra la barra "Ahora: X" de superserie.
  La línea "Pantalla: …" de Opciones sirve para medir.
- Semana A/B: `weekLetter(w)` cuenta desde `routine.abInicio`; los cambios manuales se guardan en `r2k.ab.v1`
  (`{ lunes: "A"|"B" }`) y la alternancia sigue desde el último; semanas anteriores no cambian. Todo el código
  lee los ejercicios con `dayView(día, semana)`, nunca `day.exercises` directo. El respaldo incluye `ab`.
- Descanso: al marcar una serie arranca un temporizador con el `rest` del ejercicio (90 s por omisión).
  En superserie solo arranca tras el último del grupo; antes muestra "Ahora: <siguiente>". Se guarda la
  hora de término en `r2k.rest.v1` (sobrevive a que Android congele la página). El aviso es un tono corto
  de Web Audio programado desde el inicio, con 3 bips de cuenta regresiva antes (suena con pantalla apagada y se mezcla con la música; confirmado en su Android) + vibración.

- Shamuco (`shamucoSVG(p, flex)`): mascota, demonio de caricatura rojo con contorno negro (estilo propio, inspirado
  en Nerdlucks → Monstars de Space Jam y referencias de Adrián, sin copiar ningún diseño). SVG armado en código:
  cada medida sale de `p` (% de series del día), de flaquito/kawaii (taparrabo gris) a mamado (cinturón, muñequeras);
  flex al 100 %. `lump()` dibuja piezas en negro más gruesas y luego el color = silueta con contorno. Va en
  `#shamuco` a la derecha del título (`.day-head` es grid); `renderShamuco` se llama en `updateProgress`, solo redibuja
  si cambió y da un saltito (`.grow`) al crecer en el mismo día. Interruptor en Opciones (`r2k.shamuco` = "0" apagado).
  Poses (`shamucoState`): 'parado', 'flex' (100 %), 'agua' (descanso con > 3 s; en los 3 bips ya está listo y brinca
  con cada uno). Tocar el del encabezado → globo `#shamBubble` con frase de `logros.json` → `shamuco.{flaco,medio,mamado,
  descanso}` + gruñido `sfx('sham')`. Cuando el encabezado sale de pantalla (IntersectionObserver), aparece `#shamWalk`:
  fijo abajo, se pasea de lado a lado (CSS: `.sw-move` posición, `.sw-face` voltea para que la cola vaya atrás,
  `.sw-hop` brinca, `.sw-body` se bambolea), `pointer-events: none` (los toques lo atraviesan). Con descanso se para
  encima de la barra (`--rest-h`) y se detiene a tomar agua (`.drinking`). Oculto en modo portada.
  Disfraces por tema (`SHAMUCO_TRAJE`, `o.traje`): aero = goggles de natación; halloween = capa de vampiro; synth = lentes neón + brillo rosa (CSS);
  muertos = calaverita + cempasúchil;
  gb = `shamucoInto` pinta el SVG en un `<canvas>` de 48 px con los 4 verdes y el CSS lo agranda (`image-rendering: pixelated`).
  Accesorios por racha de días (`SHAMUCO_ACC`, se suman): 3 cinta, 5 cinturón de pesas, 10 corona, 15 tridente-barra.
  `shamucoState` solo recalcula la racha si cambió el progreso. En la celebración del día sale haciendo flex
  (`.party-sham`) y, si la racha llegó justo a un umbral, "🆕 Shamuco desbloqueó: …". Opciones dice qué lleva y qué sigue.
  Para diseñar: hoja de muestra con `shamucoSVG(p, pose, { traje, acc })` en varias combinaciones.
  Muestra de etapas para diseñar: generar una página con la función y un `<input type=range>`.

## Probar
- Rápido: `python3 -m http.server 8000` en la raíz y abrir http://localhost:8000
- Como en producción: `node scripts/build.mjs` y servir `_site/`.
- En el celular sin publicar: Chrome DevTools → modo dispositivo (Ctrl+Shift+M), y en
  Application → Service Workers marcar "Offline" para probar sin internet.

## Cómo se probó (para repetirlo)
Sin dependencias: Node + Chrome instalado (`C:/Program Files/Google/Chrome/Application/chrome.exe`).
Scripts en el scratchpad (no en el repo): servidor estático con `node:http` + Chrome `--headless=new
--remote-debugging-port` + `--autoplay-policy=no-user-gesture-required`, manejado por CDP con el WebSocket
nativo de Node (`Runtime.evaluate`, `Page.captureScreenshot`, `Emulation.setDeviceMetricsOverride`).
- Tamaños: cel 400×860 (o 411×916, dpr 2.625); pantalla externa del Razr 469×318, dpr 2.25.
- Fecha falsa con `Page.addScriptToEvaluateOnNewDocument` (subclase de `Date` con desfase) para probar
  día entre semana, rachas, temporadas, duración y recordatorio de respaldo.
- Sonidos: envolver `sfx` para registrar qué suena; `audioCtx.state` para ver que no se corte.
- Producción: `node scripts/build.mjs` y servir `_site/`; probar sin red con
  `Network.emulateNetworkConditions`; actualización con un servidor que manda `cache-control: max-age=600`
  (como GitHub Pages) y cambiar `sw.js`/`app.js` en caliente.
- Ojo: `element.click()` desde CDP no cuenta como gesto del usuario (`beforeinstallprompt.prompt()` falla);
  un toque real (`Input.dispatchMouseEvent`) sí sirve para probar inercia de modales.
- Revisa siempre las capturas: varios bugs (botón cardio en alto contraste, texto que parpadeaba en Game Boy,
  emoji teñido por el degradado) solo se vieron así.

## Ideas pendientes
- Semana B: Adrián la va a probar en el gym (desde el 26 oct) y mandará su respaldo exportado con notas
  (✅/🔧/❌ en `notas`). Usarlas para ajustar routine.json (y generador.json).
- Tema de temporada de diciembre (Adrián pide uno cada mes): pendiente de proponer. Darle también disfraz a Shamuco.
- **Mascota "Shamuco"**: fases 1–3 hechas (ver Arquitectura). Al hacer un tema de temporada nuevo, agregarle
  disfraz en `SHAMUCO_TRAJE` + dibujo en `shamucoSVG`, y quizá frases de temporada en `logros.json` → `shamuco`.
