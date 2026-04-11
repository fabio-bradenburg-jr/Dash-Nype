import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const toneMap = {
  green: 'bg-emerald-100 text-emerald-700',
  yellow: 'bg-amber-100 text-amber-700',
  red: 'bg-rose-100 text-rose-700',
  slate: 'bg-slate-100 text-slate-700',
}

export function Badge({ children, tone = 'slate', className = '' }: { children: ReactNode; tone?: keyof typeof toneMap; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize', toneMap[tone], className)}>
      {children}
    </span>
  )
}
