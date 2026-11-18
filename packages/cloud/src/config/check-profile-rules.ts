import type { CloudConfigFile, CloudConfigIssue } from "./types.ts";

const MAIL_SINK = "smtp://mailpit:1025";
const PAYMENTS_SINK = "http://stripe-mock:12111";
const NOT_PUBLIC_SUFFIXES = [".localhost", ".local", ".test", ".invalid", ".internal"];
/** Host ports a deployment must never publish: 4000 is NoMachine's server (nxd), the operator's way into the machine. */
const RESERVED_HOST_PORTS: ReadonlyMap<number, string> = new Map([[4000, "NoMachine's remote-access server"]]);

/**
 * The rules that compare fields, run after the schema passed. They keep a
 * local rehearsal off real DNS, real mail and real money, and keep a
 * production config from carrying a rehearsal's sinks or unencrypted links.
 */
export function checkProfileRules(file: CloudConfigFile): CloudConfigIssue[] {
  const issues: CloudConfigIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const mailSink = file.sinks?.mail === true;
  const paymentsSink = file.sinks?.payments === true;
  const smtpScheme = file.email.smtp.slice(0, file.email.smtp.indexOf("://"));

  if (file.profile === "local") {
    if (file.tls.mode !== "internal") add("tls.mode", 'must be "internal" on the local profile: a rehearsal never asks a public certificate authority');
    if (!file.domain.endsWith(".localhost")) add("domain", "must end in .localhost on the local profile, so nothing reaches real DNS");
  } else {
    if (file.tls.mode !== "acme") add("tls.mode", 'must be "acme" on the production profile');
    if (NOT_PUBLIC_SUFFIXES.some((suffix) => file.domain.endsWith(suffix))) add("domain", "must be a public host name on the production profile");
    if (mailSink) add("sinks.mail", "must be off on the production profile: mail goes to a real relay");
    if (paymentsSink) add("sinks.payments", "must be off on the production profile: payments go to Stripe");
    if (smtpScheme === "smtp") add("email.smtp", "must be smtp+starttls:// or smtps:// on the production profile, so mail leaves encrypted");
    if (file.secrets?.dir === undefined) add("secrets.dir", "is required on the production profile: the server's secrets live where the operator keeps them");
  }

  if (file.tls.trustLocalCa === true && file.tls.mode !== "internal") add("tls.trustLocalCa", 'applies only to tls.mode "internal"');
  if ((file.email.username === undefined) !== (file.email.passwordFile === undefined)) add("email", "username and passwordFile go together");
  if (file.email.username !== undefined && smtpScheme === "smtp") add("email.smtp", "a relay that takes a sign-in needs smtp+starttls:// or smtps://; credentials are never sent unencrypted");
  if (mailSink && file.email.smtp !== MAIL_SINK) add("email.smtp", `must be ${MAIL_SINK} while sinks.mail is on`);
  if (!mailSink && file.email.smtp.includes("://mailpit:")) add("email.smtp", "names the Mailpit sink, which runs only with sinks.mail on");
  if (paymentsSink && file.payments.apiBase !== PAYMENTS_SINK) add("payments.apiBase", `must be ${PAYMENTS_SINK} while sinks.payments is on`);
  if (!paymentsSink && !file.payments.apiBase.startsWith("https://")) add("payments.apiBase", "must be https:// unless it is the stripe-mock sink");
  if (!paymentsSink && file.payments.secretKeyFile === undefined) add("payments.secretKeyFile", "is required unless the stripe-mock sink runs");
  if (file.sinks?.mailUiPort !== undefined && !mailSink) add("sinks.mailUiPort", "applies only with sinks.mail on");
  const http = file.ports?.http ?? 80;
  const https = file.ports?.https ?? 443;
  if (http === https) add("ports", "http and https need different ports");
  const published: [string, number][] = [["ports.http", http], ["ports.https", https]];
  if (mailSink) published.push(["sinks.mailUiPort", file.sinks?.mailUiPort ?? 8025]);
  for (const [path, port] of published) {
    const owner = RESERVED_HOST_PORTS.get(port);
    if (owner !== undefined) add(path, `must not be ${port}: that port belongs to ${owner}`);
  }
  const subnet = file.provisioning?.subnet;
  const address = file.provisioning?.address;
  if ((subnet === undefined) !== (address === undefined)) add("provisioning", "subnet and address go together");
  else if (subnet !== undefined && address !== undefined && !inSubnet(address, subnet)) add("provisioning.address", `must be inside ${subnet}`);
  return issues;
}

function inSubnet(address: string, subnet: string): boolean {
  const [base = "", bitsText = ""] = subnet.split("/");
  const bits = Number(bitsText);
  const value = (text: string) => text.split(".").reduce((total, part) => total * 256 + Number(part), 0);
  if (bits < 8 || bits > 30) return false;
  const size = 2 ** (32 - bits);
  return Math.floor(value(address) / size) === Math.floor(value(base) / size);
}
