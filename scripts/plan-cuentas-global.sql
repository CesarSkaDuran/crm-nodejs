-- ============================================================================
-- plan-cuentas-global.sql
--
-- Convierte el Plan Unico de Cuentas en un catalogo GLOBAL compartido por
-- todas las empresas.
--
--   - empresa_id = 0          -> cuenta del PUC base (la ven todas)
--   - empresa_id = ID empresa -> cuenta especial, solo visible para esa empresa
--
-- Pasos:
--   1. Elimina dinamicamente la FK de plan_cuentas.empresa_id -> empresas.id
--      (busca la constraint por columna, no por nombre; idempotente).
--   2. Pasa las cuentas de la empresa "base" a empresa_id = 0.
--      Si un codigo ya existe como global, conserva la fila con su
--      empresa original (la empresa quedaria con una copia propia).
--   3. Garantiza el indice unico (empresa_id, codigo).
--
-- IMPORTANTE:
--   - Hacer BACKUP de la base de datos antes de ejecutar.
--   - Ajustar @codigo_empresa_puc al codigo de la empresa que tiene el PUC
--     completo hoy (en este sistema: 'DEMO').
--   - Requiere el despliegue del backend que soporta EMPRESA_GLOBAL = 0.
-- ============================================================================

USE crm_db;

-- ----------------------------------------------------------------------------
-- 1) Empresa cuyo PUC pasa a ser el catalogo global
-- ----------------------------------------------------------------------------
SET @codigo_empresa_puc := 'DEMO';
SET @empresa_puc := (
  SELECT id FROM empresas WHERE codigo = @codigo_empresa_puc LIMIT 1
);

SELECT @empresa_puc AS empresa_puc_id,
       @codigo_empresa_puc AS empresa_puc_codigo;

-- ----------------------------------------------------------------------------
-- 2) Eliminar la FK de empresa_id -> empresas.id (por columna, no por nombre)
-- ----------------------------------------------------------------------------
SET @fk_empresa := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'plan_cuentas'
    AND COLUMN_NAME = 'empresa_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);

SET @sql := IF(
  @fk_empresa IS NULL,
  'SELECT ''plan_cuentas: empresa_id ya no tiene FK'' AS info',
  CONCAT('ALTER TABLE plan_cuentas DROP FOREIGN KEY `', @fk_empresa, '`')
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- 3) Pasar el PUC de la empresa base a empresa_id = 0 (global)
--    NOT EXISTS: si el codigo ya existe como global, se deja con su empresa.
-- ----------------------------------------------------------------------------
UPDATE plan_cuentas p
SET p.empresa_id = 0
WHERE p.empresa_id = @empresa_puc
  AND NOT EXISTS (
    SELECT 1
    FROM (
      SELECT codigo
      FROM plan_cuentas
      WHERE empresa_id = 0
    ) g
    WHERE g.codigo = p.codigo
  );

SELECT empresa_id, COUNT(*) AS cuentas
FROM plan_cuentas
GROUP BY empresa_id
ORDER BY empresa_id;

-- ----------------------------------------------------------------------------
-- 4) Garantizar el indice unico (empresa_id, codigo)
-- ----------------------------------------------------------------------------
SET @tiene_unique := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'plan_cuentas'
    AND CONSTRAINT_TYPE = 'UNIQUE'
    AND CONSTRAINT_NAME IN (
      SELECT DISTINCT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'plan_cuentas'
        AND COLUMN_NAME = 'empresa_id'
    )
);

SET @sql := IF(
  @tiene_unique > 0,
  'SELECT ''plan_cuentas: indice unico (empresa_id, codigo) ya existe'' AS info',
  'ALTER TABLE plan_cuentas ADD UNIQUE KEY uq_plan_cuentas_empresa_codigo (empresa_id, codigo)'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------------------------
-- 5) Verificacion final
-- ----------------------------------------------------------------------------
SELECT
  empresa_id,
  COUNT(*) AS total_cuentas,
  SUM(CASE WHEN clasificacion = 4 THEN 1 ELSE 0 END) AS auxiliares
FROM plan_cuentas
GROUP BY empresa_id;
