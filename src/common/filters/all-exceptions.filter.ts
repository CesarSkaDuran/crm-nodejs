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
      const sqlMessage = exception.message || '';

      // Duplicado (código 1062 en MySQL)
      if (code === 1062 || sqlMessage.includes('Duplicate')) {
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'El registro ya existe (valor duplicado).',
          error: 'Conflict',
        };
      }

      // Violación de FK (código 1452 en MySQL)
      if (code === 1452 || sqlMessage.includes('FOREIGN KEY')) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'No se puede guardar porque depende de otro registro que no existe.',
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
