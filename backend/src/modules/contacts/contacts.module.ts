import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { EmailService } from '../../common/services/email.service';

@Module({
  controllers: [ContactsController],
  providers: [ContactsService, EmailService],
})
export class ContactsModule {}
