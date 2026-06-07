import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { StatusPage } from '../../domain/aggregates/StatusPage';
import {
  IStatusPageRepository,
  STATUS_PAGE_REPOSITORY,
} from '../../domain/repositories/IStatusPageRepository';
import { StatusPageEntity } from './entities/StatusPage.entity';
import { StatusPageMapper } from './StatusPageMapper';

@Injectable()
export class StatusPageRepository implements IStatusPageRepository {
  constructor(
    @InjectRepository(StatusPageEntity)
    private readonly repository: Repository<StatusPageEntity>,
  ) {}

  async save(statusPage: StatusPage): Promise<void> {
    const entity = StatusPageMapper.toEntity(statusPage);
    await this.repository.save(entity);
  }

  async findById(id: string): Promise<StatusPage | null> {
    const entity = await this.repository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!entity) return null;
    return StatusPageMapper.toDomain(entity);
  }

  async findBySlug(slug: string): Promise<StatusPage | null> {
    const entity = await this.repository.findOne({
      where: { slug, deletedAt: IsNull() },
    });

    if (!entity) return null;
    return StatusPageMapper.toDomain(entity);
  }

  async findByOrganization(organizationId: string): Promise<StatusPage[]> {
    const entities = await this.repository.find({
      where: { organizationId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    return entities.map((e) => StatusPageMapper.toDomain(e));
  }

  async findByWorkspace(workspaceId: string): Promise<StatusPage[]> {
    const entities = await this.repository.find({
      where: { workspaceId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    return entities.map((e) => StatusPageMapper.toDomain(e));
  }

  async findPublic(): Promise<StatusPage[]> {
    const entities = await this.repository.find({
      where: { isPublic: true, deletedAt: IsNull() },
      order: { title: 'ASC' },
    });

    return entities.map((e) => StatusPageMapper.toDomain(e));
  }

  async findByCustomDomain(domain: string): Promise<StatusPage | null> {
    const entity = await this.repository.findOne({
      where: {
        customDomain: domain,
        customDomainVerified: true,
        deletedAt: IsNull(),
      },
    });

    if (!entity) return null;
    return StatusPageMapper.toDomain(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repository.update(
      { id },
      { deletedAt: new Date() },
    );
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const queryBuilder = this.repository
      .createQueryBuilder('sp')
      .where('sp.slug = :slug', { slug })
      .andWhere('sp.deleted_at IS NULL');

    if (excludeId) {
      queryBuilder.andWhere('sp.id != :excludeId', { excludeId });
    }

    const count = await queryBuilder.getCount();
    return count > 0;
  }
}

export { STATUS_PAGE_REPOSITORY };
