// ====== CONFIGURACIÓN ======
const SUPABASE_URL = 'https://TU-URL-REAL.supabase.co';
const SUPABASE_KEY = 'TU-CLAVE-REAL-COMPLETA';
const WHATSAPP_BARBERIA = '1809XXXXXXX';
const DIAS_A_MOSTRAR = 14;   // cuántos días hacia adelante se puede reservar
const PASO_MIN = 30;         // las horas se ofrecen cada 30 minutos

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ====== ESTADO: lo que el cliente va eligiendo ======
const elegido = { servicio: null, fecha: null, barbero: null, hora: null };
let servicios = [], barberos = [], horarios = [];

// ====== FUNCIONES AUXILIARES ======
const $ = (id) => document.getElementById(id);

// "07:30:00" -> 450 (minutos desde medianoche). Con minutos es fácil comparar horas.
const aMin = (t) => { const [h, m] = t.split(':'); return +h * 60 + +m; };
const dos = (n) => String(n).padStart(2, '0');
const aHHMM = (min) => `${dos(Math.floor(min / 60))}:${dos(min % 60)}`;
const aTexto12 = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h % 12 || 12}:${dos(m)} ${h >= 12 ? 'pm' : 'am'}`;
};
const aISO = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const deISO = (s) => { const [y, m, d] = s.split('-'); return new Date(+y, +m - 1, +d); };

// Crea un botón y lo agrega a un contenedor. Usamos textContent (no innerHTML)
// para que nadie pueda inyectar código con un nombre raro.
function agregarBoton(contenedor, texto, alClick) {
  const b = document.createElement('button');
  b.textContent = texto;
  b.onclick = () => {
    [...contenedor.children].forEach((x) => x.classList.remove('activo'));
    b.classList.add('activo');
    alClick();
  };
  contenedor.appendChild(b);
}

function ocultarDesde(ids) { ids.forEach((id) => ($(id).hidden = true)); }

// ====== INICIO: cargar datos de Supabase ======
async function iniciar() {
  const [s, b, h] = await Promise.all([
    db.from('servicios').select('*').order('id'),
    db.from('barberos').select('*').order('id'),
    db.from('horarios').select('*'),
  ]);
  if (s.error || b.error || h.error) {
  console.log('Errores:', s.error, b.error, h.error);   // <- línea nueva
  $('servicios').textContent = 'No se pudo cargar. Revisa tus claves de Supabase.';
  return;
}
  servicios = s.data; barberos = b.data; horarios = h.data;

  servicios.forEach((sv) => {
    agregarBoton($('servicios'), `${sv.nombre} · RD$${sv.precio} · ${sv.duracion_min} min`, () => {
      elegido.servicio = sv;
      ocultarDesde(['sec-barbero', 'sec-hora', 'sec-datos']);
      mostrarFechas();
    });
  });
}

// ====== PASO 2: DÍAS ======
function mostrarFechas() {
  const cont = $('fechas');
  cont.innerHTML = '';
  const hoy = new Date();
  for (let i = 0; i < DIAS_A_MOSTRAR; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
    const texto = d.toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short' });
    agregarBoton(cont, texto, () => {
      elegido.fecha = aISO(d);
      ocultarDesde(['sec-hora', 'sec-datos']);
      mostrarBarberos(d.getDay());
    });
  }
  $('sec-fecha').hidden = false;
}

// ====== PASO 3: BARBEROS que trabajan ese día ======
function mostrarBarberos(diaSemana) {
  const cont = $('barberos');
  cont.innerHTML = '';
  const disponibles = barberos.filter((b) =>
    horarios.some((h) => h.barbero_id === b.id && h.dia_semana === diaSemana));

  if (disponibles.length === 0) {
    cont.textContent = 'No hay barberos ese día.';
  }
  disponibles.forEach((b) => {
    agregarBoton(cont, b.nombre, () => {
      elegido.barbero = b;
      ocultarDesde(['sec-datos']);
      mostrarHoras();
    });
  });
  $('sec-barbero').hidden = false;
}

// ====== PASO 4: HORAS LIBRES (la lógica de disponibilidad) ======
async function mostrarHoras() {
  const cont = $('horas');
  cont.textContent = 'Buscando horas...';
  $('sec-hora').hidden = false;

  // Pedimos a la base de datos las horas ocupadas de ese día
  const { data: ocupados, error } = await db.rpc('ocupados', { p_fecha: elegido.fecha });
  if (error) { cont.textContent = 'Error al buscar horas.'; return; }

  const dia = deISO(elegido.fecha).getDay();
  const jornada = horarios.find((h) =>
    h.barbero_id === elegido.barbero.id && h.dia_semana === dia);
  const apertura = aMin(jornada.hora_inicio);
  const cierre = aMin(jornada.hora_fin);
  const dur = elegido.servicio.duracion_min;

  // Rangos ocupados de ESTE barbero: [[inicio, fin], ...]
  const ocupadosBarbero = ocupados
    .filter((o) => o.barbero_id === elegido.barbero.id)
    .map((o) => [aMin(o.hora_inicio), aMin(o.hora_fin)]);

  const ahora = new Date();
  const esHoy = elegido.fecha === aISO(ahora);
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  const libres = [];
  // Probamos cada hora de inicio posible; el servicio debe TERMINAR antes de cerrar
  for (let t = apertura; t + dur <= cierre; t += PASO_MIN) {
    if (esHoy && t <= minutosAhora) continue;                 // no ofrecer horas pasadas
    const choca = ocupadosBarbero.some(([ini, fin]) => t < fin && t + dur > ini);
    if (!choca) libres.push(t);
  }

  cont.innerHTML = '';
  if (libres.length === 0) { cont.textContent = 'No hay horas libres ese día. Prueba otro día u otro barbero.'; return; }
  libres.forEach((t) => {
    agregarBoton(cont, aTexto12(t), () => {
      elegido.hora = t;
      $('sec-datos').hidden = false;
    });
  });
}

// ====== PASO 5: CONFIRMAR ======
$('confirmar').onclick = async () => {
  const nombre = $('nombre').value.trim();
  const telefono = $('telefono').value.trim();
  const msg = $('mensaje');
  msg.textContent = '';

  if (nombre.length < 2) { msg.textContent = 'Escribe tu nombre.'; return; }
  if (telefono.replace(/\D/g, '').length < 10) { msg.textContent = 'Escribe un teléfono válido (10 dígitos).'; return; }

  $('confirmar').disabled = true;
  const { error } = await db.from('citas').insert({
    barbero_id: elegido.barbero.id,
    servicio_id: elegido.servicio.id,
    fecha: elegido.fecha,
    hora_inicio: aHHMM(elegido.hora),
    hora_fin: aHHMM(elegido.hora + elegido.servicio.duracion_min),
    cliente_nombre: nombre,
    cliente_telefono: telefono,
  });
  $('confirmar').disabled = false;

  if (error) {
    // 23P01 = la regla "sin_choques" rechazó la cita: alguien reservó justo antes
    msg.textContent = error.code === '23P01'
      ? 'Esa hora acaba de ser reservada por otra persona. Elige otra.'
      : 'No se pudo guardar la cita. Intenta de nuevo.';
    if (error.code === '23P01') mostrarHoras();
    return;
  }
  mostrarConfirmacion(nombre);
};

function mostrarConfirmacion(nombre) {
  const fechaTxt = deISO(elegido.fecha).toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' });
  const detalle = `${elegido.servicio.nombre} con ${elegido.barbero.nombre}, ${fechaTxt} a las ${aTexto12(elegido.hora)}`;
  $('resumen').textContent = detalle;
  const texto = `Hola, soy ${nombre}. Reservé: ${detalle}.`;
  $('whatsapp').href = `https://wa.me/${WHATSAPP_BARBERIA}?text=${encodeURIComponent(texto)}`;
  ['sec-fecha', 'sec-barbero', 'sec-hora', 'sec-datos'].forEach((id) => ($(id).hidden = true));
  $('sec-ok').hidden = false;
}

iniciar();