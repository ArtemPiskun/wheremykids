import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth-context';
import { AppError } from '../../common/errors';
import { UuidParam } from '../../common/validation';
import { CreateGeofenceDto, UpdateGeofenceDto } from './geofences.dto';
import { GeofencesService } from './geofences.service';

@Controller({ path: 'families/:familyId', version: '1' })
@Roles('parent')
export class GeofencesController {
  constructor(private readonly geofences: GeofencesService) {}

  @Get('geofences')
  async list(@CurrentUser() user: AuthUser, @Param('familyId', UuidParam) familyId: string) {
    return { geofences: await this.geofences.list(user, familyId) };
  }

  @Post('geofences')
  create(@CurrentUser() user: AuthUser, @Param('familyId', UuidParam) familyId: string, @Body() dto: CreateGeofenceDto) {
    return this.geofences.create(user, familyId, dto);
  }

  @Patch('geofences/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('familyId', UuidParam) familyId: string,
    @Param('id', UuidParam) id: string,
    @Body() dto: UpdateGeofenceDto,
  ) {
    return this.geofences.update(user, familyId, id, dto);
  }

  @Delete('geofences/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('familyId', UuidParam) familyId: string, @Param('id', UuidParam) id: string): Promise<void> {
    await this.geofences.remove(user, familyId, id);
  }

  @Get('geofence-events')
  async events(@CurrentUser() user: AuthUser, @Param('familyId', UuidParam) familyId: string, @Query('before') before?: string) {
    const beforeDate = before ? new Date(before) : undefined;
    if (beforeDate && Number.isNaN(beforeDate.getTime())) throw AppError.badRequest('INVALID_CURSOR', 'before must be an ISO date');
    return { events: await this.geofences.events(user, familyId, beforeDate) };
  }
}
