import type { ReactNode } from "react";

type MarketingSectionProps = {
  children: ReactNode;
  /** Extra grid / responsive classes, e.g. `lg:grid-cols-3` */
  className?: string;
  /** Default `mt-8` between homepage blocks */
  topSpacing?: "none" | "md" | "lg";
};

const topSpacingClass: Record<NonNullable<MarketingSectionProps["topSpacing"]>, string> = {
  none: "",
  md: "mt-8",
  lg: "mt-10",
};

export function MarketingSection({ children, className = "", topSpacing = "md" }: MarketingSectionProps) {
  const margin = topSpacingClass[topSpacing];
  return <section className={`${margin} grid gap-6 ${className}`.trim()}>{children}</section>;
}
