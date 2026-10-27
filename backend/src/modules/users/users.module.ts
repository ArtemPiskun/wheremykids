import { Module } from '@nestjs/common';
import { ChildController, MeController } from './users.controller';
import { UsersService } from './users.service';

@Module({ controllers: [MeController, ChildController], providers: [UsersService] })
export class UsersModule {}
