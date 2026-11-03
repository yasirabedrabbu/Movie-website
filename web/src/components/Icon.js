import { HugeiconsIcon } from "@hugeicons/react";

// One wrapper so size and stroke stay the same everywhere.
// Icons are decorative: the button or link around them carries the label.
export default function Icon({ icon, size = 20, strokeWidth = 1.75, ...rest }) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
}