/**
 * Pagination for All files → /api/files/filter (quick chips, advanced drawer, search).
 * ProjectsView uses its own multi-page helper; keep these defaults client-only.
 */

/** Rows requested per API page (Firestore limit for the paged query). */
export const FILTER_FILES_PAGE_SIZE = 100;

/**
 * Max cumulative pages (initial fetch + each "Load more") for one filter session.
 * Stops unbounded cursor walks; increase only with backend support / product need.
 */
export const FILTER_FILES_MAX_CUMULATIVE_PAGES = 15;

/**
 * Reserved ceiling for any future explicit full-scan job (not used by default UI).
 * Kept equal to {@link FILTER_FILES_MAX_CUMULATIVE_PAGES} for now.
 */
export const FILTER_FILES_MAX_PAGES_FULL_SCAN = 15;
