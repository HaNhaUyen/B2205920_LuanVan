import { Injectable, MessageEvent } from "@nestjs/common";
import { Observable, Subject, interval, merge, map } from "rxjs";

export type RealtimeChange = {
  id: string;
  type: "data.changed";
  method: string;
  resource: string;
  occurredAt: string;
};

@Injectable()
export class RealtimeService {
  private readonly changes$ = new Subject<MessageEvent>();

  publishChange(
    input: Omit<RealtimeChange, "id" | "type" | "occurredAt">,
  ): void {
    const data: RealtimeChange = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: "data.changed",
      method: input.method,
      resource: input.resource,
      occurredAt: new Date().toISOString(),
    };

    this.changes$.next({ type: "data.changed", id: data.id, data });
  }

  stream(): Observable<MessageEvent> {
    const heartbeat$ = interval(25000).pipe(
      map(() => ({
        type: "heartbeat",
        data: { occurredAt: new Date().toISOString() },
      })),
    );

    return merge(this.changes$.asObservable(), heartbeat$);
  }
}
