const m = require('mysql2/promise');
(async () => {
  const db = await m.createConnection({ host: 'localhost', user: 'root', password: '', database: 'crm_db' });
  const [lin] = await db.query(
    `SELECT p.codigo, p.nombre, l.debito, l.credito, l.descripcion
     FROM contabilidad l JOIN plan_cuentas p ON p.id = l.cuenta_contable_id
     WHERE l.asentado_id = 124`,
  );
  console.log(JSON.stringify(lin, null, 1));
  const [[b]] = await db.query('SELECT monto FROM bancos WHERE id=2');
  console.log('banco:', b.monto);
  await db.end();
})();
