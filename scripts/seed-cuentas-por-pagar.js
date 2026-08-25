const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  const empresaId = 1;

  // Tipo de comprobante para pagos
  const [tipoRes] = await conn.execute(
    "INSERT INTO tipo_comprobantes (empresa_id, nombre, simple, prefijo, consecutivo, tipo, estado) VALUES (?, 'Comprobante de pago', 'CP', 'CP', 2, 1, 1)",
    [empresaId],
  );
  const tipoId = tipoRes.insertId;

  // Cuentas contables
  const [cajaRes] = await conn.execute(
    "INSERT INTO plan_cuentas (empresa_id, codigo, nombre, clasificacion, clase, naturaleza, tipo, estado) VALUES (?, '1105', 'Caja general', 1, '1', 'D', 1, 1)",
    [empresaId],
  );
  const cajaId = cajaRes.insertId;

  const [provRes] = await conn.execute(
    "INSERT INTO plan_cuentas (empresa_id, codigo, nombre, clasificacion, clase, naturaleza, tipo, estado) VALUES (?, '2205', 'Proveedores nacionales', 1, '2', 'C', 1, 1)",
    [empresaId],
  );
  const cuentaProveedorId = provRes.insertId;

  // Proveedor
  const [terRes] = await conn.execute(
    "INSERT INTO terceros (empresa_id, codigo, tipo_terceros, tipo_naturaleza, nombre, documento, cuenta_contable_id, estado) VALUES (?, 'PRV001', 2, 2, 'Proveedor de prueba S.A.S.', '900123456', ?, 1)",
    [empresaId, cuentaProveedorId],
  );
  const proveedorId = terRes.insertId;

  // Asiento de compra (para generar deuda)
  const [asientoRes] = await conn.execute(
    "INSERT INTO asentados (empresa_id, consecutivo, tipo, fecha, descripcion, total_debito, total_credito, usuario, estado) VALUES (?, 'CP0001', ?, '2026-08-20', 'Compra de prueba', 1000000, 1000000, 'admin', 1)",
    [empresaId, tipoId],
  );
  const asientoId = asientoRes.insertId;

  // Líneas del asiento
  await conn.execute(
    "INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado) VALUES (?, ?, ?, ?, 'Compra proveedor de prueba', 1000000, 1000000, 0, 'C', 'CP0001', '2026-08-20', 'admin', 1)",
    [empresaId, asientoId, cuentaProveedorId, proveedorId],
  );

  await conn.execute(
    "INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado) VALUES (?, ?, ?, ?, 'Salida caja', 1000000, 0, 1000000, 'D', 'CP0001', '2026-08-20', 'admin', 1)",
    [empresaId, asientoId, cajaId, null],
  );

  // Segundo proveedor con deuda pendiente (muestra saldo)
  const [prov2Res] = await conn.execute(
    "INSERT INTO plan_cuentas (empresa_id, codigo, nombre, clasificacion, clase, naturaleza, tipo, estado) VALUES (?, '2210', 'Proveedores locales', 1, '2', 'C', 1, 1)",
    [empresaId],
  );
  const cuentaProveedor2Id = prov2Res.insertId;

  const [ter2Res] = await conn.execute(
    "INSERT INTO terceros (empresa_id, codigo, tipo_terceros, tipo_naturaleza, nombre, documento, cuenta_contable_id, estado) VALUES (?, 'PRV002', 2, 2, 'Papelería Central Ltda.', '800987654', ?, 1)",
    [empresaId, cuentaProveedor2Id],
  );
  const proveedor2Id = ter2Res.insertId;

  const [asiento2Res] = await conn.execute(
    "INSERT INTO asentados (empresa_id, consecutivo, tipo, fecha, descripcion, total_debito, total_credito, usuario, estado) VALUES (?, 'CP0002', ?, '2026-08-22', 'Compra papelería', 250000, 250000, 'admin', 1)",
    [empresaId, tipoId],
  );
  const asiento2Id = asiento2Res.insertId;

  await conn.execute(
    "INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado) VALUES (?, ?, ?, ?, 'Compra papelería', 250000, 250000, 0, 'C', 'CP0002', '2026-08-22', 'admin', 1)",
    [empresaId, asiento2Id, cuentaProveedor2Id, proveedor2Id],
  );

  await conn.execute(
    "INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado) VALUES (?, ?, ?, ?, 'Salida caja', 250000, 0, 250000, 'D', 'CP0002', '2026-08-22', 'admin', 1)",
    [empresaId, asiento2Id, cajaId, null],
  );

  // Tercer proveedor con parte pagada
  const [prov3Res] = await conn.execute(
    "INSERT INTO plan_cuentas (empresa_id, codigo, nombre, clasificacion, clase, naturaleza, tipo, estado) VALUES (?, '2215', 'Cuentas por pagar proveedores', 1, '2', 'C', 1, 1)",
    [empresaId],
  );
  const cuentaProveedor3Id = prov3Res.insertId;

  const [ter3Res] = await conn.execute(
    "INSERT INTO terceros (empresa_id, codigo, tipo_terceros, tipo_naturaleza, nombre, documento, cuenta_contable_id, estado) VALUES (?, 'PRV003', 2, 2, 'Servicios Tecnológicos S.A.S.', '900555111', ?, 1)",
    [empresaId, cuentaProveedor3Id],
  );
  const proveedor3Id = ter3Res.insertId;

  // Deuda
  const [asiento3Res] = await conn.execute(
    "INSERT INTO asentados (empresa_id, consecutivo, tipo, fecha, descripcion, total_debito, total_credito, usuario, estado) VALUES (?, 'CP0003', ?, '2026-08-15', 'Servicios tecnología', 500000, 500000, 'admin', 1)",
    [empresaId, tipoId],
  );
  const asiento3Id = asiento3Res.insertId;

  await conn.execute(
    "INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado) VALUES (?, ?, ?, ?, 'Servicios tecnología', 500000, 500000, 0, 'C', 'CP0003', '2026-08-15', 'admin', 1)",
    [empresaId, asiento3Id, cuentaProveedor3Id, proveedor3Id],
  );

  await conn.execute(
    "INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado) VALUES (?, ?, ?, ?, 'Salida banco', 500000, 0, 500000, 'D', 'CP0003', '2026-08-15', 'admin', 1)",
    [empresaId, asiento3Id, cajaId, null],
  );

  // Pago parcial del tercer proveedor
  const [pagoRes] = await conn.execute(
    "INSERT INTO asentados (empresa_id, consecutivo, tipo, fecha, descripcion, total_debito, total_credito, usuario, estado) VALUES (?, 'CP0004', ?, '2026-08-24', 'Pago parcial tecnología', 200000, 200000, 'admin', 1)",
    [empresaId, tipoId],
  );
  const pagoId = pagoRes.insertId;

  await conn.execute(
    "INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado) VALUES (?, ?, ?, ?, 'Pago parcial tecnología', 200000, 200000, 0, 'C', 'CP0004', '2026-08-24', 'admin', 1)",
    [empresaId, pagoId, cuentaProveedor3Id, proveedor3Id],
  );

  await conn.execute(
    "INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado) VALUES (?, ?, ?, ?, 'Salida caja', 200000, 0, 200000, 'D', 'CP0004', '2026-08-24', 'admin', 1)",
    [empresaId, pagoId, cajaId, null],
  );

  console.log('Datos de prueba creados:');
  console.log({ tipoId, cajaId, cuentaProveedorId, proveedorId, proveedor2Id, proveedor3Id });

  await conn.end();
})();
