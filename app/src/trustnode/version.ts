/**
 * Single source of truth for the pipeline version (DESIGN §20, BUG-003).
 * UI meta-lines and API responses import this — no hardcoded version
 * strings anywhere else.
 */
export const PIPELINE_VERSION = "0.2.0";
