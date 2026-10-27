import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';

@Module({ imports: [LocationsModule], controllers: [SosController], providers: [SosService] })
export class SosModule {}
