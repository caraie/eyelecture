import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Institution } from './entities/institution.entity';
import { InstitutionDomain } from './entities/institution-domain.entity';
import {
  CreateInstitutionDto,
  normalizeDomain,
} from './dto/create-institution.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';

const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

@Injectable()
export class InstitutionsService {
  constructor(
    @InjectRepository(Institution)
    private readonly institutions: Repository<Institution>,
    @InjectRepository(InstitutionDomain)
    private readonly domains: Repository<InstitutionDomain>,
  ) {}

  async create(dto: CreateInstitutionDto): Promise<Institution> {
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug) {
      throw new BadRequestException('Could not derive a slug from the given name');
    }

    if (await this.institutions.exists({ where: { slug } })) {
      throw new ConflictException(`An institution with slug "${slug}" already exists`);
    }

    const requested = [...new Set((dto.domains ?? []).map(normalizeDomain))];
    await this.assertDomainsAreFree(requested);

    const institution = this.institutions.create({
      name: dto.name,
      slug,
      description: dto.description ?? null,
      logoUrl: dto.logoUrl ?? null,
      isActive: dto.isActive ?? true,
      domains: requested.map((domain) => this.domains.create({ domain })),
    });

    return this.institutions.save(institution);
  }

  async findAll(options?: { activeOnly?: boolean }): Promise<Institution[]> {
    return this.institutions.find({
      where: options?.activeOnly ? { isActive: true } : {},
      relations: { domains: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Institution> {
    const institution = await this.institutions.findOne({
      where: { id },
      relations: { domains: true },
    });
    if (!institution) throw new NotFoundException('Institution not found');
    return institution;
  }

  async update(id: string, dto: UpdateInstitutionDto): Promise<Institution> {
    const institution = await this.findOne(id);

    if (dto.slug && dto.slug !== institution.slug) {
      if (await this.institutions.exists({ where: { slug: dto.slug } })) {
        throw new ConflictException(
          `An institution with slug "${dto.slug}" already exists`,
        );
      }
      institution.slug = dto.slug;
    }

    if (dto.name !== undefined) institution.name = dto.name;
    if (dto.description !== undefined) institution.description = dto.description ?? null;
    if (dto.logoUrl !== undefined) institution.logoUrl = dto.logoUrl ?? null;
    if (dto.isActive !== undefined) institution.isActive = dto.isActive;

    return this.institutions.save(institution);
  }

  async remove(id: string): Promise<void> {
    const result = await this.institutions.delete({ id });
    if (!result.affected) throw new NotFoundException('Institution not found');
  }

  async addDomain(institutionId: string, rawDomain: string): Promise<Institution> {
    await this.findOne(institutionId);
    const domain = normalizeDomain(rawDomain);
    await this.assertDomainsAreFree([domain]);

    await this.domains.save(this.domains.create({ domain, institutionId }));
    return this.findOne(institutionId);
  }

  async removeDomain(institutionId: string, domainId: string): Promise<Institution> {
    const result = await this.domains.delete({ id: domainId, institutionId });
    if (!result.affected) throw new NotFoundException('Domain not found');
    return this.findOne(institutionId);
  }

  /**
   * Resolves the institution that owns an email domain. Used at registration time
   * to decide whether a signup can be auto-validated. Inactive institutions do not
   * auto-validate, so we filter on isActive here rather than at the call site.
   */
  async findByEmailDomain(domain: string): Promise<Institution | null> {
    const normalized = normalizeDomain(domain);
    if (!normalized) return null;

    const match = await this.domains.findOne({
      where: { domain: normalized },
      relations: { institution: true },
    });

    if (!match?.institution?.isActive) return null;
    return match.institution;
  }

  private async assertDomainsAreFree(domains: string[]): Promise<void> {
    if (domains.length === 0) return;

    const taken = await this.domains.find({
      where: domains.map((domain) => ({ domain })),
      relations: { institution: true },
    });

    if (taken.length > 0) {
      const detail = taken
        .map((d) => `${d.domain} (${d.institution?.name ?? 'another institution'})`)
        .join(', ');
      throw new ConflictException(`These domains are already registered: ${detail}`);
    }
  }
}
