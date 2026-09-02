/**
 * Shared access rules for templates. A template is either private (only its
 * owner can see or use it) or public (anyone, signed in or not, can view it,
 * fill it in, and generate documents from it — but still only the owner can
 * change its visibility or delete it).
 *
 * These are used everywhere the old `eq(templates.userId, session.user.id)`
 * WHERE clause used to live: the routes now fetch a row by id and decide here.
 */

type AccessRow = { userId: string | null; isPublic: boolean };

/** Can this user (possibly logged out) open and use the template? */
export function canViewTemplate(row: AccessRow, userId?: string): boolean {
  return row.isPublic || isTemplateOwner(row, userId);
}

/** Is this user the owner? Owner-only actions: publish toggle, delete. */
export function isTemplateOwner(row: { userId: string | null }, userId?: string): boolean {
  return !!userId && row.userId === userId;
}
