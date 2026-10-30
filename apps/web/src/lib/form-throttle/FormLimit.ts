/** At most `max` requests per `windowMs` for one key; the next request is refused until the window ends. */
export type FormLimit = { max: number; windowMs: number };
