const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
    multipleStatements: false,
  });

  const EMPRESA_ID = 1;

  // Limpiar tablas destino
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  await conn.query('TRUNCATE TABLE contabilidad');
  await conn.query('TRUNCATE TABLE asentados');
  await conn.query('TRUNCATE TABLE terceros');
  await conn.query('TRUNCATE TABLE plan_cuentas');
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  // 1. Plan de cuentas
  console.log('Migrando plan de cuentas...');
  await conn.query(`
    INSERT IGNORE INTO plan_cuentas
      (id, empresa_id, codigo, nombre, clasificacion, clase, grupo, cuenta, naturaleza, tipo, axl, cuenta_padre_id, estado)
    SELECT
      id,
      ${EMPRESA_ID},
      codigo,
      nombre,
      COALESCE(clasificacion, 4),
      clase,
      grupo,
      cuenta,
      UPPER(COALESCE(naturaleza, 'D')),
      CASE tipo
        WHEN 'R' THEN 1
        WHEN 'N' THEN 2
        WHEN 'O' THEN 3
        ELSE 1
      END,
      COALESCE(axl, ''),
      NULL,
      1
    FROM contabilidad_vieja.plan_cuentas
    WHERE id IS NOT NULL
  `);

  // 2. Terceros
  console.log('Migrando terceros...');
  await conn.query(`
    INSERT INTO terceros
      (id, empresa_id, codigo, tipo_terceros, tipo_naturaleza, regimen, nombre, apellido, email, tipo_documento, documento, dv, ciudad, direccion, telefono, fecha_nacimiento, cupo, ruta, cuenta_contable_id, estado)
    SELECT
      id,
      ${EMPRESA_ID},
      COALESCE(codigo, CONCAT('TER', id)),
      COALESCE(tipo_terceros, 5),
      COALESCE(tipo_naturaleza, 1),
      COALESCE(regimen, 1),
      COALESCE(nombre, 'SIN NOMBRE'),
      NULLIF(apellido, 'NULL'),
      email,
      COALESCE(tipo_documento, 1),
      COALESCE(NULLIF(documento, 'NULL'), ''),
      COALESCE(NULLIF(dv, 'null'), ''),
      COALESCE(NULLIF(ciudad, 'NULL'), ''),
      COALESCE(NULLIF(direccion, 'NULL'), ''),
      COALESCE(NULLIF(telefono, 'NULL'), ''),
      NULLIF(fecha_nacimiento, ''),
      COALESCE(NULLIF(cupo, ''), 0),
      COALESCE(NULLIF(ruta, 'null'), ''),
      COALESCE(cuenta_contable_id, NULL),
      1
    FROM contabilidad_vieja.terceros
    WHERE id IS NOT NULL
  `);

  // 3. Asentados (cabeceras) agrupados por consecutivo
  console.log('Migrando asentados...');
  await conn.query(`
    INSERT INTO asentados
      (empresa_id, consecutivo, tipo, fecha, descripcion, total_debito, total_credito, usuario, estado)
    SELECT
      ${EMPRESA_ID},
      consecutivo,
      COALESCE(tipo, 1),
      MIN(COALESCE(date, created_at)),
      MAX(COALESCE(descripcion, consecutivo)),
      COALESCE(SUM(debito), 0),
      COALESCE(SUM(credito), 0),
      MAX(COALESCE(usuario, 'admin')),
      1
    FROM contabilidad_vieja.asentados
    WHERE consecutivo IS NOT NULL AND date IS NOT NULL
    GROUP BY consecutivo, tipo
  `);
  console.log('Cabeceras creadas');

  // 4. Contabilidad (líneas)
  console.log('Migrando contabilidad...');
  await conn.query(`
    INSERT INTO contabilidad
      (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado)
    SELECT
      ${EMPRESA_ID},
      a.id,
      p.id,
      t.id,
      v.descripcion,
      COALESCE(v.valor, 0),
      COALESCE(v.debito, 0),
      COALESCE(v.credito, 0),
      UPPER(COALESCE(v.naturaleza, 'D')),
      v.consecutivo,
      COALESCE(v.date, v.created_at),
      COALESCE(v.usuario, 'admin'),
      1
    FROM contabilidad_vieja.asentados v
    INNER JOIN asentados a
      ON a.consecutivo = v.consecutivo
      AND a.empresa_id = ${EMPRESA_ID}
    INNER JOIN contabilidad_vieja.plan_cuentas pc
      ON pc.id = CAST(v.cuenta_contable_id AS UNSIGNED)
    INNER JOIN plan_cuentas p
      ON p.codigo = pc.codigo
      AND p.empresa_id = ${EMPRESA_ID}
    LEFT JOIN terceros t
      ON t.id = v.tercero_id
      AND t.empresa_id = ${EMPRESA_ID}
    WHERE v.consecutivo IS NOT NULL AND v.date IS NOT NULL
  `);

  const [rows] = await conn.query('SELECT COUNT(*) AS total FROM contabilidad');
  console.log(`Líneas migradas: ${rows[0].total}`);

  await conn.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
