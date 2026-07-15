/** Backend environments, mirroring the iOS spike's `AppEnvironment`. */

export type EnvName = "local" | "staging" | "production";

export interface AppEnvironment {
  name: EnvName;
  /**
   * All endpoint paths are appended to this URL. Trailing slashes are
   * required by the backend — every path constant must end in `/`.
   */
  baseUrl: string;
  /** Pill badge on the login screen; undefined in production (hidden). */
  badge?: { label: string; colorClasses: string };
}

const environments: Record<EnvName, AppEnvironment> = {
  local: {
    name: "local",
    // Relative: goes through the Vite dev-server proxy (see vite.config.ts)
    // because the backend's CORS config doesn't allow the Vite origin.
    baseUrl: "/api/v1/",
    badge: {
      label: "LOCAL",
      colorClasses: "text-blue-600 border-blue-600 bg-blue-600/15",
    },
  },
  staging: {
    name: "staging",
    baseUrl: "https://staging.surgisoftsolutions.com/api/v1/",
    badge: {
      label: "STAGING",
      colorClasses: "text-orange-500 border-orange-500 bg-orange-500/15",
    },
  },
  production: {
    name: "production",
    baseUrl: "https://www.surgisoftsolutions.com/api/v1/",
  },
};

/** The environment this build talks to. */
export const currentEnv: AppEnvironment = environments.local;
