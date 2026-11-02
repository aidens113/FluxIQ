

export const permissionConstants = Object.freeze({
  VERB: /^[a-z]{2,20}(?: [a-z]{2,20})?$/,
  KIND: /^[a-z][a-z -]{0,31}$/,
  MAX_NAME_INPUT: 2_000,
  PLACE_TOKEN: /^[A-Za-z0-9:_-]{1,128}$/
});
