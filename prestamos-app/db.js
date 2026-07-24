// db.js - conexion a la base de datos COMPARTIDA (Postgres, por ejemplo Neon).
// Esto reemplaza al archivo local: ahora los datos viven en un solo lugar en
// internet, para que se vean iguales desde cualquier computadora o celular.

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('==================================================');
  console.error('  Falta la variable de entorno DATABASE_URL.');
  console.error('  Tenes que configurarla con la direccion de tu base');
  console.error('  de datos (por ejemplo, la de Neon).');
  console.error('  En tu compu: creá un archivo .env con esa variable.');
  console.error('  En Render: cargala en "Environment".');
  console.error('==================================================');
  process.exit(1);
}

// Neon (y la mayoria de los hosting de Postgres) requieren SSL.
// Para una base local (ej: localhost, usada solo para pruebas) no hace falta.
const esLocal = /localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: esLocal ? false : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      dni TEXT,
      telefono TEXT,
      notas TEXT,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS prestamos (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      capital DOUBLE PRECISION NOT NULL,
      tasa_interes DOUBLE PRECISION NOT NULL DEFAULT 0,
      monto_total DOUBLE PRECISION NOT NULL,
      ganancia DOUBLE PRECISION NOT NULL,
      tipo_pago TEXT NOT NULL DEFAULT 'unico',
      num_cuotas INTEGER NOT NULL DEFAULT 1,
      frecuencia TEXT NOT NULL DEFAULT 'unico',
      fecha_inicio TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'activo',
      notas TEXT,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cuotas (
      id SERIAL PRIMARY KEY,
      prestamo_id INTEGER NOT NULL REFERENCES prestamos(id) ON DELETE CASCADE,
      numero INTEGER NOT NULL,
      monto DOUBLE PRECISION NOT NULL,
      capital DOUBLE PRECISION NOT NULL DEFAULT 0,
      ganancia DOUBLE PRECISION NOT NULL DEFAULT 0,
      fecha_vencimiento TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      fecha_pago TEXT,
      monto_pagado DOUBLE PRECISION
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS solicitudes (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      dni TEXT,
      telefono TEXT NOT NULL,
      monto_solicitado DOUBLE PRECISION,
      tipo_pago_preferido TEXT,
      num_cuotas_preferido INTEGER,
      frecuencia_preferida TEXT,
      referido_por TEXT,
      mensaje TEXT,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
      prestamo_id INTEGER REFERENCES prestamos(id) ON DELETE SET NULL,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_cuotas_prestamo ON cuotas(prestamo_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_cuotas_vencimiento ON cuotas(fecha_vencimiento);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_prestamos_cliente ON prestamos(cliente_id);');
  await pool.query("CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes(estado);");
}

module.exports = { pool, initDb };
