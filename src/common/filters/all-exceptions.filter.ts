import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';

/**
 * Filtro global de excepciones.
 *
 * Normaliza TODAS las respuestas de error de la API en un formato único:
 *
 * {
 *   statusCode: number,
 *   message: string,
 *   error: string,
 *   timestamp: string,
 *   path: string,
 * }
 *
 * Maneja:
 *  - HttpException de NestJS
 *  - Errores de TypeORM (QueryFailedError, EntityNotFoundError)
 *  - Errores de validación (ValidationPipe)
 *  - Errores desconocidos (500)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, error } = this.resolveError(exception);

    this.logger.error(
      `${request.method} ${request.url} → ${statusCode}: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const body = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(body);
  }

  private resolveError(exception: unknown): {
    statusCode: number;
    message: string;
    error: string;
  } {
    // 1. HttpException de NestJS (incluye ValidationPipe)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      let message: string;
      if (typeof res === 'string') {
        message = res;
      } else if (Array.isArray((res as any).message)) {
        message = (res as any).message.join('; ');
      } else if (typeof (res as any).message === 'string') {
        message = (res as any).message;
      } else {
        message = exception.message;
      }

      return {
        statusCode: status,
        message,
        error: (res as any).error || this.httpStatusText(status),
      };
    }

    // 2. Errores de TypeORM
    if (exception instanceof QueryFailedError) {
      const code = (exception as any).errno || (exception as any).code;
      const sqlMessage: string = exception.message || '';

      // Duplicado (código 1062 en MySQL)
      if (code === 1062 || sqlMessage.includes('Duplicate')) {
        const valor = this.extraerValorDuplicado(sqlMessage);
        return {
          statusCode: HttpStatus.CONFLICT,
          message: valor
            ? `El registro ya existe: el valor "${valor}" está duplicado.`
            : 'El registro ya existe (valor duplicado).',
          error: 'Conflict',
        };
      }

      // No se puede borrar/actualizar: tiene registros dependientes (1451)
      if (code === 1451) {
        const dependencia = this.extraerTablaDependiente(sqlMessage);
        return {
          statusCode: HttpStatus.CONFLICT,
          message: dependencia
            ? `No se puede eliminar porque tiene ${dependencia} asociados. Desactívalo o anula esos registros primero.`
            : 'No se puede eliminar porque tiene registros asociados. Desactívalo o anula esos registros primero.',
          error: 'Conflict',
        };
      }

      // Violación de FK: referencia a un registro inexistente (1452)
      if (code === 1452 || sqlMessage.includes('FOREIGN KEY')) {
        const dependencia = this.extraerTablaDependiente(sqlMessage);
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: dependencia
            ? `No se puede guardar: el registro relacionado en "${dependencia}" no existe.`
            : 'No se puede guardar porque depende de otro registro que no existe.',
          error: 'Bad Request',
        };
      }

      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Error de base de datos. Revisa los datos e intenta de nuevo.',
        error: 'Bad Request',
      };
    }

    if (exception instanceof EntityNotFoundError) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'El registro solicitado no fue encontrado.',
        error: 'Not Found',
      };
    }

    // 3. Errores genéricos de JavaScript
    if (exception instanceof Error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message:
          process.env.NODE_ENV === 'development'
            ? exception.message
            : 'Error interno del servidor.',
        error: 'Internal Server Error',
      };
    }

    // 4. Errores desconocidos
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Error interno del servidor.',
      error: 'Internal Server Error',
    };
  }

  /**
   * Extrae el nombre amigable de la tabla dependiente desde un mensaje
   * de error de MySQL (FK), ej:
   *   "a foreign key constraint fails (`crm_db`.`ventas`, CONSTRAINT ...)"
   * Retorna el nombre traducido del módulo dependiente, o null.
   */
  private extraerTablaDependiente(sqlMessage: string): string | null {
    const tablas = [...sqlMessage.matchAll(/`[^`]+`\.`([^`]+)`/g)].map(
      (m) => m[1],
    );
    if (tablas.length === 0) return null;
    // En errores FK, MySQL menciona la tabla HIJA (la que depende del registro)
    const tablaDependiente = tablas[0];

    const nombres: Record<string, string> = {
      kardex: 'movimientos de inventario (Kardex)',
      ventas: 'ventas',
      detalle_ventas: 'detalles de venta',
      compras: 'compras',
      detalle_compras: 'detalles de compra',
      asientos: 'asientos contables',
      asiento_detalles: 'detalles de asientos contables',
      cartera: 'registros de cartera',
      cartera_cuotas: 'cuotas de cartera',
      cuentas_por_pagar: 'cuentas por pagar',
      terceros: 'terceros',
      productos: 'productos',
      tesoreria: 'movimientos de tesorería',
      bancos: 'bancos',
      conciliaciones: 'conciliaciones bancarias',
      usuarios: 'usuarios',
      facturas_electronicas: 'facturas electrónicas',
    };

    return nombres[tablaDependiente] ?? `registros de "${tablaDependiente}"`;
  }

  /** Extrae el valor duplicado de "Duplicate entry 'X' for key 'Y'" */
  private extraerValorDuplicado(sqlMessage: string): string | null {
    const m = sqlMessage.match(/Duplicate entry '([^']+)'/);
    return m ? m[1] : null;
  }

  private httpStatusText(status: number): string {
    const map: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'Bad Request',
      [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
      [HttpStatus.FORBIDDEN]: 'Forbidden',
      [HttpStatus.NOT_FOUND]: 'Not Found',
      [HttpStatus.CONFLICT]: 'Conflict',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
    };
    return map[status] || 'Error';
  }
}
