import { Global, Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Global()
@Module({ controllers: [DevicesController], providers: [DevicesService], exports: [DevicesService] })
export class DevicesModule {}
