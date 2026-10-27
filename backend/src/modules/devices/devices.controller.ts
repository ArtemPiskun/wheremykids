import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Put } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth-context';
import { UuidParam } from '../../common/validation';
import { UpdateCurrentDeviceDto } from './devices.dto';
import { DevicesService } from './devices.service';

@Controller({ path: 'devices', version: '1' })
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @Roles('parent')
  async list(@CurrentUser() user: AuthUser) {
    return { devices: await this.devices.listVisible(user) };
  }

  @Put('current')
  @HttpCode(204)
  async updateCurrent(@CurrentUser() user: AuthUser, @Body() dto: UpdateCurrentDeviceDto): Promise<void> {
    await this.devices.updateCurrent(user, dto);
  }

  @Delete(':id')
  @Roles('parent')
  @HttpCode(204)
  async revoke(@CurrentUser() user: AuthUser, @Param('id', UuidParam) id: string, @Ip() ip: string): Promise<void> {
    await this.devices.revokeAsParent(user, id, ip);
  }
}
