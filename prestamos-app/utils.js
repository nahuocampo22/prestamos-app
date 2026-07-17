// utils.js - helpers de fechas, calculo de cuotas y normalizacion de telefono

function hoyISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function sumarDias(fechaISO, dias) {
  const d = new Date(fechaISO + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function sumarMeses(fechaISO, meses) {
  const d = new Date(fechaISO + 'T00:00:00');
  const dia = d.getDate();
  d.setMonth(d.getMonth() + meses);
  // corrige desbordes de mes (ej: 31 de enero + 1 mes)
  if (d.getDate() < dia) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

// Genera las fechas de vencimiento de cada cuota segun frecuencia
function generarFechasCuotas(fechaInicio, numCuotas, frecuencia) {
  const fechas = [];
  for (let i = 1; i <= numCuotas; i++) {
    if (frecuencia === 'semanal') fechas.push(sumarDias(fechaInicio, 7 * i));
    else if (frecuencia === 'quincenal') fechas.push(sumarDias(fechaInicio, 15 * i));
    else if (frecuencia === 'mensual') fechas.push(sumarMeses(fechaInicio, i));
    else fechas.push(fechaInicio); // 'unico'
  }
  return fechas;
}

// Calcula el estado visual de una cuota pendiente segun su fecha de vencimiento
function estadoCuota(cuota, hoy = hoyISO()) {
  if (cuota.estado === 'pagada') return 'pagada';
  if (cuota.fecha_vencimiento < hoy) return 'vencida';
  if (cuota.fecha_vencimiento === hoy) return 'hoy';
  const en3dias = sumarDias(hoy, 3);
  if (cuota.fecha_vencimiento <= en3dias) return 'proxima';
  return 'pendiente';
}

// Normaliza un numero de telefono argentino a formato E.164 para WhatsApp (wa.me)
// Reglas practicas (no infalibles, pero cubren el caso comun):
// - Se quitan espacios, guiones, parentesis, "+"
// - Si ya empieza con 54, se respeta
// - Si empieza con 0 (ej: 011...), se quita el 0
// - Si tiene un 15 despues del codigo de area (celular viejo estilo), se quita el 15
// - Se antepone 54 9 (9 = celular Argentina) si no estaba
function normalizarTelefonoArg(telefono) {
  if (!telefono) return '';
  let t = telefono.replace(/[^\d]/g, '');
  if (t.startsWith('54')) {
    t = t.slice(2);
  }
  if (t.startsWith('0')) {
    t = t.slice(1);
  }
  // formato area+15+numero -> quitar el 15
  t = t.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2');
  if (t.startsWith('9')) {
    t = t.slice(1);
  }
  return '54' + '9' + t;
}

function linkWhatsApp(telefono, mensaje) {
  const numero = normalizarTelefonoArg(telefono);
  const texto = encodeURIComponent(mensaje);
  return `https://wa.me/${numero}?text=${texto}`;
}

function formatoMoneda(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = {
  hoyISO,
  sumarDias,
  sumarMeses,
  generarFechasCuotas,
  estadoCuota,
  normalizarTelefonoArg,
  linkWhatsApp,
  formatoMoneda,
};
