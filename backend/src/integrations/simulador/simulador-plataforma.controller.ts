import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyPlataformaGuard } from '../api-key-plataforma.guard.js';
import { IntegracionActual } from '../integracion-actual.decorator.js';
import type { IntegracionAutenticada } from '../integraciones.types.js';
import { SimuladorPlataformaService } from './simulador-plataforma.service.js';

// DECISIÓN DE PROTOTIPO: lado "plataforma" del simulador de la Fase 12B (ver
// SimuladorPlataformaService). El worker le entrega aquí los acuses, y la
// página /simulador-plataforma los consulta con la misma API key con la que
// manda los pedidos.
@ApiTags('simulador-plataforma')
@Controller('simulador-plataforma')
export class SimuladorPlataformaController {
  constructor(private readonly simulador: SimuladorPlataformaService) {}

  // Webhook que se registra como `urlAcuse` de la integración demo (ver
  // prisma/seed.ts). Sin autenticación, como el webhook de un tercero.
  // TODO PRODUCCIÓN: no aplica; la plataforma real tiene su propio webhook y
  // verificaría la firma HMAC del acuse.
  @ApiOperation({ summary: 'Webhook simulado de la plataforma: recibe un acuse del worker' })
  @HttpCode(204)
  @Post(':integracionId/acuses')
  async recibirAcuse(@Param('integracionId', ParseUUIDPipe) integracionId: string, @Body() cuerpo: unknown) {
    await this.simulador.guardarAcuse(integracionId, cuerpo);
  }

  @ApiOperation({ summary: 'Últimos acuses que recibió la plataforma simulada' })
  @ApiHeader({ name: 'X-Api-Key', required: true })
  @UseGuards(ApiKeyPlataformaGuard)
  @Get('acuses')
  listarAcuses(@IntegracionActual() integracion: IntegracionAutenticada) {
    return this.simulador.listarAcuses(integracion.id);
  }
}
