import { describe, it, expect } from 'vitest';
import { parseNotificationEmail } from './notification-parse.js';

describe('parseNotificationEmail', () => {
  it('parses a Yape yapeo email', () => {
    const r = parseNotificationEmail({
      from: 'notificaciones@yape.com.pe',
      subject: 'Recibiste un yapeo',
      text: 'Juan Perez te envió un yapeo por S/ 150.00. N° de operación: 01234567. ¡Yapeaste!',
    });
    expect(r).toMatchObject({ provider: 'yape', amount: 150, currency: 'PEN', operationNumber: '01234567' });
  });

  it('parses a Plin email with código de operación', () => {
    const r = parseNotificationEmail({
      from: 'alertas@interbank.pe',
      subject: 'Te plinearon',
      text: 'Recibiste un Plin de S/ 1,234.50. Código de operación 998877.',
    });
    expect(r).toMatchObject({ provider: 'plin', amount: 1234.5, operationNumber: '998877' });
  });

  it('parses a bank transfer constancia', () => {
    const r = parseNotificationEmail({
      from: 'notificaciones@viabcp.com',
      subject: 'Constancia de transferencia',
      text: 'Transferencia recibida por S/ 80.00. Operación N° 55501234.',
    });
    expect(r).toMatchObject({ provider: 'transfer', amount: 80, operationNumber: '55501234' });
  });

  it('handles amount without an operation number', () => {
    const r = parseNotificationEmail({
      from: 'notificaciones@yape.com.pe',
      subject: 'Yapeo recibido',
      text: 'Recibiste un yapeo de S/ 25.50.',
    });
    expect(r).toMatchObject({ provider: 'yape', amount: 25.5, operationNumber: null });
  });

  it('rejects a non-payment email', () => {
    expect(parseNotificationEmail({
      from: 'newsletter@store.com', subject: 'Ofertas de la semana', text: 'Mira nuestras promociones.',
    })).toBeNull();
  });

  it('rejects a payment-ish email with no readable amount', () => {
    expect(parseNotificationEmail({
      from: 'notificaciones@yape.com.pe', subject: 'Yape', text: 'Tu operación fue procesada.',
    })).toBeNull();
  });

  it('reads USD amounts', () => {
    const r = parseNotificationEmail({
      from: 'notificaciones@interbank.pe', subject: 'Transferencia', text: 'Recibiste $ 40.00 por transferencia. Operación 12345678',
    });
    expect(r).toMatchObject({ currency: 'USD', amount: 40 });
  });
});
