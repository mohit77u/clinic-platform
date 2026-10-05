import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { IsBoolean, IsIn, IsNumberString, IsString } from 'class-validator';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { UserRole } from '../common/enums.js';
import { MAX_IMAGE_BYTES } from '../clinics/images.service.js';
import { DOC_TYPES, DocumentsService } from './documents.service.js';

class UploadDocDto {
  @IsIn(DOC_TYPES as unknown as string[]) docType: string;
}
class VerifyDocDto {
  @IsBoolean() verified: boolean;
}
class SignedQuery {
  @IsNumberString() exp: string;
  @IsString() sig: string;
}

@Controller()
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Roles(UserRole.SUPER_ADMIN)
  @Get('admin/clinics/:clinicId/documents')
  list(@Param('clinicId') clinicId: string) {
    return this.docs.list(clinicId);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post('admin/clinics/:clinicId/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  upload(@Param('clinicId') clinicId: string, @Body() dto: UploadDocDto, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() u: AuthUser) {
    if (!file) throw new BadRequestException('Attach a file in the "file" field');
    return this.docs.upload(clinicId, dto.docType, file.buffer, u.id);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Post('admin/documents/:docId/verify')
  verify(@Param('docId') docId: string, @Body() dto: VerifyDocDto, @CurrentUser() u: AuthUser) {
    return this.docs.setVerified(docId, dto.verified, u.id);
  }

  /** Issues a 5-minute signed link; the file itself is never listed or served from a guessable path. */
  @Roles(UserRole.SUPER_ADMIN)
  @Get('admin/clinics/:clinicId/documents/:docId/link')
  link(@Param('clinicId') clinicId: string, @Param('docId') docId: string, @CurrentUser() u: AuthUser) {
    return this.docs.link(clinicId, docId, u.id);
  }

  @Public()
  @Get('documents/:docId')
  async download(@Param('docId') docId: string, @Query() q: SignedQuery, @Res() res: Response) {
    const { data, mime } = await this.docs.read(docId, Number(q.exp), q.sig);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    res.end(data);
  }
}
