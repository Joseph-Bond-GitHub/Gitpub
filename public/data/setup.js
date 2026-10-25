
/**
 * Gitpub SQL Playground
 *
 * Location: public/data/setup.js
 *
 * Uses PGlite to run PostgreSQL inside the browser.
 *
 * Features:
 * - Loads SQL files from stored_databases/
 * - Shows the entire SQL script in an editor
 * - Runs the script from beginning to end
 * - Stops when PostgreSQL encounters an error
 * - Displays SELECT results as tables
 * - Displays errors and affected row counts
 * - Starts with a clean database every time
 * - Never modifies the original SQL file
 */

import { PGlite } from 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.10/dist/index.js';


// ========================================
// AVAILABLE DATABASES
// ========================================

// Add more databases here in the future.

const DATABASES = [
    {
        id: 'books',
        label: 'Books',
        path: './stored_databases/books.sql'
    },

    // Example:
    // {
    //     id: 'university',
    //     label: 'University',
    //     path: './stored_databases/university.sql'
    // }
];


// ========================================
// HTML ELEMENTS
// ========================================

const $ = (id) => document.getElementById(id);

const editor = $('sql-editor');
const selector = $('database-select');
const output = $('sql-output');
const status = $('sql-status');

const runButton = $('run-sql');
const restoreButton = $('restore-sql');

const originalScripts = new Map();

let busy = false;
let selectedDatabase = DATABASES[0]?.id;


// ========================================
// OUTPUT FUNCTIONS
// ========================================

function setStatus(message) {
    if (status) {
        status.textContent = message;
    }
}

function clearOutput() {
    output?.replaceChildren();
}

function addLine(message, kind = '') {
    if (!output) return;

    const p = document.createElement('p');

    p.textContent = message;

    if (kind) {
        p.className = `sql-${kind}`;
    }

    output.append(p);
}


// ========================================
// DISPLAY SQL RESULTS
// ========================================

function renderResult(result, index) {

    const rows = result.rows ?? [];
    const fields = result.fields ?? [];

    if (fields.length) {

        addLine(
            `Result ${index}: ${rows.length} row(s) returned`
        );

        const wrapper = document.createElement('div');
        wrapper.className = 'sql-table-scroll';

        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const header = document.createElement('tr');

        // Create table headings

        for (const field of fields) {

            const th = document.createElement('th');

            th.textContent = field.name;

            header.append(th);
        }

        thead.append(header);
        table.append(thead);

        const tbody = document.createElement('tbody');

        // Display up to 250 rows

        for (const row of rows.slice(0, 250)) {

            const tr = document.createElement('tr');

            for (const field of fields) {

                const td = document.createElement('td');

                const value = row[field.name];

                td.textContent =
                    value === null || value === undefined
                        ? 'NULL'
                        : typeof value === 'object'
                            ? JSON.stringify(value)
                            : String(value);

                tr.append(td);
            }

            tbody.append(tr);
        }

        table.append(tbody);
        wrapper.append(table);
        output?.append(wrapper);

        if (rows.length > 250) {
            addLine(
                'Preview limited to 250 rows. Query processed in full.'
            );
        }

    } else {

        addLine(
            `Statement ${index}: ${result.affectedRows ?? 0} row(s) affected`
        );
    }
}


// ========================================
// LOAD A STORED DATABASE
// ========================================

async function loadDatabase(id) {

    const selected = DATABASES.find(
        db => db.id === id
    );

    if (!selected || !editor) return;

    selectedDatabase = id;

    clearOutput();

    try {

        setStatus(`Loading ${selected.label}...`);

        if (!originalScripts.has(id)) {

            const response = await fetch(
                selected.path,
                { cache: 'no-cache' }
            );

            if (!response.ok) {
                throw new Error(
                    `Could not load ${selected.path} (HTTP ${response.status})`
                );
            }

            const sqlText = await response.text();

            originalScripts.set(id, sqlText);
        }

        // Show the entire SQL file in the editor

        editor.value = originalScripts.get(id);

        setStatus(
            `Loaded ${selected.label}. Add SQL at the bottom, then press Run.`
        );

    } catch (error) {

        setStatus('Unable to load SQL file.');

        addLine(error.message, 'error');
    }
}


// ========================================
// EXECUTE THE ENTIRE SQL SCRIPT
// ========================================

async function runScript() {

    if (busy || !editor) return;

    busy = true;

    if (runButton) runButton.disabled = true;
    if (restoreButton) restoreButton.disabled = true;
    if (selector) selector.disabled = true;

    clearOutput();

    let pg;

    try {

        setStatus('Starting clean PostgreSQL database...');

        // Create a temporary PostgreSQL database

        pg = await PGlite.create({
            dataDir: 'memory://'
        });

        setStatus('Running entire script...');

        // Execute the full script.
        // PGlite handles multiple SQL statements.
        // Execution stops when PostgreSQL encounters an error.

        const results = await pg.exec(editor.value);

        // Display returned results

        results.forEach((result, i) => {
            renderResult(result, i + 1);
        });

        addLine(
            'Script finished successfully.',
            'success'
        );

        setStatus(
            `${results.length} statement result(s). Database discarded.`
        );

    } catch (error) {

        addLine(
            `Execution stopped: ${error.message}`,
            'error'
        );

        if (error.position) {

            addLine(
                `SQL error position: ${error.position}`,
                'error'
            );
        }

        setStatus(
            'Stopped at the first error. Database discarded.'
        );

    } finally {

        // Destroy the temporary database

        if (pg) {

            try {
                await pg.close();
            } catch (error) {
                console.warn(
                    'PGlite close error:',
                    error
                );
            }
        }

        busy = false;

        if (runButton) runButton.disabled = false;
        if (restoreButton) restoreButton.disabled = false;
        if (selector) selector.disabled = false;
    }
}


// ========================================
// INITIALISE PLAYGROUND
// ========================================

if (!editor || !runButton) {

    console.error(
        'Gitpub setup.js: page needs #sql-editor and #run-sql elements.'
    );

} else {

    // Populate the database dropdown

    for (const db of DATABASES) {

        if (!selector) break;

        const option = document.createElement('option');

        option.value = db.id;
        option.textContent = db.label;

        selector.append(option);
    }

    // Load database when selection changes

    selector?.addEventListener('change', () => {

        if (!busy) {
            loadDatabase(selector.value);
        }
    });

    // Run SQL button

    runButton.addEventListener(
        'click',
        runScript
    );

    // Restore original SQL file

    restoreButton?.addEventListener('click', () => {

        if (busy) return;

        const script = originalScripts.get(
            selectedDatabase
        );

        if (script !== undefined) {
            editor.value = script;
        }

        clearOutput();

        setStatus('Original SQL restored.');
    });

    // Load initial database

    loadDatabase(selectedDatabase);
}
