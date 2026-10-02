/* Lógica de La 10mía: catálogo desde Google Sheets, banner rotativo y galería */
/* CATÁLOGO DESDE GOOGLE SHEETS
   Pega aquí el enlace CSV de tu hoja publicada (Archivo > Compartir > Publicar en la web > CSV).
   Si lo dejas vacío, la página muestra los productos fijos de arriba. */
const CATALOGO_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS6-3EB_kCL1ft4N_y6coeR_HYr8EdltzZfgM8uy8FMPPf0LFN2wPQq9M9dTqGCq7IVipbqJ360FKf7/pub?gid=1893764892&single=true&output=csv";
const WHATSAPP = "573237340473";

const pesos = new Intl.NumberFormat("es-CO", {style:"currency", currency:"COP", maximumFractionDigits:0});
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* FOTOS EN AZURE BLOB STORAGE
   Todas las fotos se buscan en este contenedor. En la hoja basta con escribir el nombre del archivo. */
const FOTOS_BASE = "https://stla10miafotos.blob.core.windows.net/fotos/";
const ruta = f => /^https?:/.test(f) ? f : FOTOS_BASE + encodeURIComponent(f);

/* VERSIONES LIVIANAS: la función de Azure crea en el contenedor "web" dos versiones de cada foto:
   <nombre>-600.webp (tarjetas) y <nombre>-1600.webp (vitrina y galería).
   Si una versión todavía no existe, la página muestra la foto original. */
const WEB_BASE = "https://stla10miafotos.blob.core.windows.net/web/";
const originalDe = new Map();
function version(url, tam) {
  if (!url || !url.startsWith(FOTOS_BASE)) return url;
  const nombre = decodeURIComponent(url.slice(FOTOS_BASE.length));
  const liviana = WEB_BASE + encodeURIComponent(nombre.replace(/\.[^.]+$/, "") + "-" + tam + ".webp");
  originalDe.set(liviana, url);
  return liviana;
}
document.addEventListener("error", e => {
  const img = e.target;
  if (img.tagName !== "IMG") return;
  const original = originalDe.get(img.src);
  if (original && img.src !== original) img.src = original;
}, true);

/* DESCUENTOS: la columna "descuento" acepta 20 o 20%.
   El precio final se redondea a la centena más cercana. */
function precios(p) {
  const valor = Number(String(p.precio ?? "").replace(/[^\d]/g, ""));
  const pct = parseFloat(String(p.descuento ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  const conDescuento = valor > 0 && pct > 0 && pct < 100;
  const final = conDescuento ? Math.round(valor * (1 - pct / 100) / 100) * 100 : valor;
  return {valor, final, pct: conDescuento ? pct : 0};
}

function tarjeta(p) {
  const fotos = [p.imagen, ...String(p.fotos_extra ?? "").split(",")].map(f => f.trim()).filter(Boolean).map(ruta);
  const {valor, final, pct} = precios(p);
  const bloquePrecio = !valor
    ? `<span class="precio">Consultar</span>`
    : pct
      ? `<span class="precios"><s class="precio-antes"><span class="visualmente-oculto">Antes </span>${pesos.format(valor)}</s><span class="precio oferta"><span class="visualmente-oculto">Ahora </span>${pesos.format(final)}</span></span>`
      : `<span class="precio">${pesos.format(valor)}</span>`;
  const detalle = [p.marca, p.tipo, p.tallas ? "Tallas: " + p.tallas : ""].filter(Boolean).join(" · ");
  const msg = encodeURIComponent(`Hola, me interesa: ${p.nombre} (${p.id})` + (valor ? ` por ${pesos.format(final)}` : ""));
  return `<article class="producto" data-precio="${esc(valor ? (pct ? pesos.format(final) + " · antes " + pesos.format(valor) : pesos.format(valor)) : "")}">
    <button class="ver-fotos" type="button" data-fotos="${esc(fotos.join("|"))}" aria-label="Ver fotos de ${esc(p.nombre)}">
      <img src="${esc(version(fotos[0] || "", 600))}" alt="${esc(p.nombre)}" loading="lazy" width="900" height="1200">
      ${pct ? `<span class="etiqueta-descuento">-${pct}%</span>` : ""}
      ${fotos.length > 1 ? `<span class="contador-fotos">${fotos.length} fotos</span>` : ""}
    </button>
    <h3>${esc(p.nombre)}</h3>
    <p class="detalle">${esc(detalle)}</p>
    ${p.descripcion ? `<p class="detalle">${esc(p.descripcion)}</p>` : ""}
    <div class="fila">${bloquePrecio}
    <a class="pedir" href="https://wa.me/${WHATSAPP}?text=${msg}">Pedir<span class="solo-ancho"> por WhatsApp</span></a></div>
  </article>`;
}

/* BUSCADOR, FILTROS POR CONTINENTE Y EQUIPO, ORDEN Y "VER MÁS" */
const POR_PAGINA = 12;
let productos = [], filtroContinente = "", filtroEquipo = "", textoBusqueda = "", orden = "", limite = POR_PAGINA;
const normal = t => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const campo = (p, c) => String(p[c] ?? "").trim();
const rejilla = document.getElementById("rejilla");
const unicos = lista => [...new Set(lista.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

function chip(valor, texto, activo, extra = "") {
  return `<button type="button" class="filtro${extra}" data-valor="${esc(valor)}" aria-pressed="${activo}">${esc(texto)}</button>`;
}

function pintarFiltros() {
  const continentes = unicos(productos.map(p => campo(p, "continente")));
  const hayOfertas = productos.some(p => precios(p).pct);
  document.getElementById("filtros").innerHTML =
    chip("", "Todos", filtroContinente === "") +
    (hayOfertas ? chip("__oferta", "En oferta", filtroContinente === "__oferta", " oferta") : "") +
    continentes.map(c => chip(c, c, filtroContinente === c)).join("");

  const sub = document.getElementById("sub-filtros");
  const equipos = filtroContinente && filtroContinente !== "__oferta"
    ? unicos(productos.filter(p => campo(p, "continente") === filtroContinente).map(p => campo(p, "equipo")))
    : [];
  document.getElementById("fila-sub").hidden = equipos.length < 2;
  sub.innerHTML = chip("", `Todo ${filtroContinente}`, filtroEquipo === "") +
    equipos.map(e => chip(e, e, filtroEquipo === e)).join("");
}

function listaFiltrada() {
  const q = normal(textoBusqueda);
  const lista = productos.filter(p => {
    if (filtroContinente === "__oferta" && !precios(p).pct) return false;
    if (filtroContinente && filtroContinente !== "__oferta" && campo(p, "continente") !== filtroContinente) return false;
    if (filtroEquipo && campo(p, "equipo") !== filtroEquipo) return false;
    if (!q) return true;
    return normal([p.nombre, p.equipo, p.continente, p.marca, p.tipo, p.descripcion].join(" ")).includes(q);
  });
  const precioOrden = p => precios(p).final || Infinity;
  if (orden === "nuevos") lista.reverse();
  if (orden === "menor") lista.sort((a, b) => precioOrden(a) - precioOrden(b));
  if (orden === "mayor") lista.sort((a, b) => (precios(b).final || -1) - (precios(a).final || -1));
  return lista;
}

function filtrar() {
  const lista = listaFiltrada();
  const visibles = lista.slice(0, limite);
  const buscado = textoBusqueda || filtroEquipo || (filtroContinente !== "__oferta" ? filtroContinente : "");
  rejilla.innerHTML = lista.length
    ? visibles.map(tarjeta).join("")
    : `<p class="vacio">No encontramos camisetas con esa búsqueda. <a href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hola, ¿tienen camisetas de " + buscado + "?")}">Pregúntanos por WhatsApp</a> y te ayudamos a conseguirla.</p>`;
  document.getElementById("resultado").textContent =
    lista.length === productos.length ? `${lista.length} productos disponibles` : `${lista.length} de ${productos.length} productos`;
  const mas = document.getElementById("mas");
  mas.hidden = lista.length <= limite;
  document.getElementById("mas-texto").textContent = `Mostrando ${visibles.length} de ${lista.length}`;
}

function aplicar() { limite = POR_PAGINA; pintarFiltros(); filtrar(); actualizarFilas(); }

/* FILAS DE FILTROS DESLIZABLES: flechas en computador, deslizar con el dedo en celular,
   y la rueda del mouse también las mueve de lado. */
const filas = [...document.querySelectorAll(".fila-filtros")];
function actualizarFila(fila) {
  const cinta = fila.querySelector(".filtros");
  const hayIzq = cinta.scrollLeft > 2;
  const hayDer = cinta.scrollLeft + cinta.clientWidth < cinta.scrollWidth - 2;
  fila.classList.toggle("hay-izq", hayIzq);
  fila.classList.toggle("hay-der", hayDer);
  fila.querySelector(".flecha.izq").hidden = !hayIzq;
  fila.querySelector(".flecha.der").hidden = !hayDer;
}
function actualizarFilas() {
  filas.forEach(fila => {
    const activo = fila.querySelector('.filtro[aria-pressed="true"]');
    if (activo && !fila.hidden) activo.scrollIntoView({block: "nearest", inline: "nearest"});
    actualizarFila(fila);
  });
}
filas.forEach(fila => {
  const cinta = fila.querySelector(".filtros");
  cinta.addEventListener("scroll", () => actualizarFila(fila), {passive: true});
  cinta.addEventListener("wheel", e => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || cinta.scrollWidth <= cinta.clientWidth) return;
    e.preventDefault();
    cinta.scrollLeft += e.deltaY;
  }, {passive: false});
  fila.querySelector(".flecha.izq").addEventListener("click", () => cinta.scrollBy({left: -cinta.clientWidth * 0.7, behavior: "smooth"}));
  fila.querySelector(".flecha.der").addEventListener("click", () => cinta.scrollBy({left: cinta.clientWidth * 0.7, behavior: "smooth"}));
});
addEventListener("resize", () => filas.forEach(actualizarFila));

document.getElementById("filtros").addEventListener("click", e => {
  const b = e.target.closest(".filtro"); if (!b) return;
  filtroContinente = b.dataset.valor; filtroEquipo = "";
  aplicar();
});
document.getElementById("sub-filtros").addEventListener("click", e => {
  const b = e.target.closest(".filtro"); if (!b) return;
  filtroEquipo = b.dataset.valor;
  aplicar();
});
document.getElementById("buscar").addEventListener("input", e => { textoBusqueda = e.target.value; limite = POR_PAGINA; filtrar(); });
document.getElementById("ordenar").addEventListener("change", e => { orden = e.target.value; limite = POR_PAGINA; filtrar(); });
document.getElementById("ver-mas").addEventListener("click", () => {
  const antes = rejilla.children.length;
  limite += POR_PAGINA; filtrar();
  rejilla.children[antes]?.querySelector(".ver-fotos")?.focus({preventScroll: true});
});

/* Barra de búsqueda fija: se ajusta a la altura del encabezado y marca cuando está pegada */
const cabecera = document.querySelector("header");
const buscadorEl = document.getElementById("buscador");
function medirCabecera() { document.documentElement.style.setProperty("--alto-header", cabecera.offsetHeight + "px"); }
medirCabecera(); addEventListener("resize", medirCabecera);
addEventListener("scroll", () => {
  const r = buscadorEl.getBoundingClientRect();
  buscadorEl.classList.toggle("fijo", !buscadorEl.hidden && r.top <= cabecera.offsetHeight + 1 && rejilla.getBoundingClientRect().bottom > r.bottom);
}, {passive: true});

/* Cuántas camisetas al azar muestra la vitrina cuando no hay destacados */
const VITRINA_MAX = 8;
function mezclar(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; }
  return a;
}

/* Datos que usa la vitrina de la portada para cada producto */
function datosVitrina(p) {
  const fotos = [p.imagen, ...String(p.fotos_extra ?? "").split(",")].map(f => f.trim()).filter(Boolean).map(ruta);
  const {valor, final, pct} = precios(p);
  const msg = encodeURIComponent(`Hola, me interesa: ${p.nombre} (${p.id})` + (valor ? ` por ${pesos.format(final)}` : ""));
  return {
    src: fotos[0] || "", alt: p.nombre, nombre: p.nombre,
    precio: valor ? (pct ? pesos.format(final) + " · antes " + pesos.format(valor) : pesos.format(valor)) : "",
    galeria: fotos.join("|"), pedir: `https://wa.me/${WHATSAPP}?text=${msg}`
  };
}

if (CATALOGO_URL) {
  Papa.parse(CATALOGO_URL, {
    download: true, header: true, skipEmptyLines: true,
    complete: ({data}) => {
      productos = data.filter(p => campo(p, "activo").toLowerCase() === "si" && p.nombre);
      if (!productos.length) return;
      buscadorEl.hidden = false;
      aplicar();
      /* Vitrina en orden aleatorio cada vez que se abre la página:
         si marcaste destacados, rota todos ellos mezclados;
         si no, elige 8 camisetas al azar de todo el catálogo. */
      const destacados = productos.filter(p => campo(p, "destacado").toLowerCase() === "si");
      const seleccion = destacados.length ? mezclar(destacados) : mezclar(productos).slice(0, VITRINA_MAX);
      cargarVitrina(seleccion.map(datosVitrina));
    }
  });
}

/* VITRINA DEL BANNER: rota las camisetas del catálogo con fundido y acercamiento lento.
   Cambia SEGUNDOS para ajustar la velocidad. */
const SEGUNDOS = 3;
const vitrina = document.getElementById("vitrina");
const capas = vitrina.querySelectorAll(".capa");
const leyenda = document.getElementById("leyenda");
const contador = document.getElementById("contador");
const rotuloPrecio = document.getElementById("rotulo-precio");
const progreso = document.getElementById("progreso");
const botonPausa = document.getElementById("pausa");
const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;
let fotos = [], actual = 0, temporizador = null, pausado = sinMovimiento;
vitrina.style.setProperty("--dur", SEGUNDOS + "s");
vitrina.style.setProperty("--kb", (SEGUNDOS + 1.5) + "s");

const dosDigitos = n => String(n).padStart(2, "0");
const ICONO_PAUSA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>';
const ICONO_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

function cargarVitrina(lista) {
  fotos = lista || [...document.querySelectorAll("#rejilla .producto")].map(a => ({
    src: a.querySelector("img").getAttribute("src"),
    alt: a.querySelector("img").alt,
    nombre: a.querySelector("h3").textContent,
    precio: a.dataset.precio || "",
    galeria: a.querySelector(".ver-fotos")?.dataset.fotos || a.querySelector("img").getAttribute("src"),
    pedir: a.querySelector(".pedir")?.href || ""
  }));
  if (!fotos.length) return;
  fotos.forEach(f => { new Image().src = version(f.src, 1600); });
  actual = 0;
  mostrar(0, true);
  botonPausa.hidden = fotos.length < 2;
  pintarPausa();
}

function reiniciarAnimacion(el, clase) {
  el.classList.remove(clase); void el.offsetWidth; el.classList.add(clase);
}

function mostrar(i, inmediato) {
  const f = fotos[i]; if (!f) return;
  const [a, b] = capas[0].classList.contains("activa") ? [capas[0], capas[1]] : [capas[1], capas[0]];
  const destino = inmediato ? a : b;
  destino.src = version(f.src, 1600); destino.alt = f.alt;
  if (!inmediato) {
    b.classList.add("activa"); b.removeAttribute("aria-hidden");
    a.classList.remove("activa"); a.setAttribute("aria-hidden", "true"); a.alt = "";
  }
  if (!sinMovimiento) reiniciarAnimacion(destino, "kb");
  contador.textContent = `${dosDigitos(i + 1)} / ${dosDigitos(fotos.length)}`;
  leyenda.textContent = f.nombre;
  rotuloPrecio.textContent = f.precio;
  programar();
}

function programar() {
  clearTimeout(temporizador);
  progreso.classList.remove("corriendo");
  if (pausado || fotos.length < 2 || document.hidden) return;
  reiniciarAnimacion(progreso, "corriendo");
  temporizador = setTimeout(() => { actual = (actual + 1) % fotos.length; mostrar(actual); }, SEGUNDOS * 1000);
}

function pintarPausa() {
  vitrina.classList.toggle("pausado", pausado);
  botonPausa.setAttribute("aria-label", pausado ? "Reanudar las fotos" : "Pausar las fotos");
  botonPausa.innerHTML = pausado ? ICONO_PLAY : ICONO_PAUSA;
}

botonPausa.addEventListener("click", () => { pausado = !pausado; pintarPausa(); programar(); });
document.getElementById("ver-actual").addEventListener("click", () => {
  const f = fotos[actual]; if (!f) return;
  pausado = true; pintarPausa(); programar();
  abrirGaleria(f.galeria.split("|").filter(Boolean), f.nombre, f.pedir);
});
document.addEventListener("visibilitychange", programar);
cargarVitrina();

/* GALERÍA: al tocar una camiseta se abren todas sus fotos en grande. */
const galeria = document.getElementById("galeria");
const galImg = document.getElementById("gal-img");
let galFotos = [], galIndice = 0;

function galMostrar(i) {
  galIndice = (i + galFotos.length) % galFotos.length;
  galImg.classList.remove("zoom");
  galImg.src = version(galFotos[galIndice], 1600);
  galImg.alt = `${document.getElementById("gal-titulo").textContent}, foto ${galIndice + 1} de ${galFotos.length}`;
  document.getElementById("gal-contador").textContent = `Foto ${galIndice + 1} de ${galFotos.length}`;
  document.querySelectorAll("#gal-miniaturas button").forEach((b, j) => b.setAttribute("aria-current", j === galIndice));
  const varias = galFotos.length > 1;
  document.getElementById("gal-ant").hidden = !varias;
  document.getElementById("gal-sig").hidden = !varias;
  document.getElementById("gal-miniaturas").hidden = !varias;
}

function abrirGaleria(lista, titulo, pedir) {
  galFotos = lista;
  document.getElementById("gal-titulo").textContent = titulo;
  document.getElementById("gal-pedir").href = pedir || `https://wa.me/${WHATSAPP}`;
  document.getElementById("gal-miniaturas").innerHTML = galFotos.map((f, j) =>
    `<button type="button" aria-label="Ver foto ${j + 1}"><img src="${esc(version(f, 600))}" alt=""></button>`).join("");
  document.querySelectorAll("#gal-miniaturas button").forEach((b, j) => b.addEventListener("click", () => galMostrar(j)));
  galMostrar(0);
  galeria.showModal();
  document.body.style.overflow = "hidden";
}

document.getElementById("rejilla").addEventListener("click", e => {
  const boton = e.target.closest(".ver-fotos"); if (!boton) return;
  const tarjetaEl = boton.closest(".producto");
  abrirGaleria(boton.dataset.fotos.split("|").filter(Boolean), tarjetaEl.querySelector("h3").textContent, tarjetaEl.querySelector(".pedir").href);
});

galeria.addEventListener("close", () => { document.body.style.overflow = ""; });
document.getElementById("gal-cerrar").addEventListener("click", () => galeria.close());
document.getElementById("gal-ant").addEventListener("click", () => galMostrar(galIndice - 1));
document.getElementById("gal-sig").addEventListener("click", () => galMostrar(galIndice + 1));
galeria.addEventListener("keydown", e => {
  if (e.key === "ArrowLeft") galMostrar(galIndice - 1);
  if (e.key === "ArrowRight") galMostrar(galIndice + 1);
});

galImg.addEventListener("click", e => {
  const r = galImg.getBoundingClientRect();
  galImg.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  galImg.classList.toggle("zoom");
});
galImg.addEventListener("mousemove", e => {
  if (!galImg.classList.contains("zoom")) return;
  const r = galImg.getBoundingClientRect();
  galImg.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
});

let toqueX = null;
galImg.addEventListener("touchstart", e => { toqueX = e.touches[0].clientX; }, {passive: true});
galImg.addEventListener("touchend", e => {
  if (toqueX === null || galImg.classList.contains("zoom")) return;
  const d = e.changedTouches[0].clientX - toqueX;
  if (Math.abs(d) > 50) galMostrar(galIndice + (d < 0 ? 1 : -1));
  toqueX = null;
});
