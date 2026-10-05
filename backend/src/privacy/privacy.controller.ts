import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { UserRole } from '../common/enums.js';
import { PrivacyService } from './privacy.service.js';

class DeleteRequestDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

@Controller()
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Roles(UserRole.PATIENT)
  @Get('me/data-export')
  export(@CurrentUser() u: AuthUser) {
    return this.privacy.export(u.id);
  }

  @Roles(UserRole.PATIENT)
  @Post('me/delete-request')
  @HttpCode(200)
  request(@CurrentUser() u: AuthUser, @Body() dto: DeleteRequestDto) {
    return this.privacy.requestDeletion(u.id, dto.reason);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Get('admin/privacy-requests')
  list() {
    return this.privacy.listRequests();
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post('admin/users/:userId/anonymize')
  @HttpCode(200)
  anonymize(@Param('userId') userId: string, @CurrentUser() admin: AuthUser) {
    return this.privacy.anonymize(userId, admin.id);
  }
}
