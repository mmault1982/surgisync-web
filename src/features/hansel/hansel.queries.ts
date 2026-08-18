import { queryOptions } from '@tanstack/react-query';

import { hanselCredentialList } from '@/api/generated/endpoints/integrations/integrations';

import { hanselCredentialKeys } from './hansel.keys';

/**
 * Every Hansel credential the signed-in user administers.
 *
 * Unpaged on purpose: the collection is one row per (organization, workspace),
 * so a page control would be furniture around a list that is realistically one
 * or two items long. If an organization ever holds more than a page of
 * workspaces, this is where that stops being true.
 */
export const hanselQueries = {
  credentials: () =>
    queryOptions({
      queryKey: hanselCredentialKeys.list(),
      queryFn: ({ signal }) => hanselCredentialList(undefined, { signal }),
      // The global default is `retry: 1`, which doubles every request a
      // non-administrator makes — and 403 is the *expected* answer for them,
      // not a blip worth a second attempt.
      retry: false,
      select: (page) => page.results,
    }),
};
