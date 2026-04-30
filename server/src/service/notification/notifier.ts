import {
    type InsertNotificationChannelSchema,
    notificationChannels, updateNotificationChannelSchema,
    type UpdateSMTPEmailSchema,
    type UpdateTelegramSchema,
    type UpdateWebHookSchema
} from "@backstream/shared";
import {eq} from "drizzle-orm";
import {db} from "../db";
import {IncomingWebhook} from "@slack/webhook";
import {Bot} from "grammy";
import nodemailer from 'nodemailer';
import {SocksProxyAgent} from "socks-proxy-agent";
import { fetch, ProxyAgent } from 'undici';

class SlackChannel {
    static async send(msg: UnifiedMessage, channel: UpdateWebHookSchema) {
        const webhook = new IncomingWebhook(channel.config.webhookUrl);
        await webhook.send({ text: msg.body });
    }
}

class DiscordChannel {
    static async send(msg: UnifiedMessage, channel: UpdateWebHookSchema) {
        const proxyAgent = new ProxyAgent('http://172.17.144.1:10812');
        await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: msg.title ? `**${msg.title}**\n${msg.body}` : msg.body }),
            dispatcher: proxyAgent,
        });
    }
}

class TelegramChannel {
    static async send(msg: UnifiedMessage, channel: UpdateTelegramSchema) {
        const socksAgent = new SocksProxyAgent('socks5://172.17.144.1:10811')
        const bot = new Bot(channel.config.botToken, {
            client: {
                baseFetchConfig: {
                    agent: socksAgent,
                    compress: true,
                }
            }
        });
        await bot.api.sendMessage(channel.config.chatId, msg.body);
    }
}

class SMTPChannel {
    static async send(msg: UnifiedMessage, channel: UpdateSMTPEmailSchema) {
        const transporter = nodemailer.createTransport({
            host: channel.config.host,
            port: channel.config.port,
            secure: channel.config.secure,
            proxy: 'http://172.17.144.1:10810', // This is now recognized
            auth: {
                user: channel.config.auth.user,
                pass: channel.config.auth.pass,
            }
        } as nodemailer.TransportOptions);
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
                case 'SMTP': SMTPChannel.send(msg, row); break;
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