// server.js - servidor Express que expone la API y sirve el frontend.
// Los datos ahora viven en una base de datos compartida (Postgres/Neon),
// para que se vean iguales desde cualquier computadora o celular conectado
// a internet, sin importar la red WiFi de cada uno.

require('dotenv').config();
const path = require('path');
const express = require('express');
const { pool, initDb } = require('./db');
const {
  hoyISO,
  generarFechasCuotas,
  estadoCuota,
  linkWhatsApp,
} = require('./utils');

const app = express();

app.use(express.json());

// ---------- Rutas PUBLICAS (sin usuario/contraseña) ----------
// El formulario de solicitud de prestamo tiene que poder abrirlo cualquiera
// con el link, sin tener que iniciar sesion. Por eso estas rutas se definen
// ANTES de activar la proteccion con usuario/contraseña, mas abajo.

app.get('/solicitud', (req, res) => {
  res.sendFile(path.join(__dirname, 'public-publico', 'solicitud.html'));
});

app.post('/api/solicitudes', manejarErrores(async (req, res) => {
  const {
    nombre, dni, telefono, monto_solicitado,
    tipo_pago_preferido, num_cuotas_preferido, frecuencia_preferida,
    referido_por, mensaje,
  } = req.body || {};

  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'Falta el nombre' });
  if (!telefono || !telefono.trim()) return res.status(400).json({ error: 'Falta el teléfono' });

  const solicitud = await uno(`
    INSERT INTO solicitudes (nombre, dni, telefono, monto_solicitado, tipo_pago_preferido, num_cuotas_preferido, frecuencia_preferida, referido_por, mensaje, estado)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pendiente')
    RETURNING *
  `, [
    nombre.trim(),
    (dni || '').trim() || null,
    telefono.trim(),
    monto_solicitado ? Number(monto_solicitado) : null,
    tipo_pago_preferido || null,
    num_cuotas_preferido ? parseInt(num_cuotas_preferido, 10) : null,
    frecuencia_preferida || null,
    (referido_por || '').trim() || null,
    (mensaje || '').trim() || null,
  ]);
  res.status(201).json(solicitud);
}));

// A partir de aca, todo lo que sigue requiere usuario y contraseña (si estan
// configurados). Si estan configuradas las variables APP_USER y APP_PASSWORD,
// se le pide usuario y contraseña a cualquiera que quiera entrar. Se
// configuran en Render, en "Environment".
const APP_USER = process.env.APP_USER;
const APP_PASSWORD = process.env.APP_PASSWORD;

if (APP_USER && APP_PASSWORD) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || '';
    const [esquema, credencialesB64] = header.split(' ');
    if (esquema === 'Basic' && credencialesB64) {
      const decodificado = Buffer.from(credencialesB64, 'base64').toString('utf8');
      const separador = decodificado.indexOf(':');
      const usuario = decodificado.slice(0, separador);
      const clave = decodificado.slice(separador + 1);
      if (usuario === APP_USER && clave === APP_PASSWORD) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Sistema de Prestamos"');
    res.status(401).send('Acceso restringido. Ingresá el usuario y la contraseña.');
  });
} else {
  console.warn('AVISO: APP_USER / APP_PASSWORD no configurados. El sistema queda accesible sin contraseña para cualquiera que tenga el link.');
}

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Helpers ----------

function redondear(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function q(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

async function uno(text, params) {
  const rows = await q(text, params);
  return rows[0] || null;
}

function conEstadoVisual(cuota, hoy) {
  return Object.assign({}, cuota, { estado_visual: estadoCuota(cuota, hoy) });
}

async function cuotasDe(prestamoId) {
  return q('SELECT * FROM cuotas WHERE prestamo_id = $1 ORDER BY numero', [prestamoId]);
}

async function prestamoConCuotas(id) {
  const prestamo = await uno(`
    SELECT p.*, c.nombre AS cliente_nombre, c.dni AS cliente_dni, c.telefono AS cliente_telefono
    FROM prestamos p JOIN clientes c ON c.id = p.cliente_id
    WHERE p.id = $1
  `, [id]);
  if (!prestamo) return null;
  const hoy = hoyISO();
  const cuotas = (await cuotasDe(id)).map((c) => conEstadoVisual(c, hoy));
  prestamo.cuotas = cuotas;
  return prestamo;
}

async function actualizarEstadoPrestamo(prestamoId) {
  const prestamo = await uno('SELECT estado FROM prestamos WHERE id = $1', [prestamoId]);
  if (!prestamo || prestamo.estado === 'cancelado') return;
  const cuotas = await q('SELECT estado FROM cuotas WHERE prestamo_id = $1', [prestamoId]);
  const todasPagadas = cuotas.length > 0 && cuotas.every((c) => c.estado === 'pagada');
  await pool.query('UPDATE prestamos SET estado = $1 WHERE id = $2', [todasPagadas ? 'pagado' : 'activo', prestamoId]);
}

function manejarErrores(fn) {
  return (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor' });
    });
  };
}

// ---------- Clientes ----------

app.get('/api/clientes', manejarErrores(async (req, res) => {
  const hoy = hoyISO();
  const clientes = await q(`
    SELECT c.*,
      COALESCE(SUM(CASE WHEN cu.estado = 'pendiente' THEN cu.monto ELSE 0 END), 0) AS saldo_pendiente,
      COALESCE(SUM(CASE WHEN cu.estado = 'pendiente' AND cu.fecha_vencimiento < $1 THEN cu.monto ELSE 0 END), 0) AS saldo_vencido,
      COUNT(DISTINCT p.id)::int AS num_prestamos
    FROM clientes c
    LEFT JOIN prestamos p ON p.cliente_id = c.id AND p.estado != 'cancelado'
    LEFT JOIN cuotas cu ON cu.prestamo_id = p.id
    GROUP BY c.id
    ORDER BY LOWER(c.nombre)
  `, [hoy]);
  res.json(clientes);
}));

app.get('/api/clientes/:id', manejarErrores(async (req, res) => {
  const cliente = await uno('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  const hoy = hoyISO();
  const prestamos = await q('SELECT * FROM prestamos WHERE cliente_id = $1 ORDER BY fecha_inicio DESC', [cliente.id]);
  for (const p of prestamos) {
    p.cuotas = (await cuotasDe(p.id)).map((c) => conEstadoVisual(c, hoy));
  }
  cliente.prestamos = prestamos;
  res.json(cliente);
}));

app.post('/api/clientes', manejarErrores(async (req, res) => {
  const { nombre, dni, telefono, notas } = req.body || {};
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const cliente = await uno(
    'INSERT INTO clientes (nombre, dni, telefono, notas) VALUES ($1, $2, $3, $4) RETURNING *',
    [nombre.trim(), dni || null, telefono || null, notas || null]
  );
  res.status(201).json(cliente);
}));

app.put('/api/clientes/:id', manejarErrores(async (req, res) => {
  const existe = await uno('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
  if (!existe) return res.status(404).json({ error: 'Cliente no encontrado' });
  const { nombre, dni, telefono, notas } = req.body || {};
  const cliente = await uno(
    'UPDATE clientes SET nombre = $1, dni = $2, telefono = $3, notas = $4 WHERE id = $5 RETURNING *',
    [
      nombre !== undefined && nombre.trim() ? nombre.trim() : existe.nombre,
      dni !== undefined ? dni : existe.dni,
      telefono !== undefined ? telefono : existe.telefono,
      notas !== undefined ? notas : existe.notas,
      req.params.id,
    ]
  );
  res.json(cliente);
}));

app.delete('/api/clientes/:id', manejarErrores(async (req, res) => {
  await pool.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

// ---------- Prestamos ----------

app.get('/api/prestamos', manejarErrores(async (req, res) => {
  const hoy = hoyISO();
  const prestamos = await q(`
    SELECT p.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
    FROM prestamos p JOIN clientes c ON c.id = p.cliente_id
    ORDER BY p.fecha_inicio DESC
  `);
  for (const p of prestamos) {
    const cuotas = (await cuotasDe(p.id)).map((c) => conEstadoVisual(c, hoy));
    p.cuotas = cuotas;
    const pendientes = cuotas.filter((c) => c.estado === 'pendiente');
    p.proxima_cuota = pendientes.slice().sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))[0] || null;
    p.tiene_vencidas = pendientes.some((c) => c.estado_visual === 'vencida');
  }
  res.json(prestamos);
}));

app.get('/api/prestamos/:id', manejarErrores(async (req, res) => {
  const prestamo = await prestamoConCuotas(req.params.id);
  if (!prestamo) return res.status(404).json({ error: 'Prestamo no encontrado' });
  res.json(prestamo);
}));

async function crearPrestamoConCuotas(clienteId, datos) {
  const { capital, tasa_interes, tipo_pago, num_cuotas, frecuencia, fecha_inicio, notas } = datos;

  const cap = Number(capital);
  const tasa = Number(tasa_interes) || 0;
  if (!cap || cap <= 0) {
    const err = new Error('El capital debe ser mayor a 0');
    err.status = 400;
    throw err;
  }

  const esUnico = tipo_pago !== 'cuotas';
  const nCuotas = esUnico ? 1 : Math.max(1, parseInt(num_cuotas, 10) || 1);
  const frec = esUnico ? 'unico' : (frecuencia || 'mensual');
  const inicio = fecha_inicio || hoyISO();

  const montoTotal = redondear(cap * (1 + tasa / 100));
  const ganancia = redondear(montoTotal - cap);

  const prestamo = await uno(`
    INSERT INTO prestamos (cliente_id, capital, tasa_interes, monto_total, ganancia, tipo_pago, num_cuotas, frecuencia, fecha_inicio, estado, notas)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'activo', $10)
    RETURNING *
  `, [clienteId, cap, tasa, montoTotal, ganancia, esUnico ? 'unico' : 'cuotas', nCuotas, frec, inicio, notas || null]);

  const fechas = generarFechasCuotas(inicio, nCuotas, frec);
  const montoCuotaBase = redondear(montoTotal / nCuotas);
  const capitalCuotaBase = redondear(cap / nCuotas);
  const gananciaCuotaBase = redondear(ganancia / nCuotas);

  let sumaMonto = 0, sumaCapital = 0, sumaGanancia = 0;
  for (let idx = 0; idx < fechas.length; idx++) {
    const esUltima = idx === fechas.length - 1;
    const monto = esUltima ? redondear(montoTotal - sumaMonto) : montoCuotaBase;
    const cap_c = esUltima ? redondear(cap - sumaCapital) : capitalCuotaBase;
    const gan_c = esUltima ? redondear(ganancia - sumaGanancia) : gananciaCuotaBase;
    sumaMonto = redondear(sumaMonto + monto);
    sumaCapital = redondear(sumaCapital + cap_c);
    sumaGanancia = redondear(sumaGanancia + gan_c);
    await pool.query(`
      INSERT INTO cuotas (prestamo_id, numero, monto, capital, ganancia, fecha_vencimiento, estado)
      VALUES ($1, $2, $3, $4, $5, $6, 'pendiente')
    `, [prestamo.id, idx + 1, monto, cap_c, gan_c, fechas[idx]]);
  }

  return prestamo.id;
}

app.post('/api/prestamos', manejarErrores(async (req, res) => {
  const { cliente_id, ...datos } = req.body || {};
  if (!cliente_id) return res.status(400).json({ error: 'Falta el cliente' });
  const cliente = await uno('SELECT * FROM clientes WHERE id = $1', [cliente_id]);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  let prestamoId;
  try {
    prestamoId = await crearPrestamoConCuotas(cliente.id, datos);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }

  res.status(201).json(await prestamoConCuotas(prestamoId));
}));

app.put('/api/prestamos/:id/cancelar', manejarErrores(async (req, res) => {
  const prestamo = await uno('SELECT * FROM prestamos WHERE id = $1', [req.params.id]);
  if (!prestamo) return res.status(404).json({ error: 'Prestamo no encontrado' });
  await pool.query("UPDATE prestamos SET estado = 'cancelado' WHERE id = $1", [req.params.id]);
  res.json(await prestamoConCuotas(req.params.id));
}));

app.delete('/api/prestamos/:id', manejarErrores(async (req, res) => {
  await pool.query('DELETE FROM prestamos WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

// ---------- Cuotas ----------

app.get('/api/cuotas', manejarErrores(async (req, res) => {
  const hoy = hoyISO();
  const cuotas = await q(`
    SELECT cu.*, p.cliente_id, p.id AS prestamo_id, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
    FROM cuotas cu
    JOIN prestamos p ON p.id = cu.prestamo_id
    JOIN clientes c ON c.id = p.cliente_id
    WHERE cu.estado = 'pendiente' AND p.estado != 'cancelado'
    ORDER BY cu.fecha_vencimiento ASC
  `);
  res.json(cuotas.map((c) => conEstadoVisual(c, hoy)));
}));

app.put('/api/cuotas/:id/pagar', manejarErrores(async (req, res) => {
  const cuota = await uno('SELECT * FROM cuotas WHERE id = $1', [req.params.id]);
  if (!cuota) return res.status(404).json({ error: 'Cuota no encontrada' });
  const montoPagado = req.body && req.body.monto_pagado != null ? Number(req.body.monto_pagado) : cuota.monto;
  const fechaPago = (req.body && req.body.fecha_pago) || hoyISO();
  await pool.query("UPDATE cuotas SET estado = 'pagada', fecha_pago = $1, monto_pagado = $2 WHERE id = $3", [fechaPago, montoPagado, cuota.id]);
  await actualizarEstadoPrestamo(cuota.prestamo_id);
  res.json(await prestamoConCuotas(cuota.prestamo_id));
}));

app.put('/api/cuotas/:id/deshacer', manejarErrores(async (req, res) => {
  const cuota = await uno('SELECT * FROM cuotas WHERE id = $1', [req.params.id]);
  if (!cuota) return res.status(404).json({ error: 'Cuota no encontrada' });
  await pool.query("UPDATE cuotas SET estado = 'pendiente', fecha_pago = NULL, monto_pagado = NULL WHERE id = $1", [cuota.id]);
  await actualizarEstadoPrestamo(cuota.prestamo_id);
  res.json(await prestamoConCuotas(cuota.prestamo_id));
}));

app.get('/api/cuotas/:id/whatsapp', manejarErrores(async (req, res) => {
  const cuota = await uno(`
    SELECT cu.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
    FROM cuotas cu
    JOIN prestamos p ON p.id = cu.prestamo_id
    JOIN clientes c ON c.id = p.cliente_id
    WHERE cu.id = $1
  `, [req.params.id]);
  if (!cuota) return res.status(404).json({ error: 'Cuota no encontrada' });
  if (!cuota.cliente_telefono) return res.status(400).json({ error: 'El cliente no tiene telefono cargado' });

  const fechaFmt = new Date(cuota.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR');
  const montoFmt = Number(cuota.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 });
  const hoy = hoyISO();
  let saludo;
  if (cuota.fecha_vencimiento < hoy) saludo = `Hola ${cuota.cliente_nombre}! Te escribo para recordarte que tenes un pago vencido.`;
  else if (cuota.fecha_vencimiento === hoy) saludo = `Hola ${cuota.cliente_nombre}! Te recuerdo que hoy vence tu pago.`;
  else saludo = `Hola ${cuota.cliente_nombre}! Te recuerdo que se acerca la fecha de tu pago.`;

  const mensaje = `${saludo}\n\nMonto: $${montoFmt}\nFecha: ${fechaFmt}${cuota.numero ? `\nCuota N°${cuota.numero}` : ''}\n\nGracias!`;
  res.json({ link: linkWhatsApp(cuota.cliente_telefono, mensaje), mensaje });
}));

// ---------- Solicitudes de prestamo (pedidas desde el formulario publico) ----------
// Estas rutas SI requieren usuario y contraseña (estan despues del middleware
// de autenticacion). Solo la carga del formulario y el POST de arriba son
// publicos.

app.get('/api/solicitudes', manejarErrores(async (req, res) => {
  const solicitudes = await q('SELECT * FROM solicitudes ORDER BY creado_en DESC');
  res.json(solicitudes);
}));

app.put('/api/solicitudes/:id/rechazar', manejarErrores(async (req, res) => {
  const solicitud = await uno('SELECT * FROM solicitudes WHERE id = $1', [req.params.id]);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
  const actualizada = await uno("UPDATE solicitudes SET estado = 'rechazada' WHERE id = $1 RETURNING *", [req.params.id]);
  res.json(actualizada);
}));

app.put('/api/solicitudes/:id/aceptar', manejarErrores(async (req, res) => {
  const solicitud = await uno('SELECT * FROM solicitudes WHERE id = $1', [req.params.id]);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
  if (solicitud.estado !== 'pendiente') return res.status(400).json({ error: 'Esta solicitud ya fue procesada' });

  const { cliente_id, capital, tasa_interes, tipo_pago, num_cuotas, frecuencia, fecha_inicio, notas } = req.body || {};

  let clienteId = cliente_id;
  if (!clienteId) {
    // No se eligio un cliente existente: se crea uno nuevo con los datos de la solicitud.
    const nuevoCliente = await uno(
      'INSERT INTO clientes (nombre, dni, telefono, notas) VALUES ($1, $2, $3, $4) RETURNING *',
      [solicitud.nombre, solicitud.dni, solicitud.telefono, solicitud.referido_por ? `Referido por: ${solicitud.referido_por}` : null]
    );
    clienteId = nuevoCliente.id;
  }

  let prestamoId;
  try {
    prestamoId = await crearPrestamoConCuotas(clienteId, {
      capital: capital ?? solicitud.monto_solicitado,
      tasa_interes,
      tipo_pago,
      num_cuotas: num_cuotas ?? solicitud.num_cuotas_preferido,
      frecuencia: frecuencia ?? solicitud.frecuencia_preferida,
      fecha_inicio,
      notas,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }

  const actualizada = await uno(
    "UPDATE solicitudes SET estado = 'aceptada', cliente_id = $1, prestamo_id = $2 WHERE id = $3 RETURNING *",
    [clienteId, prestamoId, req.params.id]
  );
  res.json(Object.assign({}, actualizada, { prestamo: await prestamoConCuotas(prestamoId) }));
}));

app.get('/api/solicitudes/:id/whatsapp', manejarErrores(async (req, res) => {
  const solicitud = await uno('SELECT * FROM solicitudes WHERE id = $1', [req.params.id]);
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

  let mensaje;
  if (solicitud.estado === 'aceptada') {
    mensaje = `Hola ${solicitud.nombre}! Te escribo para contarte que tu solicitud de préstamo fue APROBADA. En breve coordinamos los detalles de la entrega. Gracias!`;
  } else if (solicitud.estado === 'rechazada') {
    mensaje = `Hola ${solicitud.nombre}! Te escribo para contarte que por el momento no vamos a poder darte el préstamo que solicitaste. Gracias por tu interés!`;
  } else {
    mensaje = `Hola ${solicitud.nombre}! Recibimos tu solicitud de préstamo, la estamos revisando y te contestamos a la brevedad. Gracias!`;
  }
  res.json({ link: linkWhatsApp(solicitud.telefono, mensaje), mensaje });
}));

// ---------- Dashboard ----------

app.get('/api/dashboard', manejarErrores(async (req, res) => {
  const hoy = hoyISO();

  const totales = await uno(`
    SELECT
      COALESCE(SUM(capital), 0) AS total_invertido,
      COALESCE(SUM(ganancia), 0) AS ganancia_proyectada
    FROM prestamos WHERE estado != 'cancelado'
  `);

  const cuotasTotales = await uno(`
    SELECT
      COALESCE(SUM(CASE WHEN cu.estado = 'pagada' THEN cu.capital ELSE 0 END), 0) AS capital_recuperado,
      COALESCE(SUM(CASE WHEN cu.estado = 'pagada' THEN cu.ganancia ELSE 0 END), 0) AS ganancia_cobrada,
      COALESCE(SUM(CASE WHEN cu.estado = 'pendiente' THEN cu.monto ELSE 0 END), 0) AS por_cobrar,
      COALESCE(SUM(CASE WHEN cu.estado = 'pendiente' AND cu.fecha_vencimiento < $1 THEN cu.monto ELSE 0 END), 0) AS vencido,
      COALESCE(SUM(CASE WHEN cu.estado = 'pendiente' AND cu.fecha_vencimiento = $1 THEN cu.monto ELSE 0 END), 0) AS vence_hoy
    FROM cuotas cu JOIN prestamos p ON p.id = cu.prestamo_id
    WHERE p.estado != 'cancelado'
  `, [hoy]);

  const clientesActivosRow = await uno(`
    SELECT COUNT(DISTINCT cliente_id) AS n FROM prestamos WHERE estado = 'activo'
  `);

  const proximosVencimientos = await q(`
    SELECT cu.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, p.id AS prestamo_id
    FROM cuotas cu
    JOIN prestamos p ON p.id = cu.prestamo_id
    JOIN clientes c ON c.id = p.cliente_id
    WHERE cu.estado = 'pendiente' AND p.estado != 'cancelado'
    ORDER BY cu.fecha_vencimiento ASC
    LIMIT 20
  `);

  res.json({
    total_invertido: Number(totales.total_invertido),
    ganancia_proyectada: Number(totales.ganancia_proyectada),
    capital_recuperado: Number(cuotasTotales.capital_recuperado),
    ganancia_cobrada: Number(cuotasTotales.ganancia_cobrada),
    por_cobrar: Number(cuotasTotales.por_cobrar),
    vencido: Number(cuotasTotales.vencido),
    vence_hoy: Number(cuotasTotales.vence_hoy),
    clientes_activos: Number(clientesActivosRow.n),
    proximos_vencimientos: proximosVencimientos.map((c) => conEstadoVisual(c, hoy)),
  });
}));

// ---------- Arranque ----------

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log('==================================================');
      console.log('  Sistema de Prestamos - servidor andando');
      console.log(`  Puerto: ${PORT}`);
      console.log('  Base de datos: conectada correctamente');
      console.log('==================================================');
    });
  })
  .catch((err) => {
    console.error('No se pudo conectar/inicializar la base de datos:', err.message);
    process.exit(1);
  });
