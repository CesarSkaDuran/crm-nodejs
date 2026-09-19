const m = require('mysql2/promise');
(async () => {
  const db = await m.createConnection({ host: 'localhost', user: 'root', password: '', database: 'crm_db' });

  // Estado actual de las cuotas del credito 11 (cobro COP de prueba de 1000)
  const [cu] = await db.query(
    'SELECT id, numero_cuota, valor, abonado, saldo, estado, numero_recibo, asentado_id FROM cuotas_credito WHERE credito_id=11 ORDER BY numero_cuota',
  );
  console.log('cuotas cr11:', JSON.stringify(cu));
  const [[cr11]] = await db.query('SELECT saldo, cuotas_pagadas FROM creditos WHERE id=11');
  console.log('credito 11:', JSON.stringify(cr11));
  const [[b2]] = await db.query('SELECT monto FROM bancos WHERE id=2');
  console.log('banco 2:', b2.monto);
  await db.end();
})();
