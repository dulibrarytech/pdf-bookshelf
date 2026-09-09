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
 * Ported from repo-backend-v2 so the workspace conventions are enforced the
 * same way in both apps: no var, const by default, strict equality, and
 * narrative comments as starred blocks.
 *
 * ESLint cannot parse .ejs, and these templates carry scriptlet JS. The gap is
 * covered by tests/unit/no_var_in_templates.test.js - the same split
 * repo-backend-v2 uses.
 */

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: [
            'node_modules/**',
            'logs/**',
            /* the PDF corpus, plus multer's staging directory */
            'storage/**',
            /*
             * Vendored third-party bundles: bootstrap and htmx are copied in by
             * `npm run vendor`, pdf.js by `npm run vendor:pdfjs`. Never lint or
             * --fix these - they are installed unmodified on purpose, which is
             * what keeps the pdf.js upgrade a re-run of a script.
             */
            'public/libs/**'
        ]
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: {
                ...globals.node
            }
        },
        rules: {
            'no-unused-vars': ['warn', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
            'no-console': 'off',
            'no-process-exit': 'off',
            eqeqeq: ['error', 'always'],
            'prefer-const': 'error',
            'no-var': 'error',
            /* CLAUDE.md: narrative comments are /* *\/ starred blocks */
            'multiline-comment-style': ['error', 'starred-block']
        }
    },
    {
        /* browser-side assets, served as static files to the dashboard */
        files: ['public/assets/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                /* vendored globals these scripts drive */
                htmx: 'readonly',
                bootstrap: 'readonly'
            }
        }
    }
];
