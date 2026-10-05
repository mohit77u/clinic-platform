import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { UserRole } from '../common/enums.js';
import { ClinicsService } from './clinics.service.js';
import {
  AddMemberDto, CreateClinicDto, GiftDaysDto, ListClinicsQuery, PublishDto, RejectDto, ReorderImagesDto, UpdateClinicDto,
} from './dto.js';
import { ClinicImagesService, MAX_IMAGE_BYTES } from './images.service.js';

@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/clinics')
export class AdminClinicsController {
  constructor(
    private readonly clinics: ClinicsService,
    private readonly images: ClinicImagesService,
  ) {}

  @Post() create(@Body() dto: CreateClinicDto, @CurrentUser() u: AuthUser) { return this.clinics.create(dto, u.id); }
  @Get() list(@Query() q: ListClinicsQuery) { return this.clinics.list(q); }
  @Get(':id') detail(@Param('id') id: string) { return this.clinics.detail(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateClinicDto, @CurrentUser() u: AuthUser) { return this.clinics.update(id, dto, u.id); }

  @Post(':id/publish') publish(@Param('id') id: string, @Body() dto: PublishDto, @CurrentUser() u: AuthUser) { return this.clinics.publish(id, dto.trialDays, u.id); }
  @Post(':id/reject') reject(@Param('id') id: string, @Body() dto: RejectDto, @CurrentUser() u: AuthUser) { return this.clinics.reject(id, dto.reason, u.id); }
  @Post(':id/suspend') suspend(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.clinics.suspend(id, u.id); }
  @Post(':id/reactivate') reactivate(@Param('id') id: string, @CurrentUser() u: AuthUser) { return this.clinics.reactivate(id, u.id); }
  @Post(':id/gift-days') gift(@Param('id') id: string, @Body() dto: GiftDaysDto, @CurrentUser() u: AuthUser) { return this.clinics.giftDays(id, dto.days, dto.reason, u.id); }

  @Post(':id/members') addMember(@Param('id') id: string, @Body() dto: AddMemberDto, @CurrentUser() u: AuthUser) { return this.clinics.addMember(id, dto, u.id); }
  @Delete(':id/members/:userId') removeMember(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() u: AuthUser) { return this.clinics.removeMember(id, userId, u.id); }

  @Get(':id/images') async listImages(@Param('id') id: string) { await this.clinics.getOrFail(id); return this.images.list(id); }

  @Post(':id/images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  async addImage(@Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body('caption') caption?: string) {
    if (!file) throw new BadRequestException('Attach an image in the "file" field');
    await this.clinics.getOrFail(id);
    return this.images.add(id, file.buffer, caption);
  }

  @Put(':id/images/order') async reorder(@Param('id') id: string, @Body() dto: ReorderImagesDto) { await this.images.reorder(id, dto.ids); return { ok: true }; }
  @Post(':id/images/:imageId/cover') async cover(@Param('id') id: string, @Param('imageId') imageId: string) { await this.images.setCover(id, imageId); return { ok: true }; }
  @Delete(':id/images/:imageId') async removeImage(@Param('id') id: string, @Param('imageId') imageId: string) { await this.images.remove(id, imageId); return { ok: true }; }
}
