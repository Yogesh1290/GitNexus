import { WebContainer, FileSystemTree } from '@webcontainer/api';

let webcontainerInstance: WebContainer | null = null;
let currentAppProcess: any = null;
let serverReadyListenerOff: (() => void) | null = null;

export async function bootWebContainer(): Promise<WebContainer> {
    if (webcontainerInstance) {
        return webcontainerInstance;
    }

    // Call only once
    webcontainerInstance = await WebContainer.boot();
    return webcontainerInstance;
}

/**
 * Converts GitNexus flat file map into a nested WebContainer FileSystemTree
 */
export function buildFileSystemTree(fileContents: Record<string, string>): FileSystemTree {
    const tree: FileSystemTree = {};

    for (const [filePath, content] of Object.entries(fileContents)) {
        const parts = filePath.split('/');
        let currentLevel = tree;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isFile = i === parts.length - 1;

            if (isFile) {
                currentLevel[part] = {
                    file: {
                        contents: content,
                    },
                };
            } else {
                if (!currentLevel[part]) {
                    currentLevel[part] = {
                        directory: {},
                    };
                }
                currentLevel = (currentLevel[part] as any).directory;
            }
        }
    }

    return tree;
}

/**
 * Mounts the files and starts the install + dev process (or instant load)
 */
export async function startAppDevServer(
    files: Record<string, string>,
    onOutput: (data: string) => void,
    onServerReady: (url: string) => void
) {
    const container = await bootWebContainer();

    if (currentAppProcess) {
        onOutput('\r\n> Terminating background application process to free ports...\r\n');
        try { currentAppProcess.kill(); } catch (e) { }
        currentAppProcess = null;
    }

    if (serverReadyListenerOff) {
        serverReadyListenerOff();
        serverReadyListenerOff = null;
    }

    onOutput('\r\n> Booting WebContainer environment...\r\n');

    const manifestContent = files['gitnexus.json'];
    let isInstantStaticMode = false;
    let isInstantDynamicMode = false;
    let isInstantCloudDynamicMode = false;
    let serveDir = 'dist'; // default fallback for static
    let runFile = ''; // file to run for dynamic
    let bundleUrl = '';

    if (manifestContent) {
        try {
            const manifest = JSON.parse(manifestContent);
            if (manifest.type === 'static' && manifest.serve) {
                isInstantStaticMode = true;
                serveDir = manifest.serve;
                onOutput(`> GitNexus Manifest detected! Instant Load (Static) mode engaged.\r\n`);
            } else if (manifest.type === 'dynamic' && manifest.bundleUrl) {
                isInstantCloudDynamicMode = true;
                bundleUrl = manifest.bundleUrl;
                runFile = 'gitnexus-remote-bundle.cjs';
                onOutput(`> GitNexus Manifest detected! Instant Load (Cloud Dynamic) mode engaged.\r\n`);
            } else if (manifest.type === 'dynamic' && manifest.run) {
                isInstantDynamicMode = true;
                runFile = manifest.run;
                onOutput(`> GitNexus Manifest detected! Instant Load (Dynamic) mode engaged.\r\n`);
            }
        } catch (e) {
            onOutput(`> Warning: Invalid gitnexus.json syntax.\r\n`);
        }
    }

    // 2. If Static Instant Mode, inject our zero-dependency lightning server
    if (isInstantStaticMode) {
        files['nexus-server.mjs'] = `
import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 3000;
const SERVE_DIR = '${serveDir}';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.svg': 'image/svg+xml; charset=utf-8'
};

const server = http.createServer((req, res) => {
    let filePath = path.join(process.cwd(), SERVE_DIR, req.url === '/' ? 'index.html' : req.url);
    const extname = path.extname(filePath);
    let contentType = MIME_TYPES[extname] || 'text/plain';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                // Fallback for SPAs
                fs.readFile(path.join(process.cwd(), SERVE_DIR, 'index.html'), (err, fallbackContent) => {
                    if (err) {
                        res.writeHead(404);
                        res.end('404 Not Found');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(fallbackContent, 'utf-8');
                    }
                });
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log('[Nexus Server] Instant Load Server running on port', PORT);
});
`;
    }

    // 3. Mount Files
    const fileSystemTree = buildFileSystemTree(files);
    await container.mount(fileSystemTree);
    onOutput('> Files mounted successfully.\r\n');

    // 4. Execution Flow
    if (isInstantStaticMode) {
        // Fast Path: Zero Install Static Server
        onOutput('> ⚡ Instant Loading Static App...\r\n');
        currentAppProcess = await container.spawn('node', ['nexus-server.mjs']);
        currentAppProcess.output.pipeTo(
            new WritableStream({
                write(data) {
                    onOutput(data);
                },
            })
        );
    } else if (isInstantCloudDynamicMode) {
        // Fast Path: Cloud Remote Bundle
        onOutput(`> ☁️ Downloading remote bundle from ${bundleUrl}...\r\n`);
        try {
            let fetchUrl = bundleUrl;
            if (bundleUrl.includes('github.com')) {
                // Use our own native proxy (Vite local or Vercel serverless) to bypass CORS securely
                fetchUrl = `/api/proxy-bundle?url=${encodeURIComponent(bundleUrl)}`;
            }

            const fetchRes = await fetch(fetchUrl);
            if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}`);
            const buffer = await fetchRes.arrayBuffer();

            // Write to WebContainer FS
            await container.fs.writeFile(runFile, new Uint8Array(buffer));
            onOutput(`> ✅ Download complete. Booting application...\r\n`);

            currentAppProcess = await container.spawn('node', [runFile]);
            currentAppProcess.output.pipeTo(
                new WritableStream({
                    write(data) {
                        onOutput(data);
                    },
                })
            );
        } catch (err: any) {
            onOutput(`> ❌ Error loading remote bundle: ${err.message || err}\r\n`);
        }
    } else if (isInstantDynamicMode) {
        // Fast Path: Zero Install Pre-Bundled Dynamic Server
        onOutput(`> ⚡ Instant Loading Dynamic App (${runFile})...\r\n`);
        // We split the runFile command in case it's something like "node dist/server.js" vs just "dist/server.js"
        // But for simplicity of the spec, manifest.run should just be the file path: "dist/bundle.js"
        currentAppProcess = await container.spawn('node', [runFile]);
        currentAppProcess.output.pipeTo(
            new WritableStream({
                write(data) {
                    onOutput(data);
                },
            })
        );
    } else {
        // Standard Path: Install & Dev
        onOutput('> Running npm install...\r\n');
        const installProcess = await container.spawn('npm', ['install', '--no-progress', '--no-color']);
        installProcess.output.pipeTo(
            new WritableStream({
                write(data) {
                    onOutput(data);
                },
            })
        );

        const installExitCode = await installProcess.exit;
        if (installExitCode !== 0) {
            throw new Error('Installation failed');
        }

        onOutput('> Running npm run dev...\r\n');
        currentAppProcess = await container.spawn('npm', ['run', 'dev']);
        currentAppProcess.output.pipeTo(
            new WritableStream({
                write(data) {
                    onOutput(data);
                },
            })
        );
    }

    // 5. Wait for the server-ready event from WebContainer
    serverReadyListenerOff = container.on('server-ready', (port, url) => {
        onOutput(`\r\n> Server is ready at ${url} (port ${port})\r\n`);
        onServerReady(url);
    });
}
