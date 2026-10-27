import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth-context';
import { UuidParam } from '../../common/validation';
import { CreateChildDto, CreateFamilyDto, UpdateChildDto } from './families.dto';
import { FamiliesService } from './families.service';

@Controller({ path: 'families', version: '1' })
@Roles('parent')
export class FamiliesController {
  constructor(private readonly families: FamiliesService) {}

  @Get()
  async listMine(@CurrentUser() user: AuthUser) {
    return { families: await this.families.listMine(user) };
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFamilyDto) {
    return this.families.create(user, dto);
  }

  @Get(':familyId')
  get(@CurrentUser() user: AuthUser, @Param('familyId', UuidParam) familyId: string) {
    return this.families.get(user, familyId);
  }

  @Post(':familyId/children')
  addChild(@CurrentUser() user: AuthUser, @Param('familyId', UuidParam) familyId: string, @Body() dto: CreateChildDto, @Ip() ip: string) {
    return this.families.addChild(user, familyId, dto, ip);
  }

  @Patch(':familyId/children/:childId')
  updateChild(
    @CurrentUser() user: AuthUser,
    @Param('familyId', UuidParam) familyId: string,
    @Param('childId', UuidParam) childId: string,
    @Body() dto: UpdateChildDto,
  ) {
    return this.families.updateChild(user, familyId, childId, dto);
  }

  @Delete(':familyId/children/:childId')
  @HttpCode(204)
  async deleteChild(
    @CurrentUser() user: AuthUser,
    @Param('familyId', UuidParam) familyId: string,
    @Param('childId', UuidParam) childId: string,
    @Ip() ip: string,
  ): Promise<void> {
    await this.families.deleteChild(user, familyId, childId, ip);
  }
}
