// Types
export interface ReceiptData {
  saleId: number;
  receiptHtml: string;
  receiptText: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  partnerName?: string;
  partnerPhone?: string;
  partnerEmail?: string;
}

export interface NotificationConfig {
  // Email
  email?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
    from: string;
  };
  // SMS (using generic provider - can be Twilio, local provider, etc.)
  sms?: {
    provider: 'twilio' | 'generic';
    // Twilio
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    twilioPhoneNumber?: string;
    // Generic HTTP API
    apiUrl?: string;
    apiKey?: string;
    senderId?: string;
  };
  // WhatsApp (WhatsApp Business API)
  whatsapp?: {
    provider: 'twilio' | 'meta' | 'generic';
    // Twilio
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    twilioWhatsAppNumber?: string;
    // Meta/WhatsApp Cloud API
    metaAccessToken?: string;
    metaPhoneNumberId?: string;
    // Generic HTTP API
    apiUrl?: string;
    apiKey?: string;
  };
}

interface NotificationResult {
  success: boolean;
  error: string;
}

// Default config from environment
function getConfig(): NotificationConfig {
  return {
    email: process.env.EMAIL_HOST ? {
      host: process.env.EMAIL_HOST!,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER!,
        pass: process.env.EMAIL_PASS!,
      },
      from: process.env.EMAIL_FROM || 'TOKOKU <noreply@tokoku.com>',
    } : undefined,
    sms: process.env.SMS_PROVIDER ? {
      provider: process.env.SMS_PROVIDER as 'twilio' | 'generic',
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
      apiUrl: process.env.SMS_API_URL,
      apiKey: process.env.SMS_API_KEY,
      senderId: process.env.SMS_SENDER_ID,
    } : undefined,
    whatsapp: process.env.WHATSAPP_PROVIDER ? {
      provider: process.env.WHATSAPP_PROVIDER as 'twilio' | 'meta' | 'generic',
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      twilioWhatsAppNumber: process.env.TWILIO_WHATSAPP_NUMBER,
      metaAccessToken: process.env.META_ACCESS_TOKEN,
      metaPhoneNumberId: process.env.META_PHONE_NUMBER_ID,
      apiUrl: process.env.WHATSAPP_API_URL,
      apiKey: process.env.WHATSAPP_API_KEY,
    } : undefined,
  };
}

// Email sender (using dynamic import for nodemailer)
async function sendEmail(config: NotificationConfig['email'], to: string, subject: string, html: string, text: string): Promise<NotificationResult> {
  if (!config) return { success: false, error: 'Email config not set' };

  try {
    // Dynamic import to avoid requiring nodemailer if not configured
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });

    await transporter.sendMail({
      from: config.from,
      to,
      subject,
      html,
      text,
    });

    return { success: true, error: '' };
  } catch (error: any) {
    console.error('Email send error:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

// SMS sender
async function sendSMS(config: NotificationConfig['sms'], to: string, message: string): Promise<NotificationResult> {
  if (!config) return { success: false, error: 'SMS config not set' };

  try {
    if (config.provider === 'twilio' && config.twilioAccountSid && config.twilioAuthToken && config.twilioPhoneNumber) {
      // Twilio implementation would go here
      // const twilio = require('twilio')(config.twilioAccountSid, config.twilioAuthToken);
      // await twilio.messages.create({ body: message, from: config.twilioPhoneNumber, to });
      console.log('[SMS-Twilio] Would send to:', to, 'Message:', message);
      return { success: true, error: '' };
    } else if (config.provider === 'generic' && config.apiUrl && config.apiKey) {
      // Generic HTTP API
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          to,
          message,
          sender_id: config.senderId,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`SMS API error: ${response.status}`);
      }
      return { success: true, error: '' };
    }
    return { success: false, error: 'Invalid SMS config' };
  } catch (error: any) {
    console.error('SMS send error:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

// WhatsApp sender
async function sendWhatsApp(config: NotificationConfig['whatsapp'], to: string, message: string, mediaUrl?: string): Promise<NotificationResult> {
  if (!config) return { success: false, error: 'WhatsApp config not set' };

  try {
    if (config.provider === 'twilio' && config.twilioAccountSid && config.twilioAuthToken && config.twilioWhatsAppNumber) {
      // Twilio WhatsApp
      console.log('[WhatsApp-Twilio] Would send to:', to, 'Message:', message);
      return { success: true, error: '' };
    } else if (config.provider === 'meta' && config.metaAccessToken && config.metaPhoneNumberId) {
      // Meta/WhatsApp Cloud API
      const response = await fetch(`https://graph.facebook.com/v18.0/${config.metaPhoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.metaAccessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`WhatsApp API error: ${JSON.stringify(error)}`);
      }
      return { success: true, error: '' };
    } else if (config.provider === 'generic' && config.apiUrl && config.apiKey) {
      // Generic HTTP API
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          to,
          message,
          media_url: mediaUrl,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`WhatsApp API error: ${response.status}`);
      }
      return { success: true, error: '' };
    }
    return { success: false, error: 'Invalid WhatsApp config' };
  } catch (error: any) {
    console.error('WhatsApp send error:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

// Main function to send receipt via multiple channels
export async function sendReceiptNotifications(receiptData: ReceiptData): Promise<{
  email: NotificationResult;
  sms: NotificationResult;
  whatsapp: NotificationResult;
}> {
  const config = getConfig();
  const results = {
    email: { success: false, error: 'Not configured' },
    sms: { success: false, error: 'Not configured' },
    whatsapp: { success: false, error: 'Not configured' },
  };

  // Determine recipient info
  const phoneNumber = receiptData.customerPhone || receiptData.partnerPhone;
  const emailAddress = receiptData.customerEmail || receiptData.partnerEmail;

  // Send Email
  if (config.email && emailAddress) {
    results.email = await sendEmail(
      config.email,
      emailAddress,
      `Struk Penjualan #${receiptData.saleId} - TOKOKU`,
      receiptData.receiptHtml,
      receiptData.receiptText
    );
  }

  // Send SMS
  if (config.sms && phoneNumber) {
    const shortMessage = `TOKOKU: Struk #${receiptData.saleId} - Total: ${receiptData.receiptText.match(/TOTAL: (Rp\s[\d.,]+)/)?.[1] || 'N/A'}. Terima kasih!`;
    results.sms = await sendSMS(config.sms, phoneNumber, shortMessage);
  }

  // Send WhatsApp
  if (config.whatsapp && phoneNumber) {
    results.whatsapp = await sendWhatsApp(config.whatsapp, phoneNumber, receiptData.receiptText);
  }

  return results;
}

// Helper to format phone number for Indonesian format
export function formatPhoneNumber(phone: string): string {
  // Remove non-digits
  let cleaned = phone.replace(/\D/g, '');
  
  // Convert to international format for Indonesia
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  } else if (!cleaned.startsWith('62')) {
    cleaned = '62' + cleaned;
  }
  
  return cleaned;
}