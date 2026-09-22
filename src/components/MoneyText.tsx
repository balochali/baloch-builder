import { formatPKR } from "@/domain/money";
import { cn } from "@/lib/utils";

interface MoneyTextProps {
  amount: number | null | undefined;
  lakhCrore?: boolean;
  className?: string;
  /** Show in red when negative */
  colorize?: boolean;
}

export function MoneyText({ amount, lakhCrore, className, colorize }: MoneyTextProps) {
  if (amount == null) return <span className={cn("text-muted-foreground", className)}>—</span>;

  const formatted = formatPKR(amount, { lakhCrore });
  const isNegative = amount < 0;

  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        colorize && isNegative && "text-destructive",
        colorize && !isNegative && "text-emerald-600 dark:text-emerald-400",
        className,
      )}
    >
      {formatted}
    </span>
  );
}
