import { Body, Controller, Get, Patch, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Public: the landing page and the login page (both pre-auth) need to
  // read branding, and a browser's own favicon/logo <img>/<link> requests
  // never carry an Authorization header at all.
  @Public()
  @Get()
  get() {
    return this.settings.get();
  }

  @Roles('Admin')
  @Patch()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }

  @Roles('Admin')
  @Post('logo')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@UploadedFile() file: Express.Multer.File, @Body('user') user?: string) {
    return this.settings.uploadLogo(file, user);
  }

  @Roles('Admin')
  @Post('favicon')
  @UseInterceptors(FileInterceptor('file'))
  uploadFavicon(@UploadedFile() file: Express.Multer.File, @Body('user') user?: string) {
    return this.settings.uploadFavicon(file, user);
  }

  @Public()
  @Get('logo/file')
  async getLogoFile(@Res() res: Response) {
    const { filePath, mimeType } = await this.settings.getImageFile('logo');
    res.setHeader('Content-Type', mimeType);
    res.sendFile(filePath, { root: '.' });
  }

  @Public()
  @Get('favicon/file')
  async getFaviconFile(@Res() res: Response) {
    const { filePath, mimeType } = await this.settings.getImageFile('favicon');
    res.setHeader('Content-Type', mimeType);
    res.sendFile(filePath, { root: '.' });
  }
}
