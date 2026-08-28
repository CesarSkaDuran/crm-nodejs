/**
 * Convierte la base de datos crm_db de latin1 a utf8mb4 y repara el mojibake
 * existente en los datos.
 *
 * PROBLEMA:
 *   La DB estaba en latin1_swedish_ci, pero los datos se insertaron como
 *   UTF-8 (desde Node.js). Esto causa mojibake: "SAN JOSÉ DE CÚCUTA" se
 *   almacena como "SAN JOSÃ© DE CÃºCUTA".
 *
 * SOLUCIÓN (2 fases):
 *   Fase 1: Reparar los datos mojibake ANTES de convertir el charset.
 *           Para cada columna de texto, se hace:
 *             UPDATE tabla SET col = CONVERT(BINARY(CONVERT(col USING latin1)) USING utf8mb4);
 *           Esto reinterpreta los bytes latin1 como UTF-8 correcto.
 *
 *   Fase 2: Convertir DB, tablas y columnas a utf8mb4_unicode_ci.
 *             ALTER DATABASE crm_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 *             ALTER TABLE tabla CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 *
 * USO:
 *   node scripts/fix-charset-utf8mb4.js          (dry-run, solo muestra cambios)
 *   node scripts/fix-charset-utf8mb4.js --apply  (ejecuta los cambios)
 */
const mysql = require('mysql2/promise');

const APPLY = process.argv.includes('--apply');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
    multipleStatements: true,
  });

  console.log(`\n=== CONVERSIÓN latin1 → utf8mb4 ===`);
  console.log(`Modo: ${APPLY ? 'APLICAR (destructivo)' : 'DRY-RUN (solo preview)'}\n`);

  // --- 1. Listar todas las tablas ---
  const [tables] = await c.query(
    "SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'crm_db' AND TABLE_TYPE = 'BASE TABLE'",
  );
  console.log(`Tablas encontradas: ${tables.length}`);

  // --- 2. Para cada tabla, listar columnas de texto (CHAR, VARCHAR, TEXT) ---
  const textColumns = [];
  for (const t of tables) {
    const [cols] = await c.query(
      `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_SET_NAME, COLLATION_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = 'crm_db'
         AND TABLE_NAME = ?
         AND DATA_TYPE IN ('char','varchar','text','tinytext','mediumtext','longtext','enum','set')`,
      [t.TABLE_NAME],
    );
    for (const col of cols) {
      textColumns.push({
        table: t.TABLE_NAME,
        column: col.COLUMN_NAME,
        type: col.DATA_TYPE,
        charset: col.CHARACTER_SET_NAME,
        collation: col.COLLATION_NAME,
      });
    }
  }

  console.log(`Columnas de texto a reparar: ${textColumns.length}\n`);

  // --- 3. Fase 1: Reparar mojibake en cada columna ---
  // Solo reparar columnas que están en latin1
  const latin1Cols = textColumns.filter((c) => c.charset === 'latin1');
  console.log(`Fase 1: Reparar mojibake en ${latin1Cols.length} columnas latin1`);

  for (const col of latin1Cols) {
    // Verificar si hay datos con mojibake antes de reparar
    const [check] = await c.query(
      `SELECT COUNT(*) AS cnt FROM \`${col.table}\` WHERE \`${col.column}\` LIKE '%Ã%' OR \`${col.column}\` LIKE '%Â%' OR \`${col.column}\` LIKE '%â¬%' LIMIT 1`,
    );
    const hasMojibake = check[0].cnt > 0;

    if (hasMojibake) {
      console.log(`  [REPARAR] ${col.table}.${col.column} (${col.charset}) - ${check[0].cnt} filas con mojibake`);
      if (APPLY) {
        // Reparar: reinterpretar bytes latin1 como UTF-8
        // BINARY() preserva los bytes crudos, luego CONVERT a utf8mb4 los decodifica correctamente
        await c.query(
          `UPDATE \`${col.table}\` SET \`${col.column}\` = CONVERT(BINARY(CONVERT(\`${col.column}\` USING latin1)) USING utf8mb4) WHERE \`${col.column}\` LIKE '%Ã%' OR \`${col.column}\` LIKE '%Â%' OR \`${col.column}\` LIKE '%â¬%'`,
        );
      }
    } else {
      console.log(`  [OK]      ${col.table}.${col.column} - sin mojibake detectado`);
    }
  }

  // --- 4. Fase 2: Convertir DB y tablas a utf8mb4 ---
  console.log(`\nFase 2: Convertir DB y tablas a utf8mb4_unicode_ci`);

  if (APPLY) {
    // Convertir la base de datos
    await c.query(`ALTER DATABASE crm_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`  [OK] ALTER DATABASE crm_db → utf8mb4_unicode_ci`);
  } else {
    console.log(`  [DRY] ALTER DATABASE crm_db → utf8mb4_unicode_ci`);
  }

  for (const t of tables) {
    if (APPLY) {
      await c.query(
        `ALTER TABLE \`${t.TABLE_NAME}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      console.log(`  [OK] ALTER TABLE ${t.TABLE_NAME} → utf8mb4_unicode_ci`);
    } else {
      console.log(`  [DRY] ALTER TABLE ${t.TABLE_NAME} → utf8mb4_unicode_ci`);
    }
  }

  // --- 5. Verificación final ---
  if (APPLY) {
    console.log(`\n=== VERIFICACIÓN ===`);
    const [dbCheck] = await c.query(
      "SELECT default_character_set_name AS charset, default_collation_name AS collation FROM information_schema.SCHEMATA WHERE schema_name = 'crm_db'",
    );
    console.log(`DB charset:`, dbCheck[0]);

    const [mojibakeCheck] = await c.query(
      "SELECT id, nombre, ciudad FROM terceros WHERE nombre LIKE '%Ã%' OR ciudad LIKE '%Ã%' LIMIT 5",
    );
    console.log(`Terceros con mojibake restante: ${mojibakeCheck.length}`);
    if (mojibakeCheck.length > 0) {
      console.log(`  (algunos datos pueden necesitar reparación manual)`, mojibakeCheck);
    } else {
      console.log(`  ✓ No hay mojibake restante en terceros`);
    }

    // Mostrar terceros reparados
    const [sample] = await c.query(
      "SELECT id, nombre, ciudad FROM terceros WHERE ciudad LIKE '%CÚCUTA%' OR ciudad LIKE '%CUCUTA%' LIMIT 5",
    );
    console.log(`\nMuestra de terceros reparados:`);
    for (const s of sample) {
      console.log(`  id=${s.id}: ${s.nombre} | ${s.ciudad}`);
    }
  }

  console.log(`\n${APPLY ? '✓ Conversión completada' : '✓ Dry-run completado (use --apply para ejecutar)'}`);
  await c.end();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
