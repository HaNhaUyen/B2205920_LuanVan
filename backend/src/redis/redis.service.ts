import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB || 0),
      maxRetriesPerRequest: 3,
    });
  }

  getClient() {
    return this.client;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async acquireLock(key: string, ttlMs = 10000): Promise<string | null> {
    const token = `${Date.now()}-${Math.random()}`;

    const result = await this.client.set(key, token, "PX", ttlMs, "NX");

    return result === "OK" ? token : null;
  }

  async releaseLock(key: string, token: string) {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;

    await this.client.eval(script, 1, key, token);
  }
}
