import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AppRole } from "../../common/decorators/roles.decorator";

type JwtPayload = {
  sub: string;
  email: string;
  role: AppRole;
  fullName: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || "dev_jwt_secret_change_me",
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload) {
    return {
      userId: BigInt(payload.sub),
      email: payload.email,
      role: payload.role,
      fullName: payload.fullName,
    };
  }
}
