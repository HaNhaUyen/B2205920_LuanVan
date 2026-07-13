import { Module } from "@nestjs/common";
import { OperationalExpansionController } from "./operational-expansion.controller";
import { OperationalExpansionService } from "./operational-expansion.service";

@Module({
  controllers: [OperationalExpansionController],
  providers: [OperationalExpansionService],
})
export class OperationalExpansionModule {}
