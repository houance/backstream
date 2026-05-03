import {
    type InsertNotificationChannelSchema,
    notificationChannels, type UpdateNotificationChannelSchema, updateNotificationChannelSchema,
    type UpdateSMTPEmailSchema, type UpdateSMTPServiceSchema,
    type UpdateTelegramSchema,
    type UpdateWebHookSchema
} from "@backstream/shared";
import {eq} from "drizzle-orm";
import {db} from "../db";
import nodemailer from 'nodemailer';
import { fetch, ProxyAgent } from 'undici';
import { client } from '../setting/client';

function getProxyAgent(channel: UpdateNotificationChannelSchema) {
    const httpProxy = client.get().httpProxy;
    if (httpProxy && channel.proxyStatus === 'Active') {
        return new ProxyAgent(httpProxy);
    }
    return undefined;
}

class SlackChannel {
    static async send(msg: UnifiedMessage, channel: UpdateWebHookSchema) {
        await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: msg.title ? `**${msg.title}**\n${msg.body}` : msg.body }),
            dispatcher: getProxyAgent(channel),
        });
    }
}

class DiscordChannel {
    static async send(msg: UnifiedMessage, channel: UpdateWebHookSchema) {
        await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: msg.title ? `**${msg.title}**\n${msg.body}` : msg.body }),
            dispatcher: getProxyAgent(channel),
        });
    }
}

class AppriseChannel {
    static async send(msg: UnifiedMessage, channel: UpdateWebHookSchema) {
        await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                urls: ['"json://"'],
                body: msg.body,
                title: msg.title,
                type: 'info'
            }),
            dispatcher: getProxyAgent(channel),
        });
    }
}

class NtfyChannel {
    static async send(msg: UnifiedMessage, channel: UpdateWebHookSchema) {
        await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: {
                'Title': msg.title ?? 'Alert',
            },
            body: msg.body.trim(),
            dispatcher: getProxyAgent(channel),
        });
    }
}

class TelegramChannel {
    static async send(msg: UnifiedMessage, channel: UpdateTelegramSchema) {
        await fetch(`https://api.telegram.org/bot${channel.config.botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: channel.config.chatId, text: msg.body }),
            dispatcher: getProxyAgent(channel)
        });
    }
}

class SMTPChannel {
    static async send(msg: UnifiedMessage, channel: UpdateSMTPEmailSchema | UpdateSMTPServiceSchema) {
        const transportConfig: any = {
            auth: {
                user: channel.config.auth.user,
                pass: channel.config.auth.pass,
            },
            proxy: channel.proxyStatus === 'Active' ? client.get().httpProxy : undefined,
        };
        if ('service' in channel.config) {
            transportConfig.service = channel.config.service;
        } else {
            transportConfig.host = channel.config.host;
            transportConfig.port = channel.config.port;
            transportConfig.secure = channel.config.secure;
        }
        const transporter = nodemailer.createTransport(transportConfig);
        await transporter.sendMail({
            from: channel.config.from,
            to: channel.config.to,
            subject: msg.title || 'System Notification',
            text: msg.body,
        });
    }
}

export class Notifier {

    /** BROADCAST: Sends a message to all enabled channels */
    public async send(msg: UnifiedMessage) {
        const channels = await db
            .select()
            .from(notificationChannels)
            .where(eq(notificationChannels.channelStatus, 'Active'));
        if (!channels) return;
        const validated = updateNotificationChannelSchema.array().parse(channels);
        // Use allSettled so one failed channel doesn't stop the others
        return Promise.allSettled(validated.map(async (row) => {
            switch (row.category) {
                case 'SLACK': SlackChannel.send(msg, row); break;
                case 'DISCORD': DiscordChannel.send(msg, row); break;
                case 'TELEGRAM': TelegramChannel.send(msg, row); break;
                case 'NTFY': NtfyChannel.send(msg, row); break;
                case 'APPRISE': AppriseChannel.send(msg, row); break;
                case 'SMTP':
                case 'SMTP_SERVICE': SMTPChannel.send(msg, row); break;
                default: throw new Error(`not supported channel ${row.category}.`);
            }
        }));
    }

    /** MANAGEMENT: Register a new channel */
    public async register(input: InsertNotificationChannelSchema) {
        return await db.insert(notificationChannels).values(input).returning();
    }

    /** MANAGEMENT: Update existing channel config */
    public async update(id: number, config: any) {
        return await db.update(notificationChannels)
            .set({ config: JSON.stringify(config) })
            .where(eq(notificationChannels.id, id))
            .returning();
    }

    /** MANAGEMENT: Stop or start a channel */
    public async toggle(id: number, enabled: boolean) {
        return await db.update(notificationChannels)
            .set({ channelStatus: enabled ? 'Active' : 'Disabled' })
            .where(eq(notificationChannels.id, id))
            .returning();
    }

    /** MANAGEMENT: Remove a channel */
    public async remove(id: number) {
        return db.delete(notificationChannels).where(eq(notificationChannels.id, id)).returning();
    }
}

export type UnifiedMessage = { title?: string; body: string; };