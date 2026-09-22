'use strict';

/*
 * A small, valid, single-page PDF carrying one line of text, built by hand so
 * the suite ships no binary fixtures. pdf.js renders it, and its text layer
 * carries the line, which is what the viewer spec looks for.
 */

/**
 * @param text one line, ASCII
 * @returns {Buffer}
 */
exports.pdf_bytes = function (text) {

    const escaped = String(text).replace(/[\\()]/g, (c) => '\\' + c);
    const content = `BT /F1 24 Tf 72 720 Td (${escaped}) Tj ET`;

    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];

    let body = '%PDF-1.4\n';
    const offsets = [];

    objects.forEach(function (object, index) {
        offsets.push(Buffer.byteLength(body));
        body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xref_at = Buffer.byteLength(body);
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

    for (const offset of offsets) {
        xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }

    body += `${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref_at}\n%%EOF\n`;

    return Buffer.from(body, 'latin1');
};
