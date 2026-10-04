// Stack metadata shared by all pinx packages. Pure data, no Pi imports.
export const STACK_INFO = {
  name: "pi-ui-next",
  pinxNamespace: "pinx",
  contractVersion: 1,
  /** Channels this package consumes. Producers are optional at runtime. */
  consumes: ["pinx.activity", "pinx.context.status", "pinx.recovery", "pinx.telemetry"],
} as const;
