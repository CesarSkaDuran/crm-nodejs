# Tipos de Comprobantes

Gestiona los tipos de comprobantes contables de cada empresa.

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/tipo-comprobantes` | Lista con paginación (`page`, `limit`, `search`, `tipo`) |
| `GET` | `/tipo-comprobantes/:id` | Obtiene uno por ID |
| `POST` | `/tipo-comprobantes` | Crea uno nuevo (nombre único por empresa) |
| `PATCH` | `/tipo-comprobantes/:id` | Actualiza |
| `DELETE` | `/tipo-comprobantes/:id` | Elimina |
| `POST` | `/tipo-comprobantes/:id/siguiente` | Obtiene e incrementa el consecutivo |

## Campos

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | int PK | Autoincremental |
| `empresa_id` | int | FK a empresa |
| `nombre` | string | Nombre único por empresa (ej. "Factura de venta") |
| `simple` | string? | Abreviatura corta (ej. "FV") |
| `prefijo` | string? | Prefijo del consecutivo (ej. "000") |
| `consecutivo` | int | Consecutivo actual (default 1) |
| `tipo` | tinyint | Tipo de comprobante (1-7, ver tabla) |
| `estado` | tinyint | 1=activo, 0=inactivo |

## Tipos de comprobante

| Valor | Nombre |
|-------|--------|
| 1 | Factura de venta |
| 2 | Factura de compra |
| 3 | Comprobante de contabilidad |
| 4 | Comprobante de gasto |
| 5 | Ajuste de inventarios |
| 6 | Comprobante de depósito |
| 7 | Comprobante de retiro |

## Función `nextConsecutivo`

El endpoint `POST /:id/siguiente` es la función principal de este módulo:

1. Lee el `consecutivo` actual del tipo
2. Lo incrementa en 1 y guarda
3. Retorna el consecutivo formateado: `{ consecutivo: "FV0001" }`
   - Formato: `(prefijo || simple) + número padded a 4 dígitos`

Es **transaccional**: garantiza numeración única incluso con peticiones concurrentes.

## Uso

Este módulo es usado por:
- **Ventas** (tipo 1): al crear una factura de venta
- **Compras** (tipo 2): al registrar una compra
- **Comprobantes contables** (tipo 3): asientos manuales
- **Inventario físico** (tipo 5): ajustes de inventario
- **Tesorería** (tipos 6, 7): depósitos y retiros
