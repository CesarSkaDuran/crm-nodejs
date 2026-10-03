-- ============================================================================
-- create-superadmin.sql
--
-- Crea la empresa plataforma SYS y el usuario SUPERADMIN sin necesidad de
-- terminal/Node. Equivalente a scripts/create-superadmin.js, para ejecutar
-- desde phpMyAdmin (pestaña SQL).
--
-- El usuario queda con:
--   email:    superadmin@sistema.local
--   usuario:  superadmin
--   rol:      superadmin
--   clave:    definida por el operador mediante un hash bcrypt propio
--
-- Idempotente: se puede ejecutar varias veces sin duplicar.
-- ============================================================================

USE ctz_crm;

-- ----------------------------------------------------------------------------
-- 1) Agregar el rol 'superadmin' al enum usuarios.rol
-- ----------------------------------------------------------------------------
ALTER TABLE usuarios
  MODIFY COLUMN rol
  ENUM('admin','contador','vendedor','consulta','superadmin')
  NOT NULL DEFAULT 'consulta';

-- ----------------------------------------------------------------------------
-- 2) Empresa plataforma SYS (independiente de las empresas cliente)
-- ----------------------------------------------------------------------------
INSERT INTO empresas (
    codigo,
    nombre,
    pais,
    estado,
    consecutivo_compras,
    consecutivo_ventas,
    consecutivo_asientos
)
SELECT 'SYS', 'Administración del Sistema', 'Colombia', 1, 0, 0, 0
WHERE NOT EXISTS (
    SELECT 1 FROM (SELECT codigo FROM empresas) e WHERE e.codigo = 'SYS'
);

SET @sys_id := (SELECT id FROM empresas WHERE codigo = 'SYS' LIMIT 1);

-- ----------------------------------------------------------------------------
-- 3) Usuario superadmin (reemplazar el marcador por un hash bcrypt propio)
-- ----------------------------------------------------------------------------
SET @superadmin_password_hash := 'REEMPLAZAR_POR_HASH_BCRYPT';

INSERT INTO usuarios (
    empresa_id,
    nombre,
    usuario,
    email,
    password,
    rol,
    estado
)
SELECT
    @sys_id,
    'Superadmin',
    'superadmin',
    'superadmin@sistema.local',
    @superadmin_password_hash,
    'superadmin',
    1
WHERE CHAR_LENGTH(@superadmin_password_hash) = 60
  AND LEFT(@superadmin_password_hash, 4) IN ('$2a$', '$2b$', '$2y$')
  AND NOT EXISTS (
    SELECT 1 FROM (SELECT email FROM usuarios) u
    WHERE u.email = 'superadmin@sistema.local'
);

-- ----------------------------------------------------------------------------
-- 4) Verificación
-- ----------------------------------------------------------------------------
SELECT id, codigo, nombre, estado
FROM empresas
WHERE codigo = 'SYS';

SELECT id, empresa_id, nombre, usuario, email, rol, estado
FROM usuarios
WHERE rol = 'superadmin';
