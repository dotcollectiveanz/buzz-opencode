// OpenCode's official mark (MIT © 2025 opencode), from anomalyco/opencode
// `packages/identity/mark.svg` at 6a89e9f287ade1e1ceefc0e4d13df97ff7631567,
// unchanged apart from dropping the file's outer <svg> wrapper and its no-op
// colour-scheme style. See NOTICE.md.
import { React } from "./react";

export function OpenCodeIcon({
  size = "1em",
  ...props
}: { size?: number | string } & Record<string, unknown>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect width="512" height="512" fill="#131010" />
      <path d="M320 224V352H192V224H320Z" fill="#5A5858" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
        fill="white"
      />
    </svg>
  );
}
// React is read when the component renders, after the plugin applies.
void React;
