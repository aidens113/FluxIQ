import type { FluxIQProfile } from "@fluxiq/contracts/platform";

/** Every lane-A deployment setting, resolved once from the environment. */
export type FluxIQDeploymentSettings = {
  profile: FluxIQProfile;
  public: boolean;
  publicOrigin: string;
  gateway: {
    enabled: boolean;
    host: string;
    port: number;
    path: string;
    loopbackBind: boolean;
    publicUrl: string;
    allowedOrigins: string[] | undefined;
    limits: {
      maxFrameBytes: number;
      helloDeadlineMs: number | null;
      messagesPerSecond: number | null;
      messageBurst: number | null;
      pendingPairingsPerAddress: number | null;
      pendingPairingsTotal: number;
    };
  };
  trustProxy: boolean;
  drainSeconds: number;
  /** The panel session carrier: its name and whether it is marked Secure (`__Host-` on an https origin). */
  session: { name: "fluxiq_session" | "__Host-fluxiq_session"; secure: boolean };
  setupCodeFile: string | null;
  logFormat: "text" | "json";
};
