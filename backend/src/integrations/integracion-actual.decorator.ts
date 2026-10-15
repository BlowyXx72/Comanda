import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { IntegracionAutenticada } from './integraciones.types.js';

// Uso: metodo(@IntegracionActual() integracion) en un endpoint protegido por
// ApiKeyPlataformaGuard.
export const IntegracionActual = createParamDecorator((_data: unknown, ctx: ExecutionContext): IntegracionAutenticada => {
  const request = ctx.switchToHttp().getRequest<{ integracion: IntegracionAutenticada }>();
  return request.integracion;
});
