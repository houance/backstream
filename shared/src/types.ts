export const RepoType = {
    LOCAL: "LOCAL",
    SFTP: "SFTP",
    BACKBLAZE_B2: "BACKBLAZE_B2",
    ALIYUN_OSS: "ALIYUN_OSS",
    S3: "S3",
    AWS_S3: "AWS_S3",
} as const;

export type RepoType = typeof RepoType[keyof typeof RepoType];

export interface ResticCert {
    RESTIC_PASSWORD: string;
    // SFTP - SSH相关认证
    sftp?: {
        // SSH 相关（restic 依赖系统 SSH 配置）
        // 通常通过 SSH_AUTH_SOCK 使用 SSH 代理
        SSH_AUTH_SOCK?: string;        // SSH 代理套接字路径
    };
    // S3 (Amazon S3 或兼容服务)
    s3?: {
        AWS_ACCESS_KEY_ID?: string;     // AWS 访问密钥 ID
        AWS_SECRET_ACCESS_KEY?: string; // AWS 秘密访问密钥
        AWS_DEFAULT_REGION?: string;    // AWS 默认区域
        AWS_REGION?: string;            // AWS 区域（备选）
        AWS_ENDPOINT?: string;          // S3 自定义端点（用于兼容服务）
        AWS_PROFILE?: string;           // AWS 配置文件名
    };
    // Backblaze B2
    b2?: {
        B2_ACCOUNT_ID?: string;         // B2 账户 ID
        B2_ACCOUNT_KEY?: string;        // B2 账户密钥
    };
    // Aliyun OSS
    oss?: {
        OSS_ACCESS_KEY_ID?: string;     // OSS 访问密钥 ID
        OSS_SECRET_ACCESS_KEY?: string; // OSS 秘密访问密钥
        OSS_ENDPOINT?: string;          // OSS 端点地址
    };
}
