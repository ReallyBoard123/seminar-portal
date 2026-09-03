/**
 * The roster-import template offered by the "Fill template" button.
 *
 * Lives here rather than in actions.ts because a "use server" module may only
 * export async functions — a plain string export there throws at module
 * evaluation, which type checking and the build both let through.
 */

export const CSV_TEMPLATE = `name,email,institution,format
# format must be exactly one of: short_paper, full_paper, poster, workshop — or leave it blank
`;
