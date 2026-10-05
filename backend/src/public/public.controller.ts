import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
import { SearchClinicsQuery } from './dto.js';
import { PublicService } from './public.service.js';

const CACHE = 'public, max-age=30';

@Public()
@Controller()
export class PublicController {
  constructor(private readonly svc: PublicService) {}

  @Get('specializations') @Header('Cache-Control', CACHE) specializations() { return this.svc.specializations(); }
  @Get('areas') @Header('Cache-Control', CACHE) areas() { return this.svc.areas(); }
  @Get('clinics') @Header('Cache-Control', CACHE) clinics(@Query() q: SearchClinicsQuery) { return this.svc.searchClinics(q); }
  @Get('clinics/:slug') @Header('Cache-Control', CACHE) clinic(@Param('slug') slug: string) { return this.svc.clinicBySlug(slug); }
  @Get('doctors/:slug') @Header('Cache-Control', CACHE) doctor(@Param('slug') slug: string) { return this.svc.doctorBySlug(slug); }
  @Get('sitemap-data') @Header('Cache-Control', CACHE) sitemap() { return this.svc.sitemap(); }
}
