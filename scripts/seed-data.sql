-- ============================================================================
-- SCRIPT DE DATOS PREDETERMINADOS
-- ============================================================================
-- Ejecutar este script en MySQL para cargar datos predeterminados
-- en las nuevas tablas de configuración
-- ============================================================================

-- Obtener el ID de la empresa DEMO
SET @empresa_id = (SELECT id FROM empresas WHERE codigo = 'DEMO' LIMIT 1);

-- Si no existe la empresa DEMO, crear una
IF @empresa_id IS NULL THEN
  INSERT INTO empresas (codigo, nombre, estado, created_at, updated_at)
  VALUES ('DEMO', 'Empresa Demo', 1, NOW(), NOW());
  SET @empresa_id = LAST_INSERT_ID();
END IF;

-- ============================================================================
-- TIPOS DE TERCERO
-- ============================================================================
DELETE FROM tipos_tercero WHERE empresa_id = @empresa_id;

INSERT INTO tipos_tercero (empresa_id, nombre, descripcion, estado, created_at, updated_at)
VALUES
  (@empresa_id, 'Cliente', 'Clientes de la empresa', 1, NOW(), NOW()),
  (@empresa_id, 'Proveedor', 'Proveedores de la empresa', 1, NOW(), NOW()),
  (@empresa_id, 'Empleado', 'Empleados de la empresa', 1, NOW(), NOW()),
  (@empresa_id, 'Vendedor', 'Vendedores y comisionistas', 1, NOW(), NOW()),
  (@empresa_id, 'Otro', 'Otros tipos de terceros', 1, NOW(), NOW());

-- ============================================================================
-- IMPUESTOS
-- ============================================================================
DELETE FROM impuestos WHERE empresa_id = @empresa_id;

INSERT INTO impuestos (empresa_id, codigo, nombre, porcentaje, estado, created_at, updated_at)
VALUES
  (@empresa_id, 'IVA', 'IVA (Impuesto al Valor Agregado)', 19.00, 1, NOW(), NOW()),
  (@empresa_id, 'IVA_5', 'IVA 5%', 5.00, 1, NOW(), NOW()),
  (@empresa_id, 'IVA_0', 'IVA 0% (Exento)', 0.00, 1, NOW(), NOW()),
  (@empresa_id, 'ICA', 'ICA (Impuesto de Industria y Comercio)', 1.04, 1, NOW(), NOW()),
  (@empresa_id, 'RENTA', 'Retención en la Fuente (Renta)', 8.00, 1, NOW(), NOW()),
  (@empresa_id, 'IVA_RET', 'Retención IVA', 15.00, 1, NOW(), NOW());

-- ============================================================================
-- UNIDADES DE MEDIDA
-- ============================================================================
DELETE FROM unidades_medida WHERE empresa_id = @empresa_id;

INSERT INTO unidades_medida (empresa_id, codigo, nombre, descripcion, estado, created_at, updated_at)
VALUES
  (@empresa_id, 'UN', 'Unidad', 'Unidad individual', 1, NOW(), NOW()),
  (@empresa_id, 'KG', 'Kilogramo', 'Peso en kilogramos', 1, NOW(), NOW()),
  (@empresa_id, 'LT', 'Litro', 'Volumen en litros', 1, NOW(), NOW()),
  (@empresa_id, 'M', 'Metro', 'Longitud en metros', 1, NOW(), NOW()),
  (@empresa_id, 'M2', 'Metro Cuadrado', 'Área en metros cuadrados', 1, NOW(), NOW()),
  (@empresa_id, 'M3', 'Metro Cúbico', 'Volumen en metros cúbicos', 1, NOW(), NOW()),
  (@empresa_id, 'DOZ', 'Docena', 'Doce unidades', 1, NOW(), NOW()),
  (@empresa_id, 'PAQ', 'Paquete', 'Paquete o caja', 1, NOW(), NOW()),
  (@empresa_id, 'HORA', 'Hora', 'Tiempo en horas', 1, NOW(), NOW()),
  (@empresa_id, 'DIA', 'Día', 'Tiempo en días', 1, NOW(), NOW());

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
SELECT 'Tipos de Tercero' AS 'Tabla', COUNT(*) AS 'Registros' FROM tipos_tercero WHERE empresa_id = @empresa_id
UNION ALL
SELECT 'Impuestos', COUNT(*) FROM impuestos WHERE empresa_id = @empresa_id
UNION ALL
SELECT 'Unidades de Medida', COUNT(*) FROM unidades_medida WHERE empresa_id = @empresa_id;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
