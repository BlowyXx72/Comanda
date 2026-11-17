import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { verificarSedeDelUsuario } from '../auth/sede-usuario.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AlmacenObjetosService } from '../storage/almacen-objetos.service.js';

// Consumido por: /caja ("Ver XML" en el recibo). El navegador no habla con
// MinIO directo: el XML pasa por aquí para aplicar JWT y aislamiento por
// cadena, igual que el resto de la API.
@ApiTags('documentos-fiscales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documentos-fiscales')
export class FiscalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly almacen: AlmacenObjetosService,
  ) {}

  @ApiOperation({ summary: 'Descarga el XML (simulado) de un documento fiscal desde el almacén de objetos' })
  @Roles('CAJERO', 'ADMIN')
  @Get(':id/xml')
  async descargarXml(
    @Param('id', ParseUUIDPipe) id: string,
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) res: Response,
  ) {
    const doc = await this.prisma.documentoFiscal.findUnique({ where: { id }, include: { sede: true } });
    // 404 también si es de otra cadena: no se confirma que el id existe.
    if (!doc || doc.sede.cadenaId !== usuario.cadenaId) {
      throw new NotFoundException(`Documento fiscal ${id} no encontrado`);
    }
    // Fase 17: un cajero con sede asignada solo ve los documentos de su sede.
    verificarSedeDelUsuario(usuario, doc.sedeId);
    if (!doc.urlXml) {
      throw new NotFoundException('El XML todavía no se ha generado (el documento sigue en la cola)');
    }
    const xml = await this.almacen.descargarTexto(doc.urlXml);
    // El tipo XML solo en la respuesta buena: con @Header también salía en
    // los errores (JSON), y Nest avisaba "Content-Type doesn't match".
    res.type('application/xml; charset=utf-8');
    return xml;
  }
}
