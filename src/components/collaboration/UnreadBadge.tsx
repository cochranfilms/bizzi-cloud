"use client";

interface UnreadBadgeProps {
  count: number;
  className?: string;
}

/** Red badge with number for unread count. */
export default function UnreadBadge({ count, className = "" }: UnreadBadgeProps) {
  if (count <= 0) return null;
  const display = count > 99 ? "99+" : String(count);
  return (
    <span
      className={`absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white shadow-sm ${className}`}
      aria-label={`${count} unread notifications`}
    >
      {display}
    </span>
  );
}
