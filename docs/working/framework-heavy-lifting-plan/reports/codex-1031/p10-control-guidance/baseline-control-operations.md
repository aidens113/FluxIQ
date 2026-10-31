# Frozen original control-operation paragraphs

Source: P9 accepted Core0.23 flow-script-format.ts original A2/A3/A4, captured before edits. This is authored migration context, not runtime data. All three values must move unchanged.

SHA256 of JSON array: a018e68d494074a7c9eb859ca9689c6d39d2b1e208e45800b743b0b5b21d65da

````````json
[
  "An option in a dropdown is `node: web.dom.select` with the option's `value:`. A checkbox, a radio, or an option the page draws itself and shows chosen -- a colour swatch or size chip drawn apart from the others (`marked`), a `selected` tab, a `pressed` toggle -- is `node: web.dom.check` on that control itself, `checked: true` to choose it or `checked: false` to clear it; it presses only when the state differs, so it is right however the page arrives. Never look for a hidden box behind a swatch or chip: check the swatch or chip itself.",
  "Every option the instruction asks for gets its own step, even one the page arrives with already chosen: write it with `web.dom.check` or `web.dom.select`, which change nothing when the state is already right, so the Flow is right however a later run's page arrives. Press an option with `node: web.dom.click` only when the page shows no chosen state for it at all; `web.dom.check` refuses such a control and says so. A press is right for a control that does something each time it is pressed: apply, add, send, open, next.",
  "To set a box to a value, type the new value with `node: web.dom.type`: typing replaces whatever the box holds, so never clear it first. A box the page refills when it is emptied fails a clear step, while the typing step alone sets it."
]
````````
