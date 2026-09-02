import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ArgumentsHost } from '@nestjs/common';
import { Response, Request } from 'express';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AllExceptionsFilter],
    }).compile();
    filter = module.get<AllExceptionsFilter>(AllExceptionsFilter);
  });

  const createHost = (): ArgumentsHost => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as unknown as Response;
    const request = { method: 'GET', url: '/test' } as unknown as Request;

    return {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
  };

  it('devuelve el formato estandar para HttpException', () => {
    const host = createHost();
    filter.catch(new NotFoundException('No encontrado'), host);

    const response = host.switchToHttp().getResponse<Response>();
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'No encontrado',
        error: 'Not Found',
        path: '/test',
      }),
    );
  });

  it('devuelve 400 para errores de validacion', () => {
    const host = createHost();
    filter.catch(new BadRequestException('Dato invalido'), host);

    const response = host.switchToHttp().getResponse<Response>();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Dato invalido',
        error: 'Bad Request',
      }),
    );
  });

  it('devuelve 500 para errores desconocidos', () => {
    const host = createHost();
    filter.catch(new Error('Error desconocido'), host);

    const response = host.switchToHttp().getResponse<Response>();
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        error: 'Internal Server Error',
      }),
    );
  });
});
