# Contexto para Claude

App personal de rutina de gimnasio de Adrián. PWA estática sin dependencias ni framework,
publicada en GitHub Pages vía Actions. Interfaz y textos en español (México).

## Requisitos del usuario
- Se usa desde un celular **Android** en el gimnasio. Debe funcionar sin internet y gastar
  el mínimo de datos: todo se precachea en el service worker; solo descarga cuando cambia la versión.
- Solo quiere **marcar series hechas**, no registrar peso.
- Va de lunes a viernes, 60–90 min. Lunes y jueves terminan con cardio (elíptica o escaladora).
  El viernes es el **único** día de pierna; de lunes a jueves no hay ejercicios de pierna.
- Los ejercicios deben salir de su inventario (columna `inv` = número del inventario original, 61 ejercicios
  en el Excel "Rutina_Personalizada_y_Inventario_Gimnasio.xlsx").

## Lógica de la rutina (v1)
Lun Pecho+Tríceps · Mar Espalda+Bíceps+Lumbar · Mié Hombro+Trapecio+Abdomen ·
Jue Torso B (pecho/espalda con otras variantes, superseries) + brazos · Vie Pierna completa.
Pecho cada 72–96 h, espalda/bíceps cada 48 h, hombro con 48 h tras el empuje del lunes.

## Arquitectura
- `data/routine.json` es la fuente de la rutina. Subir `version` al cambiarla.
- Registro en `localStorage` (`r2k.log.v1`): `{ "YYYY-MM-DD": { "<exerciseId>": [1,0,1,...] } }`.
  No cambies `id`s de ejercicios existentes sin migrar el registro.
- `sw.js`: en local `VERSION='dev'` (red primero). `scripts/build.mjs` inyecta un hash de contenido como
  versión y la lista de archivos para precache (caché primero). El cliente ofrece "toca para actualizar".
- Imágenes de free-exercise-db (dominio público), WebP 480px. Para agregar una: buscar en
  https://github.com/yuhonas/free-exercise-db el id, convertir `0.jpg`/`1.jpg` a WebP 480px calidad ~68.
- Rutas siempre relativas (el sitio vive en `/rutineitor2000/`).

## Ideas pendientes
Temporizador de descanso entre series; rutina A/B alternando semanas.
