# La 10mía · Optimizador de fotos

Azure Function (Python, plan Flex Consumption) que cada 10 minutos toma las fotos originales
del contenedor `fotos` de la cuenta `stla10miafotos` y crea versiones livianas en WebP en el
contenedor `web`:

- `<nombre>-600.webp` para las tarjetas del catálogo.
- `<nombre>-1600.webp` para la galería.

Corrige la orientación, elimina los datos de la cámara (incluido el GPS) y borra las versiones
cuyo original ya no existe.

Variable de entorno requerida en el Function App: `FOTOS_CONEXION` (cadena de conexión de la
cuenta de almacenamiento). Nunca la escribas en este repositorio.
