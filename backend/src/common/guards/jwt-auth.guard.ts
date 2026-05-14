import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly prisma: PrismaService) { super(); }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    const req = context.switchToHttp().getRequest();
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      const revoked = await this.prisma.revokedToken.findUnique({ where: { tokenHash } }).catch(() => null);
      if (revoked) throw new UnauthorizedException('Phiên đăng nhập đã hết hiệu lực.');
    }
    return ok;
  }
}
