import { Injectable } from '@nestjs/common';
import { PrismaService } from '../data/prisma.service';

@Injectable()
export class UrbanizationsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.urbanization.findMany();
  }

  async findOne(id: string) {
    return this.prisma.urbanization.findUnique({ where: { id } });
  }

  async create(data: { name: string; maxUsers: number }) {
    return this.prisma.urbanization.create({ data });
  }

  async update(id: string, data: Partial<{ name: string; maxUsers: number }>) {
    return this.prisma.urbanization.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.urbanization.delete({ where: { id } });
  }
}
