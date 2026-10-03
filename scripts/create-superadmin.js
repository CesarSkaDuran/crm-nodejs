const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// Uso: node scripts/create-superadmin.js
// Variables: DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME; SUPERADMIN_PASSWORD requerida al crear
(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'crm_db',
  });

  // 1) Asegurar que el enum de roles acepte 'superadmin'
  await c.query(`
    ALTER TABLE usuarios
    MODIFY COLUMN rol ENUM('superadmin','admin','contador','vendedor','consulta')
    NOT NULL DEFAULT 'consulta'
  `);

  // 2) Empresa de plataforma SYS (independiente de los clientes)
  const [[sys]] = await c.query(`SELECT id FROM empresas WHERE codigo = 'SYS' LIMIT 1`);
  let empresaId = sys?.id;
  if (!empresaId) {
    const [r] = await c.query(
      `INSERT INTO empresas (codigo, nombre, pais, estado) VALUES ('SYS', 'Administración del Sistema', 'Colombia', 1)`,
    );
    empresaId = r.insertId;
    console.log('Empresa SYS creada con id', empresaId);
  } else {
    console.log('Empresa SYS ya existe con id', empresaId);
  }

  // 3) Usuario superadmin
  const [[existe]] = await c.query(
    `SELECT id FROM usuarios WHERE usuario = 'superadmin' OR (email = 'superadmin@sistema.local' AND empresa_id = ?) LIMIT 1`,
    [empresaId],
  );

  if (existe) {
    await c.query(
      `UPDATE usuarios SET rol = 'superadmin', empresa_id = ?, estado = 1 WHERE id = ?`,
      [empresaId, existe.id],
    );
    console.log(`Usuario superadmin ya existía (id ${existe.id}); rol/empresa actualizados. Contraseña NO cambiada.`);
  } else {
    const password = process.env.SUPERADMIN_PASSWORD;
    if (!password || password.length < 12) {
      await c.end();
      throw new Error('Defina SUPERADMIN_PASSWORD con al menos 12 caracteres antes de crear el usuario');
    }
    const hash = await bcrypt.hash(password, 10);
    const [r] = await c.query(
      `INSERT INTO usuarios (empresa_id, nombre, usuario, email, password, rol, estado)
       VALUES (?, 'Superadmin', 'superadmin', 'superadmin@sistema.local', ?, 'superadmin', 1)`,
      [empresaId, hash],
    );
    console.log('Usuario superadmin creado con id', r.insertId);
    console.log('Login → código empresa: SYS');
    console.log('Login → email:', 'superadmin@sistema.local');
    console.log('Contraseña establecida desde SUPERADMIN_PASSWORD; cámbiela tras entrar.');
  }

  await c.end();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
