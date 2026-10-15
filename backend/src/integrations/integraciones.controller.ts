import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyPlataformaGuard } from './api-key-plataforma.guard.js';
import { PedidoPlataformaDto } from './dto/pedido-plataforma.dto.js';
import { IntegracionActual } from './integracion-actual.decorator.js';
import type { IntegracionAutenticada } from './integraciones.types.js';
import { IntegracionesService } from './integraciones.service.js';

// Consumido por: plataformas de domicilios externas (CU-05). En este
// prototipo, solo el simulador de /simulador-plataforma.
// Sin JWT: autentica con la API key de la integración (X-Api-Key).
@ApiTags('integraciones')
@ApiHeader({ name: 'X-Api-Key', description: 'API key de la integración de plataforma', required: true })
@UseGuards(ApiKeyPlataformaGuard)
@Controller('integraciones/plataformas')
export class IntegracionesController {
  constructor(private readonly integracionesService: IntegracionesService) {}

  @ApiOperation({ summary: 'Recibe un pedido de la plataforma y lo manda a cocina (idempotente por orderId)' })
  @Post('pedidos')
  recibirPedido(@Body() dto: PedidoPlataformaDto, @IntegracionActual() integracion: IntegracionAutenticada) {
    return this.integracionesService.recibirPedido(dto, integracion);
  }

  @ApiOperation({ summary: 'Sedes y productos activos de la cadena, para que la plataforma arme su menú' })
  @Get('catalogo')
  catalogo(@IntegracionActual() integracion: IntegracionAutenticada) {
    return this.integracionesService.catalogo(integracion);
  }
}
