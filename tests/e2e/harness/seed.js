'use strict';

/*
 * What the e2e database and storage start with. Specs import the same
 * constants, so a selector and the row it targets cannot drift apart.
 */

exports.USERS = Object.freeze({
    ADMIN: Object.freeze({du_id: '900000003', email: 'ada.admin@du.edu', first_name: 'Ada', last_name: 'Admin', role: 'admin'}),
    STAFF: Object.freeze({du_id: '900000002', email: 'sam.staff@du.edu', first_name: 'Sam', last_name: 'Staff', role: 'staff'}),
    /* authenticates at the identity provider, has no dashboard row */
    VIEWER: Object.freeze({du_id: '900000001'})
});

/* the text inside each generated PDF is its title */
exports.PDFS = Object.freeze([
    Object.freeze({uuid: '0e2e0001-0000-4000-8000-000000000001', filename: 'annual-report-2025', title: 'Annual Report 2025', hits: 5}),
    Object.freeze({uuid: '0e2e0002-0000-4000-8000-000000000002', filename: 'budget-summary', title: 'Budget Summary', hits: 2}),
    Object.freeze({uuid: '0e2e0003-0000-4000-8000-000000000003', filename: 'campus-map', title: 'Campus Map', hits: 0})
]);
