import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { FaqsService } from './faqs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UpsertFaqDto } from './dto/upsert-faq.dto';

@Controller()
export class FaqsController {
  constructor(private readonly faqsService: FaqsService) {}

  @Get('faqs')
  findAll() {
    return this.faqsService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('admin/faqs')
  adminList(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('topic') topic?: string,
  ) {
    return this.faqsService.adminList({ page, pageSize, search, status, topic });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('admin/faqs')
  adminCreate(@Body() dto: UpsertFaqDto) {
    return this.faqsService.adminCreate(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch('admin/faqs/:id')
  adminUpdate(@Param('id') id: string, @Body() dto: UpsertFaqDto) {
    return this.faqsService.adminUpdate(Number(id), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('admin/faqs/:id')
  adminDelete(@Param('id') id: string) {
    return this.faqsService.adminDelete(Number(id));
  }
}
