import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { UpdateEpkDto } from './dto/update-epk.dto';
import { EpkService } from './epk.service';

@ApiTags('epk')
@UseGuards(JwtAuthGuard)
@Controller('artists/:artistId/epk')
export class EpkController {
  constructor(private readonly epkService: EpkService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload, @Param('artistId') artistId: string) {
    return this.epkService.get(user.organizationId, artistId);
  }

  @Put()
  update(@CurrentUser() user: JwtPayload, @Param('artistId') artistId: string, @Body() dto: UpdateEpkDto) {
    return this.epkService.update(user.organizationId, artistId, dto);
  }
}
