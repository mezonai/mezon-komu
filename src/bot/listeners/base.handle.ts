import { Injectable } from '@nestjs/common';
import { MezonClient } from 'mezon-sdk';
import { MezonClientService } from 'src/mezon/services/client.service';

@Injectable()
export abstract class BaseHandleEvent {
  protected client: MezonClient;
  constructor(clientService: MezonClientService) {
    this.client = clientService.getClient();
  }
}
