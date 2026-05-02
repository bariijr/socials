import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Setting } from './entities/setting.entity';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting) private settingRepo: Repository<Setting>,
    private config: ConfigService,
  ) {}

  async getAll(includePrivate = false) {
    const where: any = {};
    if (!includePrivate) where.isPublic = true;
    const settings = await this.settingRepo.find({ where });
    return settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {});
  }

  async get(key: string) {
    const s = await this.settingRepo.findOne({ where: { key } });
    return s?.value;
  }

  async set(key: string, value: string, options?: Partial<Setting>) {
    let s = await this.settingRepo.findOne({ where: { key } });
    if (s) {
      await this.settingRepo.update({ key }, { value, ...options });
    } else {
      s = this.settingRepo.create({ key, value, ...options });
      await this.settingRepo.save(s);
    }
    return { key, value };
  }

  async setBulk(settings: Record<string, string>) {
    const results = await Promise.all(
      Object.entries(settings).map(([key, value]) => this.set(key, value)),
    );
    return results;
  }

  getBranding() {
    return {
      name: this.config.get('branding.name'),
      tagline: this.config.get('branding.tagline'),
      primaryColor: this.config.get('branding.primaryColor'),
      secondaryColor: this.config.get('branding.secondaryColor'),
      logoUrl: this.config.get('branding.logoUrl'),
      faviconUrl: this.config.get('branding.faviconUrl'),
      footerText: this.config.get('branding.footerText'),
      supportEmail: this.config.get('branding.supportEmail'),
      supportPhone: this.config.get('branding.supportPhone'),
    };
  }
}
