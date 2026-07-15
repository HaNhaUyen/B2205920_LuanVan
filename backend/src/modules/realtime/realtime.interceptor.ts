import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { RealtimeService } from "./realtime.service";

@Injectable()
export class RealtimeMutationInterceptor implements NestInterceptor {
  constructor(private readonly realtimeService: RealtimeService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method = String(request?.method || "GET").toUpperCase();
    const originalUrl = String(request?.originalUrl || request?.url || "");

    const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    const normalizedPath = originalUrl.replace(/^\/api\/?/, "");
    const ignoredPrefixes = ["auth/", "chatbot/", "recommendations/behavior"];
    const isIgnoredMutation = ignoredPrefixes.some((prefix) =>
      normalizedPath.startsWith(prefix),
    );
    const isRealtimeEndpoint = originalUrl.includes("/realtime/events");

    if (!isMutation || isRealtimeEndpoint || isIgnoredMutation) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const resource = originalUrl
          .replace(/^\/api\/?/, "")
          .split("?")[0]
          .split("/")
          .filter(Boolean)
          .slice(0, 2)
          .join("/");

        this.realtimeService.publishChange({
          method,
          resource: resource || "unknown",
        });
      }),
    );
  }
}
