'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, GripVertical } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FunnelStage } from '@/lib/saas/types'

export function FunnelBuilder({ initialStages }: { initialStages: FunnelStage[] }) {
  const [stages, setStages] = useState(initialStages)

  useEffect(() => {
    setStages(initialStages)
  }, [initialStages])

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
          <CardTitle>Construtor de funil</CardTitle>
          <CardDescription>Sequência visual para impressões, cliques, leads e compras.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hydratedStages.map((stage, index) => (
          <div
            key={`${stage.stage_name}-${index}`}
            className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.9))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-white p-2 text-slate-400 shadow-sm ring-1 ring-slate-200">
                  <GripVertical className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-manrope text-lg font-extrabold tracking-tight text-slate-950">{stage.stage_name}</p>
                  <p className="text-sm text-slate-500">{stage.volume.toLocaleString('pt-BR')} volume</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                {stage.conversionRate != null ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">{stage.conversionRate}% taxa</span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">Topo do funil</span>
                )}
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm disabled:opacity-30"
                  disabled={index === 0}
                  onClick={() => moveStage(index, index - 1)}
                >
                  Subir
                </button>
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm disabled:opacity-30"
                  disabled={index === hydratedStages.length - 1}
                  onClick={() => moveStage(index, index + 1)}
                >
                  Descer
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
