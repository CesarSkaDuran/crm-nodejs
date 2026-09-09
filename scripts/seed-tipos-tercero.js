const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USERNAME || 'crm_user',
  password: process.env.DB_PASSWORD || 'crm_pass',
  database: process.env.DB_DATABASE || 'crm_db',
};

const tiposTercero = [
  { nombre: 'Cliente', descripcion: 'Clientes de la empresa', estado: 1 },
  { nombre: 'Proveedor', descripcion: 'Proveedores de la empresa', estado: 1 },
  { nombre: 'Empleado', descripcion: 'Empleados de la empresa', estado: 1 },
  { nombre: 'Vendedor', descripcion: 'Vendedores y comisionistas', estado: 1 },
  { nombre: 'Otro', descripcion: 'Otros tipos de terceros', estado: 1 },
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
      'DELETE FROM tipos_tercero WHERE empresa_id = ?',
      [empresaId]
    );

    // Insertar tipos predeterminados
    for (const tipo of tiposTercero) {
      await connection.execute(
        'INSERT INTO tipos_tercero (empresa_id, nombre, descripcion, estado, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [empresaId, tipo.nombre, tipo.descripcion, tipo.estado]
      );
    }

    console.log(`✅ ${tiposTercero.length} tipos de tercero insertados para empresa DEMO`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

seed();
