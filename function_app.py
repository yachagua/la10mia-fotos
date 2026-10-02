"""
La 10mía · Optimizador de fotos

Cada 10 minutos revisa el contenedor "fotos" (originales) y, por cada foto nueva o modificada,
crea dos versiones livianas en formato WebP dentro del contenedor "web":

    <nombre>-600.webp    para las tarjetas del catálogo
    <nombre>-1600.webp   para la galería con zoom

Además:
  - Corrige las fotos que el celular guarda giradas.
  - Elimina los datos ocultos de la cámara (incluida la ubicación GPS).
  - Borra de "web" las versiones cuya foto original ya no existe.

Configuración (en el Function App > Variables de entorno):
  FOTOS_CONEXION   cadena de conexión de la cuenta stla10miafotos (obligatoria)
"""
import io
import logging
import os

import azure.functions as func
from azure.storage.blob import BlobServiceClient, ContentSettings
from PIL import Image, ImageOps

CONTENEDOR_ORIGEN = "fotos"
CONTENEDOR_WEB = "web"
TAMANOS = {"600": (600, 800), "1600": (1600, 1600)}   # sufijo: (ancho máx, alto máx)
CALIDAD = 78
EXTENSIONES = (".jpg", ".jpeg", ".png", ".webp")
CACHE = "public, max-age=604800"   # el navegador guarda cada foto 7 días

app = func.FunctionApp()


def base_sin_extension(nombre: str) -> str:
    return nombre.rsplit(".", 1)[0]


def generar_versiones(contenido: bytes) -> dict:
    """Devuelve {sufijo: bytes_webp} para cada tamaño."""
    with Image.open(io.BytesIO(contenido)) as original:
        imagen = ImageOps.exif_transpose(original)
        if imagen.mode not in ("RGB", "RGBA"):
            imagen = imagen.convert("RGB")
        resultado = {}
        for sufijo, limite in TAMANOS.items():
            copia = imagen.copy()
            copia.thumbnail(limite, Image.LANCZOS)
            salida = io.BytesIO()
            # Se guarda sin EXIF: así no viajan datos de la cámara ni la ubicación GPS
            copia.save(salida, "WEBP", quality=CALIDAD, method=4)
            resultado[sufijo] = salida.getvalue()
        return resultado


def sincronizar(servicio: BlobServiceClient) -> dict:
    origen = servicio.get_container_client(CONTENEDOR_ORIGEN)
    web = servicio.get_container_client(CONTENEDOR_WEB)

    # Lo que ya existe en "web", con la marca del original con el que se generó
    existentes = {b.name: (b.metadata or {}).get("origen_etag") for b in web.list_blobs(include=["metadata"])}

    procesadas, errores, esperadas = 0, 0, set()
    for blob in origen.list_blobs():
        if not blob.name.lower().endswith(EXTENSIONES):
            continue
        base = base_sin_extension(blob.name)
        destinos = {s: f"{base}-{s}.webp" for s in TAMANOS}
        esperadas.update(destinos.values())

        etag = blob.etag.strip('"')
        if all(existentes.get(d) == etag for d in destinos.values()):
            continue   # ya está al día

        try:
            contenido = origen.download_blob(blob.name).readall()
            for sufijo, datos in generar_versiones(contenido).items():
                web.upload_blob(
                    destinos[sufijo], datos, overwrite=True,
                    content_settings=ContentSettings(content_type="image/webp", cache_control=CACHE),
                    metadata={"origen_etag": etag},
                )
            procesadas += 1
            logging.info("Optimizada: %s", blob.name)
        except Exception:  # una foto dañada no detiene a las demás
            errores += 1
            logging.exception("No se pudo procesar %s", blob.name)

    # Limpieza: versiones cuyo original ya no existe
    borradas = 0
    for nombre in existentes:
        if nombre not in esperadas:
            web.delete_blob(nombre)
            borradas += 1

    return {"procesadas": procesadas, "errores": errores, "borradas": borradas}


@app.timer_trigger(schedule="0 */10 * * * *", arg_name="temporizador", run_on_startup=False)
def optimizar_fotos(temporizador: func.TimerRequest) -> None:
    servicio = BlobServiceClient.from_connection_string(os.environ["FOTOS_CONEXION"])
    resumen = sincronizar(servicio)
    logging.info("Resumen: %s", resumen)
