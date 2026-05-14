import { Controller, Get, Param, Patch, Query, Body, UseGuards, Post, Delete } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService } from './users.service';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  adminList(@Query() query: { page?: string; pageSize?: string; search?: string; status?: string }) {
    return this.usersService.adminList(query);
  }

  @Post()
  adminCreate(@Body() dto: AdminCreateUserDto) {
    return this.usersService.adminCreate(dto);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.usersService.findById(Number(id));
  }

  @Patch(':id')
  updateByAdmin(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.usersService.updateByAdmin(Number(id), dto);
  }

  @Delete(':id')
  deleteByAdmin(@Param('id') id: string) {
    return this.usersService.deleteByAdmin(Number(id));
  }

}
