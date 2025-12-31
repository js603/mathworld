import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    base: '/mathworld/',
    root: '.',
    resolve: {
        alias: {
            '@core': resolve(__dirname, '../src/core'),
            '@narrative': resolve(__dirname, '../src/narrative'),
            '@simulation': resolve(__dirname, '../src/simulation'),
            '@game': resolve(__dirname, '../src/game'),
            '@utils': resolve(__dirname, '../src/utils'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        port: 5173,
        open: true,
    },
});
