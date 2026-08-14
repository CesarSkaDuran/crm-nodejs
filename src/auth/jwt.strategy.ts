import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'secret'),
    });
  }

  async validate(payload: any) {
    if (!payload.empresa_id) {
      throw new UnauthorizedException();
    }

    return {
      usuario_id: payload.sub,
      empresa_id: payload.empresa_id,
      codigo_empresa: payload.codigo_empresa,
      nombre: payload.nombre,
      email: payload.email,
      rol: payload.rol,
    };
  }
}
