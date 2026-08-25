const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  try {
    await conn.execute("DELETE FROM contabilidad WHERE consecutivo LIKE 'CP000%'");
    await conn.execute("DELETE FROM asentados WHERE consecutivo LIKE 'CP000%'");

    const [e] = await conn.execute(
      "INSERT INTO plan_cuentas (empresa_id, codigo, nombre, clasificacion, clase, naturaleza, tipo, estado) VALUES (1, '61xx', 'Gastos de prueba', 1, '6', 'D', 1, 1)"
    );
    const expenseId = e.insertId;
    console.log('Gasto id:', expenseId);

    const inserts = [
      { con: 'CP0001', fecha: '2026-08-20', desc: 'Compra de prueba', v: 1000000, provId: 10, cuenta: 559 },
      { con: 'CP0002', fecha: '2026-08-22', desc: 'Compra papeleria', v: 250000, provId: 11, cuenta: 560 },
      { con: 'CP0003', fecha: '2026-08-15', desc: 'Servicios tecnologia', v: 500000, provId: 12, cuenta: 561 },
      { con: 'CP0004', fecha: '2026-08-24', desc: 'Pago parcial tecnologia', v: 200000, provId: 12, cuenta: 561 },
    ];

    for (const x of inserts) {
      const [a] = await conn.execute(
        'INSERT INTO asentados (empresa_id, consecutivo, tipo, fecha, descripcion, total_debito, total_credito, usuario, estado) VALUES (1, ?, 1, ?, ?, ?, ?, "admin", 1)',
        [x.con, x.fecha, x.desc, x.v, x.v]
      );
      const asientoId = a.insertId;

      await conn.execute(
        'INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado) VALUES (1, ?, ?, ?, ?, ?, 0, ?, "C", ?, ?, "admin", 1)',
        [asientoId, x.cuenta, x.provId, x.desc, x.v, x.v, x.con, x.fecha]
      );

      const cuentaBanco = x.con === 'CP0004' ? 558 : expenseId;
      await conn.execute(
        'INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado) VALUES (1, ?, ?, NULL, ?, ?, ?, 0, "D", ?, ?, "admin", 1)',
        [asientoId, cuentaBanco, x.desc, x.v, x.v, x.con, x.fecha]
      );
    }

    console.log('Corregido');
  } finally {
    await conn.end();
  }
})();
