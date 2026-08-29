const sizeMap = {
  sm: { box: "h-6 w-6", text: "text-sm", gap: "gap-1.5" },
  md: { box: "h-8 w-8", text: "text-base", gap: "gap-2" },
} as const;

export function Logo({
  size = "md",
  animated = true,
  className = "",
}: {
  size?: keyof typeof sizeMap;
  animated?: boolean;
  className?: string;
}) {
  const { box, text, gap } = sizeMap[size];

  return (
    <span className={`group inline-flex items-center ${gap} ${className}`}>
      <svg
        viewBox="0 0 32 32"
        className={`${box} shrink-0 ${animated ? "animate-logo-in" : ""}`}
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="9" className="fill-black dark:fill-white" />
        <path
          d="M13 9.5c-1.7 0-2.5.9-2.5 2.4v1.9c0 1-.35 1.4-1.3 1.4v1.6c.95 0 1.3.4 1.3 1.4v1.9c0 1.5.8 2.4 2.5 2.4"
          className="stroke-white dark:stroke-black transition-transform duration-300 ease-out group-hover:-translate-x-0.5"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <path
          d="M19 9.5c1.7 0 2.5.9 2.5 2.4v1.9c0 1 .35 1.4 1.3 1.4v1.6c-.95 0-1.3.4-1.3 1.4v1.9c0 1.5-.8 2.4-2.5 2.4"
          className="stroke-white dark:stroke-black transition-transform duration-300 ease-out group-hover:translate-x-0.5"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <span className={`${text} font-semibold tracking-tight`}>Template Me</span>
    </span>
  );
}
