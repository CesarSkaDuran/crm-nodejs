const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  // Bancos actuales
  const [bancos] = await c.query('SELECT id, nombre, cuenta_id, monto FROM bancos');
  console.log('Bancos antes:');
  bancos.forEach((b) => console.log(`  ${b.id} ${b.nombre} cuenta_id=${b.cuenta_id} monto=${b.monto}`));

  // Cuentas bancarias disponibles
  const [cuentas] = await c.query(
    "SELECT id, codigo, nombre FROM plan_cuentas WHERE codigo LIKE '1.1.10%' OR codigo LIKE '1.1.05%' ORDER BY codigo",
  );
  console.log('\nCuentas bancarias disponibles:');
  cuentas.forEach((c) => console.log(`  ${c.id} ${c.codigo} ${c.nombre}`));

  // Bancolombia: asignar 1.1.10.05 (MONEDA NACIONAL)
  const cuentaBancolombia = cuentas.find((c) => c.codigo === '1.1.10.05');
  if (cuentaBancolombia) {
    await c.query('UPDATE bancos SET cuenta_id=? WHERE nombre LIKE ? AND cuenta_id=?', [
      cuentaBancolombia.codigo,
      '%bancolombia%',
      '1',
    ]);
    console.log(`\nBancolombia actualizada a cuenta ${cuentaBancolombia.codigo} (${cuentaBancolombia.nombre})`);
  }

  // Caja general: normalizar cuenta_id a código PUC con puntos (1.1.05.05)
  const cuentaCaja = cuentas.find((c) => c.codigo === '1.1.05.05');
  if (cuentaCaja) {
    await c.query('UPDATE bancos SET cuenta_id=? WHERE nombre LIKE ? AND cuenta_id=?', [
      cuentaCaja.codigo,
      '%caja general%',
      '1105',
    ]);
    console.log(`Caja general actualizada a cuenta ${cuentaCaja.codigo} (${cuentaCaja.nombre})`);
  }

  // Verificar
  const [bancos2] = await c.query('SELECT id, nombre, cuenta_id, monto FROM bancos');
  console.log('\nBancos después:');
  bancos2.forEach((b) => console.log(`  ${b.id} ${b.nombre} cuenta_id=${b.cuenta_id} monto=${b.monto}`));

  await c.end();
})().catch(console.error);
