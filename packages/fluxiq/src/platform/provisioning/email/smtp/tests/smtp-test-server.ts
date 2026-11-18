import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { TLSSocket } from "node:tls";

/** What the test server received for one delivered message. */
export type ReceivedMail = {
  mailFrom: string;
  recipients: string[];
  data: string;
  secure: boolean;
  authenticatedAs: string | null;
};

/** How the in-process server behaves. */
export type SmtpTestServerOptions = {
  /** Offer STARTTLS with this key and certificate. */
  starttls?: { key: string; cert: string };
  /** Speak TLS from the first byte (smtps). */
  implicitTls?: { key: string; cert: string };
  /** Offer AUTH with these mechanisms and accept only these credentials. */
  auth?: { mechanisms: string[]; username: string; secret: string };
  /** Answer RCPT TO with this code. */
  recipientReply?: number;
  /** Answer EHLO with 502, so the client must fall back to HELO. */
  refuseEhlo?: boolean;
};

/** A running server: its port, what it received, every command line, and `close`. */
export type SmtpTestServer = {
  port: number;
  received: ReceivedMail[];
  commands: string[];
  close(): Promise<void>;
};

/**
 * A minimal SMTP server for the sender's tests: EHLO/HELO, STARTTLS, AUTH
 * PLAIN and LOGIN, MAIL, RCPT, DATA and QUIT, on 127.0.0.1 and a free port.
 * Multi-line EHLO replies are sent, so the client's reply parsing is real.
 */
export async function startSmtpTestServer(options: SmtpTestServerOptions = {}): Promise<SmtpTestServer> {
  const received: ReceivedMail[] = [];
  const commands: string[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    if (options.implicitTls) {
      const secure = new TLSSocket(socket, { isServer: true, key: options.implicitTls.key, cert: options.implicitTls.cert });
      secure.on("error", () => socket.destroy());
      converse(secure, true, options, received, commands);
      return;
    }
    converse(socket, false, options, received, commands);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    received,
    commands,
    close: () => new Promise<void>((resolve) => {
      for (const socket of sockets) socket.destroy();
      server.close(() => resolve());
    })
  };
}

function converse(initial: Duplex, initiallySecure: boolean, options: SmtpTestServerOptions, received: ReceivedMail[], commands: string[]): void {
  let stream = initial;
  let secure = initiallySecure;
  let buffer = "";
  let inData = false;
  let data = "";
  let mailFrom = "";
  let recipients: string[] = [];
  let authenticatedAs: string | null = null;
  let loginStep: "user" | "secret" | null = null;
  let loginUser = "";
  const reply = (text: string) => stream.write(`${text}\r\n`);
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString("latin1");
    for (let end = buffer.indexOf("\r\n"); end !== -1; end = buffer.indexOf("\r\n")) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (inData) {
        if (line === ".") {
          inData = false;
          received.push({ mailFrom, recipients, data, secure, authenticatedAs });
          reply("250 2.0.0 queued");
        } else data += `${line.startsWith("..") ? line.slice(1) : line}\r\n`;
        continue;
      }
      commands.push(line);
      if (loginStep === "user") {
        loginUser = Buffer.from(line, "base64").toString("utf8");
        loginStep = "secret";
        reply("334 UGFzc3dvcmQ6");
        continue;
      }
      if (loginStep === "secret") {
        loginStep = null;
        const ok = options.auth !== undefined && loginUser === options.auth.username && Buffer.from(line, "base64").toString("utf8") === options.auth.secret;
        if (ok) authenticatedAs = loginUser;
        reply(ok ? "235 2.7.0 ok" : "535 5.7.8 no");
        continue;
      }
      const verb = line.split(" ")[0]?.toUpperCase() ?? "";
      if (verb === "EHLO") {
        if (options.refuseEhlo) {
          reply("502 5.5.1 no EHLO");
          continue;
        }
        const lines = ["250-test.example says hello", "250-8BITMIME"];
        if (options.starttls && !secure) lines.push("250-STARTTLS");
        if (options.auth && (secure || !options.starttls)) lines.push(`250-AUTH ${options.auth.mechanisms.join(" ")}`);
        lines.push("250 SIZE 1000000");
        reply(lines.join("\r\n"));
      } else if (verb === "HELO") reply("250 test.example");
      else if (verb === "STARTTLS" && options.starttls) {
        reply("220 2.0.0 go ahead");
        stream.off("data", onData);
        const upgraded = new TLSSocket(stream as Socket, { isServer: true, key: options.starttls.key, cert: options.starttls.cert });
        upgraded.on("error", () => stream.destroy());
        stream = upgraded;
        secure = true;
        stream.on("data", onData);
      } else if (verb === "AUTH" && options.auth) {
        const [, mechanism = "", initial = ""] = line.split(" ");
        if (mechanism.toUpperCase() === "PLAIN") {
          const [, user = "", secret = ""] = Buffer.from(initial, "base64").toString("utf8").split("\u0000");
          const ok = user === options.auth.username && secret === options.auth.secret;
          if (ok) authenticatedAs = user;
          reply(ok ? "235 2.7.0 ok" : "535 5.7.8 no");
        } else {
          loginStep = "user";
          reply("334 VXNlcm5hbWU6");
        }
      } else if (verb === "MAIL") {
        mailFrom = line.slice("MAIL FROM:".length);
        recipients = [];
        reply("250 2.1.0 ok");
      } else if (verb === "RCPT") {
        recipients.push(line.slice("RCPT TO:".length));
        reply(`${options.recipientReply ?? 250} recipient ${line}`);
      } else if (verb === "DATA") {
        inData = true;
        data = "";
        reply("354 end with .");
      } else if (verb === "QUIT") {
        reply("221 bye");
        stream.end();
      } else reply("500 5.5.2 unknown");
    }
  };
  stream.on("data", onData);
  stream.on("error", () => stream.destroy());
  reply("220 test.example ESMTP ready");
}
