'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, GripVertical } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FunnelStage } from '@/lib/saas/types'

export function FunnelBuilder({ initialStages }: { initialStages: FunnelStage[] }) {
  const [stages, setStages] = useState(initialStages)

  const hydratedStages = useMemo(
    () =>
      stages.map((stage, index) => ({
        ...stage,
        conversionRate: index === 0 ? null : Number(((stage.volume / Math.max(stages[index - 1].volume, 1)) * 100).toFixed(1)),
      })),
    [stages]
  )

  function moveStage(fromIndex: number, toIndex: number) {
    const next = [...stages]
    const [item] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, item)
    setStages(next)
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>Funnel Builder</CardTitle>
          <CardDescription>Drag-inspired sequencing for impressions, clicks, leads, and purchases.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {hydratedStages.map((stage, index) => (
          <div key={`${stage.stage_name}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white p-2 text-slate-400 shadow-sm">
                  <GripVertical className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{stage.stage_name}</p>
                  <p className="text-sm text-slate-500">{stage.volume.toLocaleString()} volume</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                {stage.conversionRate != null ? <span>{stage.conversionRate}% rate</span> : <span>Top of funnel</span>}
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-30"
                  disabled={index === 0}
                  onClick={() => moveStage(index, index - 1)}
                >
                  Up
                </button>
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-30"
                  disabled={index === hydratedStages.length - 1}
                  onClick={() => moveStage(index, index + 1)}
                >
                  Down
                </button>
              </div>
            </div>
            {index !== hydratedStages.length - 1 ? <ArrowDown className="mx-auto mt-3 h-4 w-4 text-slate-300" /> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
