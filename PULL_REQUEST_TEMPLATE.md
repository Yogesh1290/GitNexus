# Pull Request: In-Browser Execution via WebContainers & `gitnexus-bundler` integration

## Overview

📺 **[Watch the Video Demo here](https://youtu.be/hjlBrGLujPA)**

GitNexus currently provides exceptional static code intelligence—allowing users to understand what code does and how it connects through interactive knowledge graphs. 

This PR introduces the missing piece: **Execution**. 

By integrating `@webcontainer/api`, users can now transition from "I understand this code" to "I am running this app" in a single click. Everything runs entirely client-side in the browser, with no external compute servers or local installations required.

## Key Additions

### 1. Instant Run & `gitnexus-bundler` Integration
- Introduced native support for `gitnexus.json` manifests.
- Developers can use the companion [`gitnexus-bundler` CLI](https://www.npmjs.com/package/gitnexus-bundler) to compile their Node.js or full-stack React/Next.js apps into a single, self-contained `.cjs` output.
- When GitNexus detects a `gitnexus.json` pointing to a bundle, it engages **Instant Load Mode**. The bundle is fetched and booted inside the WebContainer in under 5 seconds—completely bypassing the slow, fragile `npm install` and compilation steps inside the browser.
- **UI:** A distinct **"Instant Run ⚡"** button appears in the header for these optimized repositories.

### 2. Universal WebContainer Fallback 
- For standard Node.js repositories without a manifest (but containing a `package.json`), GitNexus provides a standard **"Run App ▶"** button.
- GitNexus automatically mounts the repository tree into the WebContainer and attempts a standard execution sequence (`npm install` followed by `npm run dev`/`start`). While setup takes longer than Instant Run, it offers a seamless best-effort execution environment.

### 3. Integrated Terminal & Preview Panel
- Added a `WebContainerPanel` component that slides in seamlessly from the right.
- Features a secure terminal interface powered by `xterm.js` to display live build logs and server outputs.
- Includes a responsive `iframe` preview panel that automatically binds to and loads the exposed application port (e.g., `8080`) once the server is ready.

### 4. Optional Feature: GitNexus Marketplace
- As a demonstration of this execution capability, we've linked an optional community extension: the [GitNexus Marketplace](https://github.com/GitNexus-Marketplace/gitnexus-marketplace).
- This serves as an open, community-driven registry where users can discover and instantly boot compatible AI tools and applications optimized with `gitnexus-bundler`.
- *(Note: This marketplace integration is entirely opt-in and secondary. The core knowledge graph and indexing pipelines for standard repos remain completely unaffected).*

### 5. Direct URL Loading (Auto-Clone)
- Added routing support to dynamically clone and analyze GitHub repositories straight from the URL path.
- Users can navigate to `localhost:5173/github.com/owner/repo` (or their staging domain) to automatically trigger the cloning sequence without manually pasting URLs.
- Significantly improves onboarding flow when sharing links to specific repositories.

## Value Proposition
This transforms GitNexus from a code visualization platform into an **interactive cloud operating system**. It directly answers the user's next logical question after exploring a knowledge graph: *"Does it actually work?"* By closing the gap between analysis and execution, we remove all friction from testing open-source repositories.

## Technical Details & Review Notes
- **Dependencies Added:** `@webcontainer/api` and `xterm`.
- **Security Headers:** The WebContainer API intrinsically requires COOP/COEP isolation headers (`Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Opener-Policy: same-origin`) to be active on the GitNexus hosting server in order to enable `SharedArrayBuffer`.
- **Component Logic:** Header UI conditionally renders execution buttons strictly based on the presence of `gitnexus.json` or `package.json` in the parsed repository graph. All mounting logic reconstructs flat file arrays into the hierarchical trees required by the WebContainer filesystem.
