# Rutineitor 2000

Rutina de gimnasio (lunes a viernes) como app web instalable en el celular.
Funciona **sin internet**: se descarga una vez (~1 MB) y después abre desde la memoria del teléfono.

**App:** https://adriangoa.github.io/rutineitor2000/

## Instalar en Android

1. Abre la liga en **Chrome** (con internet, solo esta vez).
2. Menú ⋮ → **Agregar a la pantalla principal** → **Instalar**.
3. Ábrela una vez desde el ícono. Desde ahí funciona en modo avión.

## Uso

- Abre directo en el día de hoy (sábado y domingo muestra la semana que viene).
- Toca **1, 2, 3, 4** para marcar cada serie. El cardio se marca con un solo botón.
- Toca la foto o el nombre para ver cómo se hace (imagen de inicio y final) y tips de técnica.
- ☀ mantiene la pantalla encendida mientras entrenas.
- 📅 muestra el avance de la semana y de las 8 semanas anteriores.
- ⋮ → **Exportar respaldo** guarda tu registro en un archivo. Hazlo de vez en cuando:
  el registro vive solo en tu celular.

## Cambiar la rutina

Todo está en [`data/routine.json`](data/routine.json). Edita, haz commit y push a `main`.
GitHub Actions publica solo. La próxima vez que abras la app con señal, aparece
"Hay una versión nueva · Toca para actualizar". Si no cambió nada, no descarga nada.

Campos de cada ejercicio:

| Campo | Qué es |
|---|---|
| `id` | Identificador único. **No lo cambies** si ya tienes registro de ese ejercicio. |
| `inv` | Número en el inventario original del Excel. |
| `name`, `variant` | Nombre y variante. |
| `sets`, `reps` | Series (número) y repeticiones (texto, ej. `"8–10"`, `"45 s"`). |
| `img` | Carpeta dentro de `images/` con `0.webp` (inicio) y `1.webp` (final). |
| `ss` | Superserie: ejercicios seguidos con la misma letra se agrupan. |
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
images/<Ejercicio>/0.webp, 1.webp imágenes (dominio público, ver images/CREDITOS.md)
sw.js                             modo sin internet
manifest.webmanifest, icons/      instalación como app
scripts/build.mjs                 calcula la versión y la lista de archivos al publicar
.github/workflows/pages.yml       publica en GitHub Pages en cada push a main
```
