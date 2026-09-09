const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USERNAME || 'crm_user',
  password: process.env.DB_PASSWORD || 'crm_pass',
  database: process.env.DB_DATABASE || 'crm_db',
};

const impuestos = [
  { codigo: 'IVA', nombre: 'IVA (Impuesto al Valor Agregado)', porcentaje: 19.00, estado: 1 },
  { codigo: 'IVA_5', nombre: 'IVA 5%', porcentaje: 5.00, estado: 1 },
  { codigo: 'IVA_0', nombre: 'IVA 0% (Exento)', porcentaje: 0.00, estado: 1 },
  { codigo: 'ICA', nombre: 'ICA (Impuesto de Industria y Comercio)', porcentaje: 1.04, estado: 1 },
  { codigo: 'RENTA', nombre: 'Retención en la Fuente (Renta)', porcentaje: 8.00, estado: 1 },
  { codigo: 'IVA_RET', nombre: 'Retención IVA', porcentaje: 15.00, estado: 1 },
];

async function seed() {
  let connection;
  try {
    connection = await mysql.createConnection(config);

    // Obtener empresa DEMO
    const [empresas] = await connection.execute(
      'SELECT id FROM empresas WHERE codigo = ?',
      ['DEMO']
    );

    if (!empresas.length) {
      console.log('❌ Empresa DEMO no encontrada');
      process.exit(1);
    }

    const empresaId = empresas[0].id;

    // Limpiar datos existentes
    await connection.execute(
      'DELETE FROM impuestos WHERE empresa_id = ?',
      [empresaId]
    );

    // Insertar impuestos predeterminados
    for (const impuesto of impuestos) {
      await connection.execute(
        'INSERT INTO impuestos (empresa_id, codigo, nombre, porcentaje, estado, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
        [empresaId, impuesto.codigo, impuesto.nombre, impuesto.porcentaje, impuesto.estado]
      );
    }

    console.log(`✅ ${impuestos.length} impuestos insertados para empresa DEMO`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

seed();
