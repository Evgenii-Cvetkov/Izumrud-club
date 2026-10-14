import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

let transport: Transporter | null = null;

function getTransport() {
  if (!env.smtpHost) return null;
  transport ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined,
  });
  return transport;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Простой HTML из текста: абзацы и ссылки. */
function toHtml(text: string) {
  const paras = text
    .split(/\n{2,}/)
    .map((p) =>
      escapeHtml(p)
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#0B6E4F">$1</a>')
        .replace(/\n/g, "<br>"),
    )
    .map((p) => `<p style="margin:0 0 16px">${p}</p>`)
    .join("");
  return `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.55;color:#14302A;max-width:560px">${paras}<p style="margin:24px 0 0;color:#5B6E66;font-size:13px">Клуб «Изумруд»</p></div>`;
}

/**
 * Отправляет письмо. Без SMTP_HOST письмо печатается в лог — удобно в разработке.
 * Ошибка отправки не роняет вызывающий код, но пишется в лог.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const t = getTransport();
  if (!t) {
    console.info(`\n[mail → ${mail.to}] ${mail.subject}\n${mail.text}\n`);
    return true;
  }
  try {
    await t.sendMail({ from: env.mailFrom, to: mail.to, subject: mail.subject, text: mail.text, html: toHtml(mail.text) });
    return true;
  } catch (e) {
    console.error("[mail] не удалось отправить письмо", mail.to, e);
    return false;
  }
}

export const mailDevMode = () => !env.smtpHost;
