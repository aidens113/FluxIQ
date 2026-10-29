/** The minimum password length provisioning accepts. */
const MINIMUM_PASSWORD_LENGTH = 12;

/** The longest password accepted (the contract's own bound). */
const MAXIMUM_PASSWORD_LENGTH = 1024;

/** True for a password under 12 characters (or over the contract's 1024): `weak_password`. */
export function isWeakPassword(password: string): boolean {
  const length = [...password].length;
  return length < MINIMUM_PASSWORD_LENGTH || password.length > MAXIMUM_PASSWORD_LENGTH;
}
