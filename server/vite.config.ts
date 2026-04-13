import { defineConfig, loadEnv } from 'vite';
import devServer from '@hono/vite-dev-server';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, import.meta.dirname, '');
    Object.assign(process.env, env);
    return {
        plugins: [
            tsconfigPaths(),
            devServer({ entry: path.join(import.meta.dirname, 'src', 'index.ts') })
        ],
        server: {
            port: 3000,
        },
        build: {
            outDir: 'dist',
            rollupOptions: {
                input: path.join(import.meta.dirname, 'src', 'index.ts'),
                output: {
                    entryFileNames: 'index.js', // Bundles into one file
                },
            },
            ssr: true, // Necessary for Node.js environments
        },
        ssr: {
            noExternal: ['hono']
        },
        optimizeDeps: {
            exclude: ['hono', 'unicorn-magic']
        }
    }
});
