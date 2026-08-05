import { describe, expect, it } from 'vitest';

import { api } from '@/api/axios-instance';

describe('array query parameters', () => {
  /**
   * The failure this guards against is silent, which is why it is worth a test
   * of its own: axios' default serializer emits `manufacturer_id[]=5`, the
   * server reads `QueryDict.getlist('manufacturer_id')`, the bracketed key does
   * not match, and the filter is dropped. The user gets an unfiltered page with
   * no error and nothing in the UI to suggest anything went wrong.
   */
  it('serializes repeated keys, not bracketed indexes', () => {
    const uri = api.getUri({
      url: '/api/v1/stock-items/',
      params: { manufacturer_id: [5, 9] },
    });

    expect(uri).toBe('/api/v1/stock-items/?manufacturer_id=5&manufacturer_id=9');
    expect(uri).not.toContain('[]');
  });

  it('leaves scalar parameters alone', () => {
    const uri = api.getUri({
      url: '/api/v1/stock-items/',
      params: { page: 2, search: 'knee' },
    });

    expect(uri).toBe('/api/v1/stock-items/?page=2&search=knee');
  });
});
