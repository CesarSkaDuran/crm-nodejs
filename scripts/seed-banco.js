const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  try {
    const [existing] = await conn.query(
      "SELECT id, cuenta_id FROM bancos WHERE empresa_id = 1 AND cuenta_id = '1105'"
    );
    if (existing.length === 0) {
      await conn.execute(
        "INSERT INTO bancos (empresa_id, nombre, monto, monto_dia, tipo, cuenta_id, estado) VALUES (1, 'Caja general', 10000000, 0, 3, '1105', 1)"
      );
      console.log('Banco creado');
    } else {
      console.log('Banco ya existe');
    }

    const [rows] = await conn.query('SELECT id, nombre, cuenta_id, monto FROM bancos WHERE empresa_id = 1');
    console.log(rows);
  } finally {
    await conn.end();
  }
})();
