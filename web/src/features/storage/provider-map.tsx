import React from "react";
import type {UseFormReturnType} from "@mantine/form";
import type {
    CertificateSchema,
    InsertRepositorySchema,
    RepoType,
    UpdateRepositorySchema
} from "@backstream/shared";
import OSSSubform from "./components/OSSSubForm.tsx";
import SFTPSubform from "./components/SFTPSubform.tsx";
import B2SubForm from "./components/B2SubForm.tsx";
import S3SubForm from "./components/S3SubForm.tsx";

interface ProviderMeta {
    component: React.FC<{
        form: UseFormReturnType<InsertRepositorySchema | UpdateRepositorySchema>,
        data: UpdateRepositorySchema | null
    }> | null // for local repo type
    initSubForm: CertificateSchema
}

export const PROVIDER_MAP: Record<RepoType, ProviderMeta> = {
    ALIYUN_OSS: {
        component: OSSSubform,
        initSubForm: {
            oss: {
                OSS_ACCESS_KEY_ID: "",
                OSS_SECRET_ACCESS_KEY: "",
                OSS_ENDPOINT: ""
            }
        }
    },
    SFTP: {
        component: SFTPSubform,
        initSubForm: {
            sftp: {
                SSH_AUTH_SOCK: ""
            }
        }
    },
    BACKBLAZE_B2: {
        component: B2SubForm,
        initSubForm: {
            b2: {
                B2_ACCOUNT_ID: "",
                B2_ACCOUNT_KEY: ""
            }
        }
    },
    S3: {
        component: S3SubForm,
        initSubForm: {
            s3: {
                AWS_ACCESS_KEY_ID: "",
                AWS_SECRET_ACCESS_KEY: "",
                AWS_DEFAULT_REGION: "",
                AWS_ENDPOINT: "",
                AWS_PROFILE: ""
            }
        }
    },
    AWS_S3: {
        component: S3SubForm,
        initSubForm: {
            s3: {
                AWS_ACCESS_KEY_ID: "",
                AWS_SECRET_ACCESS_KEY: "",
                AWS_DEFAULT_REGION: "",
                AWS_ENDPOINT: "",
                AWS_PROFILE: ""
            }
        }
    },
    LOCAL: {
        component: null,
        initSubForm: {}
    }
}