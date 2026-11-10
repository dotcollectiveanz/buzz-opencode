// Buzz supplies React as `ctx.react`; a plugin must never bundle its own. Every
// component reads it from here, set once when the plugin applies. JSX compiles
// to `React.createElement` against this binding.
import type * as ReactTypes from "react";

export let React: typeof ReactTypes;
export function setReact(value: typeof ReactTypes) {
  React = value;
}
