import type { SVGProps } from "react";

/** Иконка раздела Ajax: щит с буквой «A» (в стиле lucide: контур, currentColor). */
export function AjaxIcon({ size = 24, strokeWidth = 2, ...props }: SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 2.5 4.5 5.5v6c0 4.6 3.1 8.1 7.5 10 4.4-1.9 7.5-5.4 7.5-10v-6L12 2.5Z" />
      <path d="m8.8 15.5 3.2-7 3.2 7" />
      <path d="M10 13.2h4" />
    </svg>
  );
}
