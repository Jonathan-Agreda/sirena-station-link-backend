import { Module } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { PrismaService } from '../data/prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, PrismaService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
