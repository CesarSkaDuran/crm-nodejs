const mysql = require('mysql2/promise');
require('dotenv').config();
(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  const [r] = await c.query(
    "SELECT id, codigo, nombre FROM plan_cuentas WHERE nombre LIKE '%PROVISI%' OR codigo LIKE '1.3.99%' OR codigo LIKE '5.1.99%' OR codigo LIKE '5.3.99%' ORDER BY codigo",
  );
  r.forEach((x) => console.log(x.id, '|', x.codigo, '|', x.nombre));
  await c.end();
})();
