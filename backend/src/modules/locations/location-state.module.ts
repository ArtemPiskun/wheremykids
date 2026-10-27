import { Global, Module } from '@nestjs/common';
import { LocationStateStore } from './location-state.store';

@Global()
@Module({ providers: [LocationStateStore], exports: [LocationStateStore] })
export class LocationStateModule {}
