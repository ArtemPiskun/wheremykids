import { Global, Module } from '@nestjs/common';
import { FamilyAccessService } from './family-access.service';

@Global()
@Module({ providers: [FamilyAccessService], exports: [FamilyAccessService] })
export class AccessModule {}
