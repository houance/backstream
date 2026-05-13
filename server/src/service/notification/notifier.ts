import {
    execStatus,
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
import type { NotificationMessage } from "./types";

function getProxyAgent(channel: UpdateNotificationChannelSchema) {
    const httpProxy = client.get().httpProxy;
    if (httpProxy && channel.proxyStatus === 'Active') {
        return new ProxyAgent(httpProxy);
    }
    return undefined;
}

class SlackChannel {
    static async send(msg: NotificationMessage, channel: UpdateWebHookSchema) {
        // format message
        const statusEmoji = msg.status === execStatus.SUCCESS ? '✅' : '❌';
        const blocks: any[] = [
            { type: 'header', text: { type: 'plain_text', text: `${msg.type.toUpperCase()}: ${msg.repositoryName}` } },
            { type: 'section', fields: [
                    { type: 'mrkdwn', text: `*Status:*\n${msg.status}` },
                    { type: 'mrkdwn', text: `*Execution ID:*\n${msg.executionId}` }
                ]}
        ];
        switch (msg.type) {
            case 'backup':
                blocks.push({ type: 'section', fields: [
                        { type: 'mrkdwn', text: `*Bytes Added:*\n${msg.stats.bytesAdded}` },
                        { type: 'mrkdwn', text: `*Strategy:*\n${msg.strategyName}` }
                    ]});
                break;
            case 'check':
                blocks.push({ type: 'section', text: {
                        type: 'mrkdwn', text: `*Results:*\n${msg.stats.numErrors} errors found. ${msg.stats.healthy ? '✅' : '🚨'}`
                    }});
                break;
        }
        // send msg
        return await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(blocks),
            dispatcher: getProxyAgent(channel),
        });
    }
}

class DiscordChannel {
    static async send(msg: NotificationMessage, channel: UpdateWebHookSchema) {
        // format msg
        const embed: any = {
            title: `${msg.type.toUpperCase()} Report`,
            color: msg.status === 'success' ? 0x2ecc71 : 0xe74c3c,
            fields: [
                { name: 'Repo', value: msg.repositoryName, inline: true },
                { name: 'Duration', value: `${msg.duration}ms`, inline: true }
            ],
            timestamp: new Date(msg.startedAt).toISOString()
        };

        if (msg.type === 'backup') {
            embed.fields.push({ name: 'Files Added', value: msg.stats.filesAdded.toString(), inline: true });
        } else if (msg.type === 'check' && msg.stats.numErrors > 0) {
            embed.fields.push({ name: 'Errors', value: msg.stats.numErrors.toString() });
        }
        // send msg
        return await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(embed),
            dispatcher: getProxyAgent(channel),
        });
    }
}

class AppriseChannel {
    static async send(msg: NotificationMessage, channel: UpdateWebHookSchema) {
        // format msg
        const data = {
            title: `[${msg.status.toUpperCase()}] ${msg.type}: ${msg.repositoryName}`,
            body: msg.errorMessage || `Completed successfully in ${msg.duration}ms`,
            type: msg.status === 'fail' ? 'failure' : 'success'
        };
        // send msg
        return await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                urls: ['"json://"'],
                body: data.body,
                title: data.title,
                type: data.type,
            }),
            dispatcher: getProxyAgent(channel),
        });
    }
}

class NtfyChannel {
    static async send(msg: NotificationMessage, channel: UpdateWebHookSchema) {
        // format msg
        const priorityMap = { success: 3, fail: 5, reject: 4, running: 2, pending: 1, cancel: 2, kill: 5 };
        const data = {
            title: `${msg.type.toUpperCase()}: ${msg.repositoryName}`,
            message: msg.errorMessage || `Completed in ${msg.duration}ms`,
            priority: priorityMap[msg.status] || 3,
            tags: [msg.status === 'success' ? 'white_check_mark' : 'x', msg.type]
        };
        // send msg
        return await fetch(channel.config.webhookUrl, {
            method: 'POST',
            headers: {
                'Title': data.title,
                'Priority': String(data.priority),
                'Tags': data.tags.join(','),
            },
            body: data.message,
            dispatcher: getProxyAgent(channel),
        });
    }
}

class TelegramChannel {
    static async send(msg: NotificationMessage, channel: UpdateTelegramSchema) {
        // format msg
        const escapeTG = (text: string) => text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
        const title = `*${msg.status === 'success' ? '✅' : '❌'} ${msg.type.toUpperCase()}*`;
        let body = `Repo: ${escapeTG(msg.repositoryName)}\nID: \`${msg.executionId}\`\nDuration: ${msg.duration}ms`;
        switch (msg.type) {
            case 'backup':
                body += `\nAdded: *${msg.stats.bytesAdded}B* (${msg.stats.filesAdded} files)`;
                break;
            case 'check':
                body += `\nErrors: *${msg.stats.numErrors}*\nHealth: ${msg.stats.healthy ? 'Good' : 'Broken'}`;
                break;
        }
        // send msg
        return await fetch(`https://api.telegram.org/bot${channel.config.botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: channel.config.chatId, text: `${title}\n${body}`, parse_mode: 'MarkdownV2' }),
            dispatcher: getProxyAgent(channel)
        });
    }
}

class SMTPChannel {
    static async send(msg: NotificationMessage, channel: UpdateSMTPEmailSchema | UpdateSMTPServiceSchema) {
        // format msg
        const html = `
            <h2>${msg.type.toUpperCase()} - ${msg.status}</h2>
            <p>Repository: <b>${msg.repositoryName}</b></p>
            <p>Execution ID: ${msg.executionId}</p>
            ${msg.errorMessage ? `<p style="color:red">Error: ${msg.errorMessage}</p>` : ''}
        `;
        // send msg
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
            subject: `${msg.type.toUpperCase()} Report: ${msg.repositoryName} (${msg.status})`,
            html: html,
        });
    }
}

export class Notifier {

    /** BROADCAST: Sends a message to all enabled channels */
    public async send(msg: NotificationMessage) {
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