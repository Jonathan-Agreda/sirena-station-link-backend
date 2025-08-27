import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Role } from '@prisma/client'; // 👈 Importamos el enum para tipar correctamente

@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      username: string; // 👈 obligatorio
      email: string;
      role: Role;
      urbanizationId?: string;
      etapa?: string;
      manzana?: string;
      villa?: string;
      alicuota?: boolean;
    },
  ) {
    return this.svc.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      username: string;
      email: string;
      role: Role;
      etapa: string;
      manzana: string;
      villa: string;
      alicuota: boolean;
    }>,
  ) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
