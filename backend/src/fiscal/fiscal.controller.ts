import { Controller, Get, Header, NotFoundException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UsuarioActual } from '../auth/decorators/usuario-actual.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { UsuarioAutenticado } from '../auth/jwt-payload.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AlmacenObjetosService } from './almacen-objetos.service.js';

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
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Get(':id/xml')
  async descargarXml(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() usuario: UsuarioAutenticado) {
    const doc = await this.prisma.documentoFiscal.findUnique({ where: { id }, include: { sede: true } });
    // 404 también si es de otra cadena: no se confirma que el id existe.
    if (!doc || doc.sede.cadenaId !== usuario.cadenaId) {
      throw new NotFoundException(`Documento fiscal ${id} no encontrado`);
    }
    if (!doc.urlXml) {
      throw new NotFoundException('El XML todavía no se ha generado (el documento sigue en la cola)');
    }
    return this.almacen.descargarTexto(doc.urlXml);
  }
}
