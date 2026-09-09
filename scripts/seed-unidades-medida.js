const mysql = require('mysql2/promise');

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USERNAME || 'crm_user',
  password: process.env.DB_PASSWORD || 'crm_pass',
  database: process.env.DB_DATABASE || 'crm_db',
};

const unidades = [
  { codigo: 'UN', nombre: 'Unidad', descripcion: 'Unidad individual', estado: 1 },
  { codigo: 'KG', nombre: 'Kilogramo', descripcion: 'Peso en kilogramos', estado: 1 },
  { codigo: 'LT', nombre: 'Litro', descripcion: 'Volumen en litros', estado: 1 },
  { codigo: 'M', nombre: 'Metro', descripcion: 'Longitud en metros', estado: 1 },
  { codigo: 'M2', nombre: 'Metro Cuadrado', descripcion: 'Área en metros cuadrados', estado: 1 },
  { codigo: 'M3', nombre: 'Metro Cúbico', descripcion: 'Volumen en metros cúbicos', estado: 1 },
  { codigo: 'DOZ', nombre: 'Docena', descripcion: 'Doce unidades', estado: 1 },
  { codigo: 'PAQ', nombre: 'Paquete', descripcion: 'Paquete o caja', estado: 1 },
  { codigo: 'HORA', nombre: 'Hora', descripcion: 'Tiempo en horas', estado: 1 },
  { codigo: 'DIA', nombre: 'Día', descripcion: 'Tiempo en días', estado: 1 },
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
      'DELETE FROM unidades_medida WHERE empresa_id = ?',
      [empresaId]
    );

    // Insertar unidades predeterminadas
    for (const unidad of unidades) {
      await connection.execute(
        'INSERT INTO unidades_medida (empresa_id, codigo, nombre, descripcion, estado, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
        [empresaId, unidad.codigo, unidad.nombre, unidad.descripcion, unidad.estado]
      );
    }

    console.log(`✅ ${unidades.length} unidades de medida insertadas para empresa DEMO`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

seed();
