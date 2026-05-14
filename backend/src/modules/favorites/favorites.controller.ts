import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FavoritesService } from './favorites.service';

@UseGuards(JwtAuthGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get('me')
  myFavorites(@CurrentUser() user: { userId: bigint }) {
    return this.favoritesService.myFavorites(user.userId);
  }

  @Post(':tourId')
  add(@CurrentUser() user: { userId: bigint }, @Param('tourId') tourId: string) {
    return this.favoritesService.add(user.userId, Number(tourId));
  }

  @Delete(':tourId')
  remove(@CurrentUser() user: { userId: bigint }, @Param('tourId') tourId: string) {
    return this.favoritesService.remove(user.userId, Number(tourId));
  }
}
