import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../logger.js';

// Outbound transactional email over SMTP. When SMTP isn't configured (no host),
// email is disabled and callers fall back to logging — so dev works with no
// setup and production works once the SMTP_* env vars are set.

const transport = config.smtpHost
  ? nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
    })
  : null;

export function isEmailEnabled(): boolean {
  return transport !== null;
}

export async function sendMail(opts: { to: string; subject: string; text: string; html?: string; replyTo?: string }): Promise<void> {
  if (!transport) {
    logger.warn({ to: opts.to, subject: opts.subject }, 'email disabled (no SMTP) — not sent');
    return;
  }
  await transport.sendMail({ from: config.smtpFrom, ...opts });
}

// Password-reset email. Logs the link when email is disabled so a dev can still
// complete the flow from the console.
export async function sendPasswordReset(to: string, link: string): Promise<void> {
  if (!transport) {
    logger.info({ to, link }, 'PASSWORD RESET LINK (email disabled — copy this to reset)');
    return;
  }
  await sendMail({
    to,
    subject: 'Restablece tu contraseña de WABOS',
    text: `Recibimos una solicitud para restablecer tu contraseña.\n\nAbre este enlace para elegir una nueva (válido por 1 hora):\n${link}\n\nSi no fuiste tú, ignora este correo.`,
    html: `<p>Recibimos una solicitud para restablecer tu contraseña.</p>
<p><a href="${link}">Elegir una nueva contraseña</a> (válido por 1 hora).</p>
<p style="color:#888">Si no fuiste tú, ignora este correo.</p>`,
  });
}
