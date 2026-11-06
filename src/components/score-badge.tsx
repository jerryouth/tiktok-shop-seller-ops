import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { scoreBand } from '@/lib/format';

/** 选品评分徽章：环形底色 + 分数，高分附「潜力爆款」标识 */
export function ScoreBadge({ score, isHot }: { score: number; isHot: boolean }) {
  const band = scoreBand(score);
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          'inline-flex h-8 w-11 items-center justify-center rounded-md text-sm font-semibold tabular-nums',
          band.badgeClass,
        )}
      >
        {score}
      </span>
      {isHot && (
        <span className="inline-flex items-center gap-0.5 rounded-md bg-[#fe2c55] px-1.5 py-0.5 text-[11px] font-medium text-white">
          <Flame className="h-3 w-3" />
          潜力爆款
        </span>
      )}
    </div>
  );
}
