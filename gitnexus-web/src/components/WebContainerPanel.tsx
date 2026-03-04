import { useEffect, useRef, useState } from 'react';
import { X, ExternalLink, Terminal, RefreshCw, Loader2, Maximize, Minimize, HelpCircle } from 'lucide-react';
import { useAppState } from '../hooks/useAppState';
import { startAppDevServer } from '../services/webcontainer';

// Helper to strip terminal ANSI escape codes from raw stdout
const stripAnsi = (str: string) => {
    // eslint-disable-next-line no-control-regex
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
};

export const WebContainerPanel = () => {
    const {
        isWebContainerOpen,
        setWebContainerOpen,
        webContainerUrl,
        setWebContainerUrl,
        webContainerTerminalOutput,
        setWebContainerTerminalOutput,
        fileContents,
        projectName
    } = useAppState();

    const terminalRef = useRef<HTMLPreElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const hasStartedRef = useRef(false);

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isTerminalVisible, setIsTerminalVisible] = useState(true);
    const [hackerLines, setHackerLines] = useState<string[]>([]);
    const [showGuide, setShowGuide] = useState(false);

    const leftTerminalRef = useRef<HTMLPreElement>(null);

    // Auto-scroll terminal
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [webContainerTerminalOutput]);

    // Boot the webcontainer on open
    useEffect(() => {
        if (isWebContainerOpen && !hasStartedRef.current && fileContents.size > 0) {
            hasStartedRef.current = true;
            setWebContainerTerminalOutput('');
            setWebContainerUrl(null);

            const filesObject: Record<string, string> = {};
            fileContents.forEach((content, path) => {
                filesObject[path] = content;
            });

            startAppDevServer(
                filesObject,
                (data) => setWebContainerTerminalOutput((prev) => prev + data),
                (url) => setWebContainerUrl(url)
            ).catch((err) => {
                setWebContainerTerminalOutput((prev) => prev + `\\r\\n\\r\\n[ERROR] ${err.message}`);
            });
        }

        // Reset tracker when closed so user can "Run" again later if they want to reboot
        if (!isWebContainerOpen) {
            hasStartedRef.current = false;
        }
    }, [isWebContainerOpen, fileContents]);

    // Generate fast-scrolling hacker logs on the left side during boot
    useEffect(() => {
        if (!isWebContainerOpen || webContainerUrl) {
            setHackerLines([]);
            return;
        }

        const packages = ['esbuild', 'react', 'next', 'vite', 'express', 'tailwindcss', 'lucide-react', 'typescript', 'zod', 'prisma', 'helmet', 'cors', 'node-gyp-fallback'];
        const actions = ['Transpiling', 'Linking', 'Verifying checksum', 'Extracting tarball', 'Caching', 'Parsing AST for', 'Optimizing'];

        const interval = setInterval(() => {
            setHackerLines(prev => {
                const randType = Math.random();
                let newLine = '';
                if (randType < 0.3) {
                    newLine = Array.from({ length: 8 }, () => Math.random() > 0.5 ? '01010011' : '01100101').join(' ');
                } else if (randType < 0.6) {
                    newLine = Array.from({ length: 12 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(' ').toUpperCase();
                } else {
                    const action = actions[Math.floor(Math.random() * actions.length)];
                    const pkg = packages[Math.floor(Math.random() * packages.length)];
                    newLine = `${action} ${pkg}@latest... [OK]`;
                }

                const hexPrefix = `0x${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase()} `;
                const newLines = [...prev, hexPrefix + newLine];
                if (newLines.length > 40) newLines.shift();
                return newLines;
            });
        }, 80);

        return () => clearInterval(interval);
    }, [isWebContainerOpen, webContainerUrl]);

    // Auto-scroll left terminal 
    useEffect(() => {
        if (leftTerminalRef.current) {
            leftTerminalRef.current.scrollTop = leftTerminalRef.current.scrollHeight;
        }
    }, [hackerLines, webContainerTerminalOutput]);

    const handleRefresh = () => {
        if (iframeRef.current && webContainerUrl) {
            iframeRef.current.src = webContainerUrl;
        }
    };

    if (!isWebContainerOpen) return null;

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all duration-300 ${isFullscreen ? 'p-0' : 'p-6'}`}>
            <div className={`bg-surface border border-border-subtle shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 transition-all ${isFullscreen
                ? 'w-full h-full rounded-none'
                : 'w-full max-w-6xl h-full max-h-[90vh] rounded-xl'
                }`}>

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-elevated">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-accent/10 flex items-center justify-center">
                            <Terminal className="w-4 h-4 text-accent" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-text-primary text-sm flex items-center gap-2">
                                Running: {projectName} <span className="text-xs font-normal text-text-muted px-2 py-0.5 bg-surface border border-border-subtle rounded-full">WebContainers OS</span>
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {webContainerUrl && (
                            <>
                                <button onClick={handleRefresh} className="p-2 text-text-muted hover:text-text-primary hover:bg-hover rounded-md transition-colors" title="Reload iframe">
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                                <a href={webContainerUrl} target="_blank" rel="noreferrer" className="p-2 text-text-muted hover:text-text-primary hover:bg-hover rounded-md transition-colors flex items-center gap-2" title="Open in new tab">
                                    <ExternalLink className="w-4 h-4" />
                                    <span className="text-xs">Open</span>
                                </a>
                            </>
                        )}
                        <div className="w-px h-4 bg-border-subtle mx-1" />

                        {/* Guide Popover */}
                        <div
                            className="relative flex items-center"
                            onMouseEnter={() => setShowGuide(true)}
                            onMouseLeave={() => setShowGuide(false)}
                        >
                            <button
                                onClick={() => setShowGuide(!showGuide)}
                                className="p-2 text-text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-colors flex items-center gap-1"
                                title="GitNexus Setup Guide"
                            >
                                <HelpCircle className="w-4 h-4" />
                                <span className="text-xs font-medium pr-1">Guide</span>
                            </button>

                            {showGuide && (
                                <div className="absolute right-0 top-full pt-2 z-50 animate-in fade-in slide-in-from-top-2">
                                    <div className="w-72 bg-[#050a08] border border-green-900/40 rounded-lg shadow-2xl p-4">
                                        <h4 className="text-green-400 font-mono text-xs font-bold mb-2 flex items-center gap-2 tracking-widest uppercase">
                                            <Terminal className="w-3 h-3" /> System Optimization
                                        </h4>
                                        <p className="text-green-500/70 text-xs leading-relaxed mb-3 font-mono">
                                            Standard WebContainer boots take time because NPM installs generic dependencies inside the browser.
                                        </p>
                                        <p className="text-green-500/70 text-xs leading-relaxed mb-4 font-mono">
                                            For Instant Multi-App Loads (1 second boot), use the <strong>Universal GitNexus Bundler</strong> to package your Node projects.
                                        </p>
                                        <a
                                            href="https://github.com/Yogesh1290/gitnexus-bundler"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center justify-center w-full px-3 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 rounded text-xs font-mono font-bold transition-all group"
                                        >
                                            View Bundler Setup Docs
                                            <ExternalLink className="w-3 h-3 ml-2 opacity-70 group-hover:opacity-100" />
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setIsTerminalVisible(!isTerminalVisible)}
                            className={`p-2 rounded-md transition-colors ${isTerminalVisible ? 'text-accent bg-accent/10' : 'text-text-muted hover:text-text-primary hover:bg-hover'}`}
                            title={isTerminalVisible ? "Hide Terminal" : "Show Terminal"}
                        >
                            <Terminal className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            className="p-2 text-text-muted hover:text-text-primary hover:bg-hover rounded-md transition-colors"
                            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                        >
                            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => setWebContainerOpen(false)}
                            className="p-2 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body Area */}
                <div className="flex-1 flex min-h-0 bg-void">

                    {/* Iframe View (Left) */}
                    <div className={`flex-1 relative flex flex-col bg-white ${isTerminalVisible ? 'border-r border-border-subtle' : ''}`}>
                        {!webContainerUrl ? (
                            <div className="absolute inset-0 flex flex-col bg-[#050a08] p-8 overflow-hidden z-50">
                                <div className="flex items-center gap-4 mb-6 shrink-0 z-10">
                                    <div className="w-12 h-12 rounded-full border-2 border-green-500/20 border-t-green-500 animate-spin flex items-center justify-center shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                                        <div className="w-8 h-8 rounded-full border border-green-500/10 border-b-green-400 animate-spin-reverse" />
                                    </div>
                                    <div>
                                        <h3 className="text-green-400 font-mono text-lg tracking-[0.2em] font-bold drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]">
                                            SECURE.COMPUTE_NODE
                                        </h3>
                                        <p className="text-green-500/60 font-mono text-xs mt-1 uppercase tracking-wider">
                                            {fileContents?.has('gitnexus.json') ? "Executing Instant Payload Sequence..." : "Compiling WebAssembly Architecture..."}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex-1 relative rounded border border-green-900/40 bg-black/40 overflow-hidden shadow-[inset_0_0_20px_rgba(34,197,94,0.05)]">
                                    <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] z-10 opacity-30" />
                                    <pre
                                        ref={leftTerminalRef}
                                        className="absolute inset-0 p-6 overflow-y-auto font-mono text-sm text-green-400/90 whitespace-pre-wrap break-words leading-relaxed"
                                        style={{ textShadow: '0 0 8px rgba(74,222,128,0.4)', scrollbarWidth: 'thin', scrollbarColor: '#22c55e transparent' }}
                                    >
                                        <div className="opacity-40">{hackerLines.join('\n')}</div>
                                        {hackerLines.length > 0 && <div className="my-4 border-b border-green-500/20 w-full" />}
                                        <div className="text-green-300 font-bold tracking-wide">
                                            {webContainerTerminalOutput ? stripAnsi(webContainerTerminalOutput) : '> INIT ROOT ACCESS...'}
                                            <span className="animate-pulse inline-block w-2.5 h-4 bg-green-400 align-middle ml-1 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
                                        </div>
                                    </pre>
                                </div>
                            </div>
                        ) : (
                            <iframe
                                ref={iframeRef}
                                src={webContainerUrl}
                                className="w-full h-full border-none bg-white"
                                title="App Execution"
                                allow="cross-origin-isolated"
                            />
                        )}
                    </div>

                    {/* Terminal View (Right) */}
                    {isTerminalVisible && (
                        <div className="w-96 flex flex-col bg-[#0a0f0d] border-l border-green-900/30 shrink-0 animate-in slide-in-from-right-10 duration-200">
                            <div className="px-4 py-2 text-[10px] font-mono text-green-500/50 uppercase tracking-widest border-b border-green-500/10 bg-green-500/[0.02]">
                                SYSTEM.STDOUT_STREAM
                            </div>
                            <pre
                                ref={terminalRef}
                                className="flex-1 p-4 overflow-y-auto text-[11px] font-mono text-green-400 whitespace-pre-wrap break-words leading-relaxed selection:bg-green-500/30"
                                style={{ paddingBottom: '2rem', textShadow: '0 0 10px rgba(74, 222, 128, 0.2)' }}
                            >
                                {webContainerTerminalOutput ? stripAnsi(webContainerTerminalOutput) : '> INIT COMPUTE INSTANCE...'}
                            </pre>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
