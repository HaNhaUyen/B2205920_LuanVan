// @ts-nocheck
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AuthRepository {
  constructor(public readonly prisma: PrismaService) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  findUserByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  findUserById(id: bigint) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createUser(data: {
    fullName: string;
    email: string;
    phone?: string;
    passwordHash: string;
    role?: "admin" | "user";
    googleId?: string;
    authProvider?: string;
    avatarUrl?: string;
    identityNumber?: string;
  }) {
    return this.prisma.user.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        phone: data.phone || undefined,
        passwordHash: data.passwordHash,
        role: data.role ?? "user",
        status: "active",
        googleId: data.googleId,
        authProvider: data.authProvider ?? "local",
        avatarUrl: data.avatarUrl,
        identityNumber: data.identityNumber,
      },
    });
  }

  updateUser(
    id: bigint,
    data: {
      fullName?: string;
      email?: string;
      phone?: string | null;
      passwordHash?: string;
      googleId?: string | null;
      authProvider?: string;
      avatarUrl?: string | null;
      role?: "admin" | "user";
      status?: "active" | "inactive" | "blocked";
      identityNumber?: string | null;
      memberPoints?: number;
      memberTier?: any;
    },
  ) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }
}
