export const RepoType = {
    LOCAL: "LOCAL",
    SFTP: "SFTP",
    BACKBLAZE_B2: "BACKBLAZE_B2",
    ALIYUN_OSS: "ALIYUN_OSS",
    S3: "S3",
    AWS_S3: "AWS_S3",
} as const;

export type RepoType = typeof RepoType[keyof typeof RepoType];
