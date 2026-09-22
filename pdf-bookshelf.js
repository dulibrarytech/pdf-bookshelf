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

require('dotenv').config({quiet: true});

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const CONFIG = require('./config/config');
const LOGGER = require('./libs/log4');

/* before anything binds a port: refuse a configuration that would fail later and silently */
require('./config/validate').enforce(CONFIG, LOGGER.module());

/* logs "running at ..." once the port is actually bound, or one line and exit 1 if it cannot be */
const express = require('./config/express');
const app = express();

module.exports = app;
