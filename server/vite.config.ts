import { defineConfig } from 'vite';
import devServer from '@hono/vite-dev-server';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [
        tsconfigPaths(),
        devServer({ entry: 'src/index.ts' })
    ],
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: 'src/index.ts',
            output: {
                entryFileNames: 'index.js', // Bundles into one file
            },
        },
        ssr: true, // Necessary for Node.js environments
    }
});
