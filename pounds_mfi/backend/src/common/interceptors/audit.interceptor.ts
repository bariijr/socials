import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../modules/audit/entities/audit-log.entity';
import { Request } from 'express';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepo: Repository<AuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!mutatingMethods.includes(req.method)) return next.handle();

    const startTime = Date.now();

    return next.handle().pipe(
      tap(async (data) => {
        try {
          const user = (req as any).user;
          await this.auditRepo.save({
            userId: user?.id,
            userEmail: user?.email,
            userRole: user?.role,
            action: `${req.method} ${req.path}`,
            entity: this.extractEntity(req.path),
            entityId: req.params?.id,
            newData: req.body ? this.sanitize(req.body) : undefined,
            ipAddress: this.getIp(req),
            userAgent: req.headers['user-agent'],
            requestPath: req.path,
            requestMethod: req.method,
            responseStatus: 200,
            metadata: { duration: Date.now() - startTime },
          });
        } catch (_) {}
      }),
    );
  }

  private extractEntity(path: string): string {
    const parts = path.split('/').filter(Boolean);
    return parts[1] || parts[0] || 'unknown';
  }

  private getIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }

  private sanitize(data: any): any {
    const sensitive = ['password', 'token', 'secret', 'key'];
    if (!data || typeof data !== 'object') return data;
    const clone = { ...data };
    for (const key of sensitive) {
      if (key in clone) clone[key] = '[REDACTED]';
    }
    return clone;
  }
}
