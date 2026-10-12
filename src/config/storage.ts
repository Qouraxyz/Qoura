/*
 * Browser storage keys. Deliberately neutral (not the brand name), so renaming the project never
 * orphans what visitors' browsers already hold: inbox cursors, half-finished payments, practice notes.
 */
const PREFIX = "q1";
export const storageKey = (...parts: string[]) => [PREFIX, ...parts].join(".");
