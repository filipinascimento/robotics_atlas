export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    moon: <path d="M20 14.2A8.5 8.5 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />,
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8m-4-4v4" />
      </>
    ),
    network: (
      <>
        <circle cx="5" cy="7" r="2.5" />
        <circle cx="18" cy="5" r="2.5" />
        <circle cx="15" cy="18" r="2.5" />
        <path d="m7 7 8-2M6 9l7 7m4-8-2 7" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18M5 6.5h14M5 17.5h14" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="18" rx="1" />
        <rect x="13" y="3" width="8" height="10" rx="1" />
        <path d="M13 17h8m-8 4h8" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 5 5" />
      </>
    ),
    expand: <path d="M14 3h7v7m0-7-7 7M10 21H3v-7m0 7 7-7" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    reset: (
      <>
        <path d="M4 10a8 8 0 1 1 0 6m0-6V4m0 6h6" />
      </>
    ),
    move: (
      <path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4" />
    ),
    plus: <path d="M4 12h16M12 4v16" />,
    minus: <path d="M4 12h16" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v1" />
      </>
    ),
    timeline: <path d="M3 4v17h18M6 16l4-6 4 3 6-8" />,
    download: <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" />,
    play: <path d="m8 4 12 8-12 8z" />,
    pause: <path d="M8 4v16M16 4v16" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    filter: <path d="M3 6h18M6 12h12M9 18h6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.network}
    </svg>
  );
}
