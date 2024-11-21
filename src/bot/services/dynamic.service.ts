import { DynamicMezon } from '../models';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DynamicCommandService {
  private dynamicCommandList = [];
  constructor(
    @InjectRepository(DynamicMezon)
    private dynamicRepository: Repository<DynamicMezon>,
  ) {
    this.initDynamicCommandList();
  }

  getDynamicCommandList() {
    return this.dynamicCommandList;
  }

  async initDynamicCommandList() {
    const commands = await this.dynamicRepository.find({
      select: ['command'],
    });
    this.dynamicCommandList = commands.map((command) => command.command);
  }
}
