import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AppRole } from "../../common/decorators/roles.decorator";
import { AuthRepository } from "./auth.repository";

type JwtPayload = {
  sub: string;
  email: string;
  role: AppRole;
  fullName: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authRepository: AuthRepository) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || "dev_jwt_secret_change_me",
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload) {
    const userId = BigInt(payload.sub);
    const user = await this.authRepository.findUserById(userId);

    if (!user) {
      throw new UnauthorizedException("Tài khoản không còn tồn tại.");
    }

    if (user.status !== "active") {
      throw new UnauthorizedException(
        "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
      );
    }

    // Tương thích cả các hồ sơ Guide cũ từng bị khóa trước khi
    // trạng thái Guide và User được đồng bộ.
    if (String(user.role) === "guide") {
      const guide = await this.authRepository.prisma.guide.findFirst({
        where: { userId: user.id },
        select: { status: true },
      });

      if (guide && guide.status === "locked") {
        throw new UnauthorizedException(
          "Tài khoản hướng dẫn viên đã bị khóa. Vui lòng liên hệ quản trị viên.",
        );
      }
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role as AppRole,
      fullName: user.fullName,
    };
  }
}
