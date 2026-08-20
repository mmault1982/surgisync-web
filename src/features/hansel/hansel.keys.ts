/**
 * The only place Hansel query keys are constructed.
 *
 * Rooted separately from `stockItemKeys` on purpose. Nothing on this page
 * shares a cache with inventory — receiving a kit cannot change a stored
 * credential, and saving a credential cannot change a kit — so a shared root
 * would have each screen's writes needlessly refetching the other's reads.
 */
export const hanselCredentialKeys = {
  all: ['hansel-credentials'] as const,
  list: () => [...hanselCredentialKeys.all, 'list'] as const,
};
