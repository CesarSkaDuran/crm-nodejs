/**
 * Agrega las columnas interes_acumulado y fecha_ultimo_calculo_interes
 * a la tabla cuotas_credito para soportar acumulación persistente de interés moratorio.
 *
 * Uso: node scripts/migrate-interes-acumulado.js
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'crm_db',
    multipleStatements: true,
  });

  console.log('Agregando columnas interes_acumulado y fecha_ultimo_calculo_interes...');

  // Verificar si las columnas ya existen
  const [cols] = await conn.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cuotas_credito' AND COLUMN_NAME IN ('interes_acumulado','fecha_ultimo_calculo_interes')",
    [process.env.DB_DATABASE || 'crm_db'],
  );

  const existing = cols.map((c) => c.COLUMN_NAME);

  if (!existing.includes('interes_acumulado')) {
    await conn.query(
      "ALTER TABLE cuotas_credito ADD COLUMN interes_acumulado DECIMAL(15,2) DEFAULT 0 COMMENT 'Interés moratorio acumulado persistente (no se suma al saldo)'",
    );
    console.log('  ✓ Columna interes_acumulado agregada');
  } else {
    console.log('  - Columna interes_acumulado ya existe');
  }

  if (!existing.includes('fecha_ultimo_calculo_interes')) {
    await conn.query(
      "ALTER TABLE cuotas_credito ADD COLUMN fecha_ultimo_calculo_interes DATE NULL COMMENT 'Fecha hasta la cual se ha calculado el interés acumulado'",
    );
    console.log('  ✓ Columna fecha_ultimo_calculo_interes agregada');
  } else {
    console.log('  - Columna fecha_ultimo_calculo_interes ya existe');
  }

  // Inicializar fecha_ultimo_calculo_interes con fecha_pago_oportuno para cuotas existentes
  await conn.query(
    "UPDATE cuotas_credito SET fecha_ultimo_calculo_interes = fecha_pago_oportuno WHERE fecha_ultimo_calculo_interes IS NULL",
  );
  console.log('  ✓ fecha_ultimo_calculo_interes inicializada con fecha_pago_oportuno');

  await conn.end();
  console.log('Migración completada.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
