// A property name that reads as an attempt to reach a safety gate. Applied only to names
// the strict schema would reject anyway, so such a name is refused by name rather than as
// an unknown key.

export const FLUXNODE_SAFETY_WORD_PATTERN = /permission|consequence|scope|grant|captcha|robot|human.?check|person.?needed|secret|denied|screen|redact|credential/iu;
