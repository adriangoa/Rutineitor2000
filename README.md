# Rutineitor 2000

Rutina de gimnasio (lunes a viernes) como app web instalable en el celular.
Funciona **sin internet**: se descarga una vez (~3.5 MB) y después abre desde la memoria del teléfono.

**App:** https://adriangoa.github.io/Rutineitor2000/

## Instalar en Android

1. Abre la liga en **Chrome** (con internet, solo esta vez).
2. Menú ⋮ → **Agregar a la pantalla principal** → **Instalar**.
3. Ábrela una vez desde el ícono. Desde ahí funciona en modo avión.

## Uso

- Abre directo en el día de hoy (sábado y domingo muestra la semana que viene).
- **Semana A y semana B** se alternan solas: mismos días y músculos, distintas variantes de ejercicio.
  La etiqueta junto a la fecha dice cuál toca. Si faltas una semana, cámbiala en 📅 → **Cambiar a A/B**.
- Toca **1, 2, 3, 4** para marcar cada serie. El cardio se marca con un solo botón.
- Al marcar una serie arranca el **descanso** (barra abajo, con −15 / +15 / Saltar). Al terminar suena
  un tono suave y vibra, aunque la pantalla esté apagada; 3 bips cortos te avisan en los últimos 3 segundos. En una superserie no hay descanso entre
  ejercicios: la barra te dice cuál sigue, y el descanso arranca al terminar el último del grupo.
- Toca la foto o el nombre para ver cómo se hace (imagen de inicio y final) y tips de técnica.
  Abajo del modal puedes pasar al ejercicio anterior o al siguiente; en superserie, al que sigue del grupo.
- ⋮ → **Tema**: Automático, Alto contraste, Synthwave, Game Boy o 🎃 **Temporada** (Halloween por ahora;
  "Automático por fecha" elige solo el del mes). Los temas de temporada traen sus propias frases de logro.
- Sonidos retro al tocar botones, arpegio al completar un ejercicio y fanfarria al completar el día.
  Se apagan en ⋮ → **Efectos de sonido**.
- Al completar un ejercicio baja un aviso de **logro desbloqueado** con una frase al azar; al completar
  el día, celebración con confeti. Las frases y emojis están en [`data/logros.json`](data/logros.json):
  agrega las tuyas. Los emojis con versión animada (lista `animados`) se mueven.
- Al completar un ejercicio en la lista, esta se desliza sola al siguiente que te falta.
- Junto a la fecha ves cuánto llevas entrenando (⏱, de la primera a la última serie que marcas hoy);
  también sale al completar el día y en 📅.
- 🔥 **Rachas**: días seguidos cumplidos (80 % o más de las series; sábado y domingo no cuentan) y semanas
  completas. Las ves en 📅 y en la celebración del día.
- En el modal de cada ejercicio, el botón 📝 sirve para anotar si lo pudiste hacer: ✅ Lo hice ·
  🔧 Lo adapté · ❌ No se puede (con nota de qué cambiaste o por qué). Los 🔧/❌ dejan un puntito en la
  foto del ejercicio. Las notas van en **Exportar respaldo**: pásale ese archivo a Claude para ajustar la rutina.
- 📱 En la **pantalla externa** del Razr (cel cerrado) la app muestra un ejercicio a la vez con botones
  grandes y flechas ‹ ›; avanza sola al completar cada uno.
- 📅 muestra el avance de la semana y de las 8 semanas anteriores.
- ⋮ → **Exportar respaldo** guarda tu registro en un archivo. Hazlo de vez en cuando:
  el registro vive solo en tu celular. Si pasan 4 semanas sin respaldar, la app te lo recuerda al abrirla.

## Cambiar la rutina

Todo está en [`data/routine.json`](data/routine.json). Edita, haz commit y push a `main`.
GitHub Actions publica solo. La próxima vez que abras la app con señal, aparece
"Hay una versión nueva · Toca para actualizar". Si no cambió nada, no descarga nada.

Para cambiar un ejercicio por otro de tu inventario, búscalo en `referencia/inventario.json`.
Su campo `img` dice qué carpeta de imágenes usar; si no está en `images/`, muévela desde
`referencia/imagenes/`.

Campos de cada ejercicio:

| Campo | Qué es |
|---|---|
| `id` | Identificador único. **No lo cambies** si ya tienes registro de ese ejercicio. |
| `inv` | Número en el inventario original del Excel. |
| `name`, `variant` | Nombre y variante. |
| `sets`, `reps` | Series (número) y repeticiones (texto, ej. `"8–10"`, `"45 s"`). |
| `img` | Carpeta dentro de `images/` con `0.webp` (inicio) y `1.webp` (final). |
| `ss` | Superserie: ejercicios seguidos con la misma letra se agrupan. |
| `exercises` / `exercisesB` | (En cada día) ejercicios de la semana A y de la semana B. Sin `exercisesB`, la B repite la A. |
| `abInicio` | (Arriba del todo) lunes de la primera semana A; desde ahí se alternan. |
| `rest` | Segundos de descanso tras cada serie (opcional, 90 por omisión). En superserie cuenta el del último. |
| `tips` | Lista de notas de técnica. |
| `type: "cardio"` + `duration` | Para bloques de cardio (un solo check). |

## Probar en la computadora

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

En local el service worker usa red primero, así ves tus cambios al recargar.
Para simular la versión publicada: `node scripts/build.mjs` y sirve la carpeta `_site/`.

## Estructura

```
index.html, styles.css, app.js   interfaz
data/routine.json                 la rutina
images/<Ejercicio>/0.webp, 1.webp imágenes de la rutina actual (dominio público, ver images/CREDITOS.md)
referencia/inventario.json        tus 61 ejercicios + qué imagen le toca a cada uno
referencia/imagenes/              imágenes del resto del inventario (no se publican)
sw.js                             modo sin internet
manifest.webmanifest, icons/      instalación como app
scripts/build.mjs                 calcula la versión y la lista de archivos al publicar
.github/workflows/pages.yml       publica en GitHub Pages en cada push a main
```
