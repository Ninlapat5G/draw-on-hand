interface IconProps {
  strokeWidth?: number;
}

const base = (props?: IconProps) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: props?.strokeWidth ?? 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const PenIcon = () => (
  <svg {...base()}>
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </svg>
);

export const NeonIcon = () => (
  <svg {...base()}>
    <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M12.2 6.2L11 5" />
    <path d="M3 21l9-9" />
    <path d="M12.2 11.8L11 13" />
  </svg>
);

export const MarkerIcon = () => (
  <svg {...base()}>
    <path d="M9 11l-6 6v3h9l3-3" />
    <path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
  </svg>
);

export const RainbowIcon = () => (
  <svg {...base()}>
    <path d="M22 17a10 10 0 0 0-20 0" />
    <path d="M18 17a6 6 0 0 0-12 0" />
    <path d="M14 17a2 2 0 0 0-4 0" />
  </svg>
);

export const EraserIcon = () => (
  <svg {...base()}>
    <path d="M20 20H7L3 16a1.4 1.4 0 0 1 0-2l10-10a1.4 1.4 0 0 1 2 0l6 6a1.4 1.4 0 0 1 0 2l-8 8" />
    <path d="M6 11l7 7" />
  </svg>
);

export const UndoIcon = () => (
  <svg {...base()}>
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 3L3 13" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...base()}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export const CameraIcon = () => (
  <svg {...base()}>
    <path d="M23 7l-7 5 7 5V7z" />
    <rect x="1" y="5" width="15" height="14" rx="2" />
  </svg>
);

export const CameraOffIcon = () => (
  <svg {...base()}>
    <path d="M16 16v3a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
    <path d="M1 1l22 22" />
  </svg>
);

export const DownloadIcon = () => (
  <svg {...base()}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);

export const ImageIcon = () => (
  <svg {...base()}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

export const LayersIcon = () => (
  <svg {...base()}>
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
);

export const AlertIcon = () => (
  <svg {...base()}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);

export const SettingsIcon = () => (
  <svg {...base()}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const GripIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
);

export const ChevronLeftIcon = () => (
  <svg {...base()}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const ChevronRightIcon = () => (
  <svg {...base()}>
    <path d="M9 18l6-6-6-6" />
  </svg>
);

export const CloseIcon = () => (
  <svg {...base()}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const EyeIcon = () => (
  <svg {...base()}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = () => (
  <svg {...base()}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export const MaskIcon = () => (
  <svg {...base()}>
    <path d="M18 10h-1.26A6 6 0 0 0 12 5.34 6 6 0 0 0 7.26 10H6a4 4 0 0 0-4 4 1 1 0 0 0 1 1c2.14 0 4.14-1.33 5.4-3.5a3.9 3.9 0 0 1 7.2 0c1.26 2.17 3.26 3.5 5.4 3.5a1 1 0 0 0 1-1 4 4 0 0 0-4-4z" />
    <circle cx="9" cy="12" r="1" />
    <circle cx="15" cy="12" r="1" />
  </svg>
);

export const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="#fff">
    <path d="M12 2l2.1 6.1L20 10l-5.9 1.9L12 18l-2.1-6.1L4 10l5.9-1.9L12 2z" />
  </svg>
);

