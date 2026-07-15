import { Controller, MessageEvent, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { RealtimeService } from "./realtime.service";

@Controller("realtime")
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Sse("events")
  events(): Observable<MessageEvent> {
    return this.realtimeService.stream();
  }
}
