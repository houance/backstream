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