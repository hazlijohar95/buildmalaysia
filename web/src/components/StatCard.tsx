// Adapted from CanadaSpends (MIT, Build Canada).
import { cn } from "@/lib/cn";
import React from "react";

interface StatCardProps {
  title: string | React.ReactNode;
  value: string | React.ReactNode;
  subtitle: string | React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  className,
}) => {
  return (
    <div
      className={cn(
        "bg-card text-card-foreground rounded-xl p-6 shadow-sm transition-all duration-300 hover:shadow-lg",
        className,
      )}
    >
      <h3 className="text-sm font-medium text-foreground/50 mb-2">{title}</h3>
      <div className="flex flex-col space-y-1">
        <p className="text-4xl font-bold tracking-tight inline-block font-display">
          {value}
        </p>
        <p className="text-sm text-foreground/50">{subtitle}</p>
      </div>
    </div>
  );
};

export const StatCardContainer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 ">
      {children}
    </div>
  );
};
