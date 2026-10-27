import { Body, Controller, Get, HttpCode, Ip, Param, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth-context';
import { RateLimit } from '../../common/rate-limit';
import { UuidParam } from '../../common/validation';
import { HistoryQueryDto, LocationBatchDto } from './locations.dto';
import { LocationsService } from './locations.service';

@Controller({ version: '1' })
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Post('locations/batch')
  @Roles('child')
  @HttpCode(200)
  @RateLimit({ by: 'user', limit: 120, windowSec: 60 })
  ingest(@CurrentUser() user: AuthUser, @Body() dto: LocationBatchDto) {
    return this.locations.ingest(user, dto);
  }

  @Get('families/:familyId/locations/latest')
  @Roles('parent')
  async latest(@CurrentUser() user: AuthUser, @Param('familyId', UuidParam) familyId: string) {
    return { children: await this.locations.latestForFamily(user, familyId) };
  }

  @Get('children/:childId/history')
  @Roles('parent')
  history(@CurrentUser() user: AuthUser, @Param('childId', UuidParam) childId: string, @Query() q: HistoryQueryDto, @Ip() ip: string) {
    return this.locations.history(user, childId, new Date(q.from), new Date(q.to), q.simplify !== 'false', ip);
  }

  @Post('children/:childId/locate')
  @Roles('parent')
  @HttpCode(202)
  @RateLimit({ by: 'user', limit: 6, windowSec: 60 })
  async locate(@CurrentUser() user: AuthUser, @Param('childId', UuidParam) childId: string): Promise<{ requested: true }> {
    await this.locations.requestFreshLocation(user, childId);
    return { requested: true };
  }
}
