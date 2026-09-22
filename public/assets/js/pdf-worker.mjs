/**
 * Copyright 2026 University of Denver
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * Starts pdf.js's worker with browser-support.js in place. The worker has a
 * global of its own, so what the page loads does not reach it, and pdf.js's
 * worker calls the same new built-ins. The bundle stays unmodified: this is
 * what workerSrc points at, and it imports the real worker once the shims
 * are installed. Its own URL carries the bundle's version (v) and the app's
 * asset key (a), forwarded to the two imports so neither is served from a
 * stale cache after an upgrade.
 *
 * pdf.js waits for the worker's "ready" message before sending anything, so
 * nothing arrives before the real worker's listener exists. When a browser
 * cannot run the worker at all, pdf.js imports this same file on the main
 * thread and reads WorkerMessageHandler from it, so the worker's export is
 * passed through.
 */

const params = new URL(import.meta.url).searchParams;

function keyed(path, name) {
    const value = params.get(name);
    return value ? `${path}?${name}=${encodeURIComponent(value)}` : path;
}

await import(keyed('./browser-support.js', 'a'));
const worker = await import(keyed('../../libs/pdfjs/build/pdf.worker.mjs', 'v'));

export const WorkerMessageHandler = worker.WorkerMessageHandler;
