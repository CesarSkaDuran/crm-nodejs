const mysql = require('mysql2/promise');
const fs = require('fs');
const path = 'D:\\Descargas\\contabilidad (4).sql';

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    multipleStatements: false,
  });

  await conn.query('CREATE DATABASE IF NOT EXISTS contabilidad_vieja');
  console.log('Base contabilidad_vieja creada');
  await conn.query('USE contabilidad_vieja');

  let sql = fs.readFileSync(path, 'latin1');

  // Eliminar comentarios condicionales, de línea y de bloque
  sql = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .replace(/^\s*#.*$/gm, '')
    .replace(/^\s*$/gm, '');

  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (let i = 0; i < statements.length; i++) {
    const st = statements[i] + ';';
    try {
      await conn.query(st);
    } catch (err) {
      console.error(`Error en sentencia ${i + 1}:`, err.message);
    }
  }

  console.log(`Procesadas ${statements.length} sentencias`);
  await conn.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
