import React, { useState, useRef } from 'react';
import type { SCurveDataPoint } from '@/components/charts/scurve/hooks/useSCurveData';
import { differenceInDays, format, startOfDay } from 'date-fns';

interface SCurveGraphProps {
    data: { points: SCurveDataPoint[], maxActualDate: Date };
    width: number;
    height: number;
    timeline: { items: any[] };
    config: { cellWidth: number };
    timeRange: { start: Date };
    viewMode: string;
    totalScope: number;
    mode: 'physical' | 'financial';
    left: number;
    referenceDate?: Date | null;
}

export const SCurveGraph: React.FC<SCurveGraphProps> = ({
    data,
    width,
    height,
    timeline,
    config,
    timeRange,
    viewMode,
    totalScope,
    mode,
    left,
    referenceDate
}) => {
    const { points, maxActualDate } = data;
    const timelineStart = timeline.items?.[0] ?? timeRange.start;
    const [hoverTooltip, setHoverTooltip] = useState<{ x: number; y: number; point: SCurveDataPoint } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const getX = (date: Date) => {
        const diff = differenceInDays(date, timelineStart);
        if (viewMode === 'day') return diff * config.cellWidth;
        if (viewMode === 'week') return (diff / 7) * config.cellWidth;
        // Month approximate
        return (diff / 30.44) * config.cellWidth;
    };

    const getY = (val: number) => {
        const safeVal = Number.isFinite(val) ? val : 0;
        return height - (safeVal / 100) * height;
    };

    const activeReferenceDate = referenceDate ?? new Date();
    const referenceX = getX(activeReferenceDate);
    const referenceLabel = referenceDate ? '' : ' ';

    // Filter points for actual line (up to max date)
    const actualPoints = points.filter(p => p.date <= maxActualDate);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;

        // Find closest point
        let closestPoint: SCurveDataPoint | null = null;
        let minDist = Infinity;

        for (const p of points) {
            const pX = getX(p.date);
            const dist = Math.abs(pX - relativeX);
            if (dist < minDist) {
                minDist = dist;
                closestPoint = p;
            }
        }

        if (closestPoint && minDist < 50) { // arbitrary threshold for snap
            const pX = getX(closestPoint.date);
            setHoverTooltip({
                x: pX,
                y: getY(closestPoint.plan),
                point: closestPoint
            });
        } else {
            setHoverTooltip(null);
        }
    };

    const handleMouseLeave = () => {
        setHoverTooltip(null);
    };

    const formatValue = (val: number) => {
        if (mode === 'financial') return `฿${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
        return `${val.toFixed(2)}%`;
    };

    // Calculate actual monetary/work value from percentage if needed, 
    // but the screenshot shows currency: "$135,320".
    // "points" data contains `plan` and `actual` as PERCENTAGES usually (0-100).
    // If we want absolute values, we need to multiply by totalScope.
    const getAbsoluteValue = (percent: number) => {
        return (percent / 100) * totalScope;
    };

    // Calculate default tooltip for Reference Date
    let defaultPoint: SCurveDataPoint | null = null;
    let minD = Infinity;

    // Normalize reference date to start of day for accurate day-matching
    const normalizedRefDate = startOfDay(referenceDate ? referenceDate : new Date());

    for (const p of points) {
        // Normalize point date to start of day
        const pDate = startOfDay(p.date);

        const d = Math.abs(pDate.getTime() - normalizedRefDate.getTime());
        if (d < minD) {
            minD = d;
            defaultPoint = p;
        }
    }

    const defaultTooltip = defaultPoint ? {
        x: getX(defaultPoint.date),
        y: getY(defaultPoint.plan),
        point: defaultPoint
    } : null;

    const activeTooltip = hoverTooltip || defaultTooltip;

    return (
        <div
            ref={containerRef}
            className="absolute top-0 bottom-0 z-10 pointer-events-auto"
            style={{ width: `${width}px`, height: '100%', left: `${left}px` }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >

            <div className="sticky top-0 w-full border-b border-transparent bg-transparent relative group/chart"
                style={{ height: `${height}px` }}>

                <svg width={width} height={height} className="overflow-visible">
                    {/* Grid Lines */}
                    {timeline.items.map((item, i) => (
                        <line key={i} x1={i * config.cellWidth} y1={0} x2={i * config.cellWidth} y2={height} stroke="#f3f4f6" strokeDasharray="4 4" />
                    ))}

                    {/* Reference Date Line */}
                    {referenceX >= 0 && referenceX <= width && (
                        <g>
                            <line x1={referenceX} y1={0} x2={referenceX} y2={height} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="5 4" />
                            <text x={referenceX} y={12} fill="#ef4444" fontSize="10" fontWeight="bold" textAnchor="middle">{referenceLabel}</text>
                        </g>
                    )}

                    {/* Plan S-Curve */}
                    <path
                        d={`M0,${height} ` + points.map(p => `L${getX(p.date)},${getY(p.plan)}`).join(' ')}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d={`M0,${height} ` + points.map(p => `L${getX(p.date)},${getY(p.plan)}`).join(' ') + ` L${getX(points[points.length - 1].date)},${height} Z`}
                        fill="url(#blueGradient)"
                        opacity="0.1"
                    />

                    {/* Actual S-Curve */}
                    {actualPoints.length > 0 && (
                        <>
                            <path
                                d={`M0,${height} ` + actualPoints.map(p => `L${getX(p.date)},${getY(p.actual)}`).join(' ')}
                                fill="none"
                                stroke="#22c55e"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                d={`M0,${height} ` + actualPoints.map(p => `L${getX(p.date)},${getY(p.actual)}`).join(' ') + ` L${getX(actualPoints[actualPoints.length - 1].date)},${height} Z`}
                                fill="url(#greenGradient)"
                                opacity="0.1"
                            />
                        </>
                    )}

                    {/* Tooltip Line Indicator */}
                    {activeTooltip && (
                        <line
                            x1={activeTooltip.x}
                            y1={0}
                            x2={activeTooltip.x}
                            y2={height}
                            stroke="#9ca3af"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                        />
                    )}

                    {/* Points markers on Hover */}
                    {activeTooltip && (
                        <>
                            <circle cx={activeTooltip.x} cy={getY(activeTooltip.point.plan)} r="4" fill="#3b82f6" stroke="white" strokeWidth="2" />
                            {activeTooltip.point.date <= maxActualDate && (
                                <circle cx={activeTooltip.x} cy={getY(activeTooltip.point.actual)} r="4" fill="#22c55e" stroke="white" strokeWidth="2" />
                            )}
                        </>
                    )}

                    <defs>
                        <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                </svg>

                {/* Custom HTML Tooltip */}
                {activeTooltip && (
                    <div
                        className="absolute z-50 bg-white rounded-lg shadow-xl border border-gray-100 p-3 min-w-[160px] pointer-events-none transform -translate-x-1/2 -translate-y-[calc(100%+12px)] transition-all duration-75"
                        style={{
                            left: `${activeTooltip.x}px`,
                            top: `${Math.min(getY(activeTooltip.point.plan), getY(activeTooltip.point.actual || 0)) - 10}px`
                        }}
                    >
                        <div className="flex items-center gap-2 border-b border-gray-100 pb-2 mb-2">
                            <span className="text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
                            </span>
                            <span className="text-xs font-semibold text-gray-600">
                                {format(activeTooltip.point.date, 'd MMM yyyy')}
                            </span>
                        </div>

                        {/* Plan Row */}
                        <div className="flex items-center justify-between mb-1.5 gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-3 rounded-full bg-blue-600"></div>
                                <span className="text-xs text-gray-500">Plan</span>
                            </div>
                            <span className="text-xs font-bold text-gray-800">
                                {mode === 'financial' ? formatValue(getAbsoluteValue(activeTooltip.point.plan)) : formatValue(activeTooltip.point.plan)}
                            </span>
                        </div>

                        {/* Actual Row */}
                        {activeTooltip.point.date <= maxActualDate && (
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-1 h-3 rounded-full bg-emerald-500"></div>
                                    <span className="text-xs text-gray-500">Actual</span>
                                </div>
                                <span className="text-xs font-bold text-gray-800">
                                    {mode === 'financial' ? formatValue(getAbsoluteValue(activeTooltip.point.actual)) : formatValue(activeTooltip.point.actual)}
                                </span>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
};
