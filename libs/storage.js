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

'use strict';

/*
 * Filesystem moves that refuse to destroy an existing file.
 *
 * fs.rename silently overwrites its destination, which makes it the wrong
 * primitive for publishing an upload into storage/: the caller's uniqueness
 * check runs against tbl_pdfs, and the database cannot see a file that has
 * no row - one dropped in by hand, or one sitting there between a restore
 * and the next re-sync. link() fails with EEXIST instead of clobbering, so
 * the check and the move agree about what "already exists" means.
 */

const FS = require('node:fs');

/**
 * Moves a file, failing rather than overwriting an existing destination.
 * Source and destination must be on the same filesystem (storage/.tmp and
 * storage/ are, by construction).
 * @param source
 * @param destination
 * @throws {Error} code EEXIST when the destination is already taken
 */
exports.move_exclusive = async function (source, destination) {

    /*
     * link is atomic: it either creates the name or fails - no window in
     * which a concurrent upload of the same name can slip past
     */
    await FS.promises.link(source, destination);

    try {
        await FS.promises.unlink(source);
    } catch {
        /*
         * the file IS published; a stranded staging copy is not worth failing
         * the upload over - the next .tmp sweep or restart clears it
         */
    }
};
