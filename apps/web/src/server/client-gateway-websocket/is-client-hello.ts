/** Whether one complete text message is a `client.hello` envelope; what the hello deadline waits for. */
export function isClientHelloText(message: string): boolean {
  if (!message.includes("client.hello")) return false;
  try {
    const parsed: unknown = JSON.parse(message);
    return typeof parsed === "object" && parsed !== null && (parsed as { type?: unknown }).type === "client.hello";
  } catch (error) {
    // Text that does not parse is not a hello; the gateway answers it as it answers any malformed message.
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}
