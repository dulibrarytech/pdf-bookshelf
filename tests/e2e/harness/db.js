'use strict';

const FS = require('node:fs');
const PATH = require('node:path');
const KNEX = require('knex');
const DOTENV = require('dotenv');
const ENV = require('./env');

const NAME = ENV.VALUES.DB_NAME;
const DOTENV_PATH = PATH.join(ENV.ROOT, '.env');

if (!FS.existsSync(DOTENV_PATH)) {
    throw new Error('the e2e suite reads the MySQL host, port and credentials (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD) from the app .env, which is missing');
}

/*
 * The file is parsed rather than loaded: in the server process DB_NAME is
 * already the e2e name, so the environment cannot say which database the
 * developer actually uses - the file can, and start.js DROPS the e2e one.
 */
const LOCAL = DOTENV.parse(FS.readFileSync(DOTENV_PATH));

if ((LOCAL.DB_NAME || 'pdf_bookshelf') === NAME) {
    throw new Error(`refusing to run: .env names ${NAME} as the app database, and the e2e suite drops that database`);
}

function connection(database) {

    return {
        host: LOCAL.DB_HOST || '127.0.0.1',
        port: Number(LOCAL.DB_PORT) || 3306,
        user: LOCAL.DB_USER,
        password: LOCAL.DB_PASSWORD,
        database: database,
        charset: 'utf8mb4'
    };
}

/**
 * Drops the e2e database if it exists and creates it empty
 */
exports.recreate = async function () {

    const server = KNEX({client: 'mysql2', connection: connection(undefined)});

    try {
        await server.raw('DROP DATABASE IF EXISTS ??', [NAME]);
        await server.raw('CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [NAME]);
    } finally {
        await server.destroy();
    }
};

/**
 * A knex instance on the e2e database; the caller destroys it
 */
exports.connect = function () {

    return KNEX({
        client: 'mysql2',
        connection: connection(NAME),
        migrations: {directory: PATH.join(ENV.ROOT, 'knex/migrations')}
    });
};

exports.NAME = NAME;
