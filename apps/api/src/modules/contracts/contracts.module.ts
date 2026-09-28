import { Module } from '@nestjs/common';
import { ContractTemplatesService } from './contract-templates.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  controllers: [ContractsController],
  providers: [ContractsService, ContractTemplatesService],
})
export class ContractsModule {}
