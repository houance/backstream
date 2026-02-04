import type {RetentionPolicy} from "@backstream/shared";

export function formatBytes(bytes: number, decimals: number = 2): string {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function getRepositoryStats(usage: number, capacity: number): {usedStr: string, totalStr: string, percentage: number } {
    const percentage = capacity > 0 ? (usage / capacity) * 100 : 0;
    return {
        usedStr: formatBytes(usage),
        totalStr: formatBytes(capacity),
        percentage: Math.min(100, percentage), // Caps at 100% for visual safety
    };
}

export function formatTimestamp(timestampMs: number): string {
    return new Date(timestampMs).toLocaleString()
}

export function calculateCountdown(scheduledTimestamp: number): string {
    const now = Date.now();
    const diff = scheduledTimestamp - now;
    // If the time has already passed or is happening now
    if (diff <= 0) return 'Starting...';
    const totalMinutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

export function formatRetentionPolicy(policy: RetentionPolicy): string {
    const { type, windowType, countValue, durationValue, tagValue } = policy;

    // Helper to format the window (e.g., "daily" -> "daily", undefined -> "recent")
    const windowLabel = windowType?.toLowerCase() || "recent";
    const isUnlimited = (val?: string) => val === 'unlimited';

    switch (type) {
        case 'count':
            if (isUnlimited(countValue)) {
                return `Keep every ${windowLabel} backup.`;
            }
            return `Keep the ${countValue} most recent ${windowLabel} backups.`;

        case 'duration':
            if (isUnlimited(durationValue)) {
                return `Keep all ${windowLabel} backups.`;
            }
            if (windowType !== 'last') {
                // Simplified: "Keep one daily backup for everything in the last 2 years"
                return `Keep one ${windowLabel} backup for every ${windowLabel} period over the last ${durationValue}.`;
            }
            return `Keep every single backup taken within the last ${durationValue}.`;

        case 'tag':
            const tags = tagValue?.length ? tagValue.join(', ') : 'specific';
            return `Only keep backups that have these tags: ${tags}.`;

        default:
            return "Custom retention rule.";
    }
}
