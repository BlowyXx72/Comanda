import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Aplicar con @UseGuards(JwtAuthGuard) en cualquier endpoint que requiera sesión.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
