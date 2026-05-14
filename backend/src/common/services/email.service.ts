import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

@Injectable()
export class EmailService {
  private createTransporter() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      throw new Error('Chưa cấu hình SMTP_USER và SMTP_PASS để gửi email.');
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  async sendMail(input: SendMailInput) {
    const transporter = this.createTransporter();
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'Travela <no-reply@travela.local>';
    return transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}
