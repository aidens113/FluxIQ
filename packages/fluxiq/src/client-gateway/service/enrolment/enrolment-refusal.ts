/**
 * Why an enrolment ticket was refused, as `server.error.code` names it and the
 * audit records it, with the words the client is told. A refused hello is
 * closed; it never falls back to pairing.
 */
export const CLIENT_GATEWAY_ENROLMENT_REFUSALS = Object.freeze({
  unknown: Object.freeze({ code: "enrolment.unknown", message: "FluxIQ does not know this enrolment ticket, so this client was not enrolled." }),
  expired: Object.freeze({ code: "enrolment.expired", message: "This enrolment ticket expired before it was presented, so this client was not enrolled." }),
  used: Object.freeze({ code: "enrolment.used", message: "This enrolment ticket was presented before, and a ticket is good once, so this client was not enrolled." }),
  revoked: Object.freeze({ code: "enrolment.revoked", message: "A newer enrolment ticket for this host replaced this one, so this client was not enrolled." }),
  domainMismatch: Object.freeze({ code: "enrolment.domain_mismatch", message: "This client declared a domain its enrolment ticket was not issued for, so it was not enrolled." })
} as const);

export type ClientGatewayEnrolmentRefusalCode = (typeof CLIENT_GATEWAY_ENROLMENT_REFUSALS)[keyof typeof CLIENT_GATEWAY_ENROLMENT_REFUSALS]["code"];
