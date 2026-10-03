-- ============================================================
-- Hardening multiempresa - crm_db
-- Ejecutar UNA SOLA VEZ en el servidor de producción.
-- Si un índice ya existe, MySQL reportará un error inofensivo
-- ("Duplicate key name") para esa línea; el resto se aplica igual.
-- ============================================================

USE crm_db;

-- 1) Rol superadmin en el enum de usuarios (requerido por la app)
ALTER TABLE usuarios
  MODIFY COLUMN rol ENUM('superadmin','admin','contador','vendedor','consulta')
  NOT NULL DEFAULT 'consulta';

-- 2) Índices por empresa (aislamiento + rendimiento multiempresa)
CREATE INDEX idx_compras_empresa          ON compras (empresa_id);
CREATE INDEX idx_ventas_empresa           ON ventas (empresa_id);
CREATE INDEX idx_detalle_ventas_venta     ON detalle_ventas (venta_id);
CREATE INDEX idx_detalle_ventas_producto  ON detalle_ventas (producto_id);
CREATE INDEX idx_detalle_compras_compra   ON detalle_compras (compra_id);
CREATE INDEX idx_detalle_compras_producto ON detalle_compras (producto_id);
CREATE INDEX idx_asentados_empresa        ON asentados (empresa_id);
CREATE INDEX idx_contabilidad_empresa     ON contabilidad (empresa_id);
CREATE INDEX idx_contabilidad_asentado    ON contabilidad (asentado_id);
CREATE INDEX idx_kardex_empresa           ON kardex (empresa_id);
CREATE INDEX idx_kardex_producto          ON kardex (producto_id);
CREATE INDEX idx_tesoreria_empresa        ON tesoreria (empresa_id);
CREATE INDEX idx_creditos_empresa         ON creditos (empresa_id);
CREATE INDEX idx_cuotas_credito_empresa   ON cuotas_credito (empresa_id);
CREATE INDEX idx_cuotas_credito_credito   ON cuotas_credito (credito_id);
CREATE INDEX idx_auditoria_empresa        ON auditoria (empresa_id);

-- 3) Empresa de plataforma y superadmin (idempotente vía script JS)
--    No insertar a mano la contraseña; ejecutar:
--    node scripts/create-superadmin.js
