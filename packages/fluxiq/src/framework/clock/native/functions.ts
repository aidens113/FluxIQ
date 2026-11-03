const dateDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Date");
const date: unknown = dateDescriptor && "value" in dateDescriptor ? dateDescriptor.value : undefined;
const nowDescriptor = typeof date === "function" ? Object.getOwnPropertyDescriptor(date, "now") : undefined;
const now: unknown = nowDescriptor && "value" in nowDescriptor ? nowDescriptor.value : undefined;
const mathDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Math");
const math: unknown = mathDescriptor && "value" in mathDescriptor ? mathDescriptor.value : undefined;
const randomDescriptor = math !== null && typeof math === "object" ? Object.getOwnPropertyDescriptor(math, "random") : undefined;
const random: unknown = randomDescriptor && "value" in randomDescriptor ? randomDescriptor.value : undefined;

/** Bootstrap platform identities; descriptor reads do not invoke accessors. */
export const originalNativeClockFunctions = Object.freeze({ date, now, math, random });
