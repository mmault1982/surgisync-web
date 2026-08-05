import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';

import { WEB_AUTH_PREFIX, endSession, getAccessToken, refreshAccessToken } from '@/auth/auth-store';

export const api = axios.create({
  // Relative in every environment. In dev this goes through the Vite proxy so
  // the app is same-origin with the API, which is what lets the browser accept
  // and return the host-only, SameSite=Lax refresh cookie at all. Deployed, the
  // same relative path is routed to the API. The build artifact is therefore
  // environment-agnostic — there is no VITE_API_URL to get wrong.
  baseURL: '/',

  // NOT optional. The six array query parameters on /stock-items/
  // (manufacturer_id, ownership_type, physical_location, ...) have no
  // style/explode in the contract, so axios' default emits
  //     manufacturer_id[]=5&manufacturer_id[]=9
  // The server reads them with QueryDict.getlist('manufacturer_id'), which does
  // not match the bracketed key, so the filter is SILENTLY IGNORED: the user
  // gets an unfiltered page, with no error and nothing to notice in the UI.
  // The correct value is `null`, and the two wrong ones both look plausible —
  // from axios' toFormData.js:
  //     indexes === true  -> manufacturer_id[0]=5&manufacturer_id[1]=9
  //     indexes === null  -> manufacturer_id=5&manufacturer_id=9   <- this one
  //     anything else     -> manufacturer_id[]=5&manufacturer_id[]=9
  // so `false` produces brackets, not bare keys. Regression-tested in
  // src/api/__tests__/axios-instance.test.ts, which caught exactly that.
  paramsSerializer: { indexes: null },
});

type RetriableConfig = AxiosRequestConfig & { _retried?: boolean };

/**
 * Attach exactly one credential, never both.
 *
 * The refresh cookie is httpOnly, host-only and Path=/api/v1/web/, so the
 * browser would not send it elsewhere anyway — setting `withCredentials`
 * narrowly makes that structural rather than incidental.
 */
api.interceptors.request.use((config) => {
  const url = config.url ?? '';

  if (url.startsWith(WEB_AUTH_PREFIX)) {
    config.withCredentials = true;
    return config;
  }

  config.withCredentials = false;
  const token = getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

/** On 401: refresh once (single-flight), then retry the original request. */
api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  if (!config || error.response?.status !== 401) throw error;

  // The single most important line in this file. /api/v1/web/login/ 401s on
  // bad credentials and /api/v1/web/refresh/ 401s on a dead cookie; routing
  // either into the refresh path is an infinite loop, and it would burn the
  // 10/min login bucket while doing it.
  if (config.url?.startsWith(WEB_AUTH_PREFIX)) throw error;

  // One retry per request. A 401 issued for a reason other than expiry — a
  // revoked user, the wrong organization — would otherwise loop forever.
  if (config._retried) throw error;
  config._retried = true;

  try {
    await refreshAccessToken();
    // No need to set the header here: re-entering `api()` runs the request
    // interceptor again, and it reads the token that refreshAccessToken just
    // stored. Setting it manually would be a second place to keep in sync.
    return await api(config);
  } catch {
    endSession();
    // Rethrow the ORIGINAL 401 so the caller sees the request that actually
    // failed, not the refresh that failed while trying to rescue it.
    throw error;
  }
});

/** The orval mutator. Every generated hook funnels through here. */
export const apiRequest = async <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const response = await api<T>({ ...config, ...options });
  return response.data;
};

export type ErrorType<E> = AxiosError<E>;
export type BodyType<B> = B;
