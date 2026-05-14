import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminUpsertContactDto } from './dto/admin-upsert-contact.dto';
import { ReplyContactDto } from './dto/reply-contact.dto';

@Controller()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post('contacts')
  create(@Body() dto: CreateContactDto, @CurrentUser() user?: { userId: bigint }) {
    return this.contactsService.create(dto, user?.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('contacts')
  findAll() {
    return this.contactsService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('admin/contacts')
  adminList(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('emailStatus') emailStatus?: string,
  ) {
    return this.contactsService.adminList({ page, pageSize, search, status, emailStatus });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('admin/contact-email-logs')
  adminEmailHistory(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('emailStatus') emailStatus?: string,
    @Query('contactId') contactId?: string,
  ) {
    return this.contactsService.adminEmailHistory({ page, pageSize, search, status, emailStatus, contactId });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('admin/contacts/:id')
  adminDetail(@Param('id') id: string) {
    return this.contactsService.adminDetail(Number(id));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('admin/contacts')
  adminCreate(@Body() dto: AdminUpsertContactDto) {
    return this.contactsService.adminCreate(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch('admin/contacts/:id')
  adminUpdate(@Param('id') id: string, @Body() dto: AdminUpsertContactDto) {
    return this.contactsService.adminUpdate(Number(id), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('admin/contacts/:id/reply')
  adminReply(
    @Param('id') id: string,
    @Body() dto: ReplyContactDto,
    @CurrentUser() user: { userId: bigint },
  ) {
    return this.contactsService.replyToContact(Number(id), dto, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('admin/contacts/:id')
  adminDelete(@Param('id') id: string) {
    return this.contactsService.adminDelete(Number(id));
  }
}
