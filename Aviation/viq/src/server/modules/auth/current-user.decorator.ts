import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Reads the JWT-verified payload JwtAuthGuard already stashed on the
// request (`request.user = jwtService.verify(token)`), matching
// RolesGuard's own `request.user?.role` read. This is the trustworthy,
// server-verified role -- distinct from any `user`/`role` field a DTO
// body might carry, which is client-supplied and not authoritative.
export interface CurrentUserPayload {
  sub: string;
  username: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
