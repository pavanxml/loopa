import type { SVGProps } from "react";
const paths = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="7.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" />
    </>
  ),
  reels: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M3 8h18M7 3l4 5m3-5 4 5m-8 3 6 3.5-6 3.5Z" />
    </>
  ),
  message: (
    <>
      <path d="m21 3-7 18-3.5-7.5L3 10Z M10.5 13.5 21 3" />
    </>
  ),
  heart: (
    <>
      <path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 6l-1.1-1.2a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" />
    </>
  ),
  plus: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M12 7v10M7 12h10" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  bookmark: (
    <>
      <path d="M5 3h14v18l-7-5-7 5Z" />
    </>
  ),
  comment: (
    <>
      <path d="M21 11.5a9 9 0 1 0-4 7.5l4 1-1-4a9 9 0 0 0 1-4.5Z" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12M6 18 18 6" />
    </>
  ),
  arrow: (
    <>
      <path d="m9 5 7 7-7 7" />
    </>
  ),
  camera: (
    <>
      <path d="M8 5 9 3h6l1 2h4a1 1 0 0 1 1 1v14H3V6a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1.5" />
      <path d="m3 17 5-5 4 4 4-6 5 7" />
    </>
  ),
  volume: (
    <>
      <path d="m11 4-5 4H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
    </>
  ),
  mute: (
    <>
      <path d="m11 4-5 4H3v8h3l5 4Zm5 5 5 6m0-6-5 6" />
    </>
  ),
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  play: (
    <>
      <path d="m7 3 14 9-14 9Z" />
    </>
  ),
} satisfies Record<string, React.ReactNode>;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 24,
  filled = false,
  ...props
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
} & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
