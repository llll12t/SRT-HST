'use client';

import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    ComposedChart,
    Legend,
} from 'recharts';
import { SCurveDataPoint } from '@/types/construction';

interface SCurveChartProps {
    data: SCurveDataPoint[];
    currentProgress?: number;
    title?: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0]?.payload;
        const planned = data?.cumulativePlanned || 0;
        const actual = data?.cumulativeActual || 0;
        const gap = actual - planned; // Actual - Plan = Gap (Positive is good)

        return (
            <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm z-50">
                <p className="text-gray-900 font-semibold mb-2">{data?.date}</p>
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-blue-600 font-medium">Plan (แผน):</span>
                        <span className="font-bold">{planned.toFixed(2)}%</span>
                    </div>
                    {/* Only show Actual line if it exists (greater than 0 or specifically the first point) */}
                    {(actual > 0 || data?.week === 1) && (
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-green-600 font-medium">Actual (จริง):</span>
                            <span className="font-bold">{actual.toFixed(2)}%</span>
                        </div>
                    )}
                    {(actual > 0 || data?.week === 1) && (
                        <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-1 mt-1">
                            <span className={gap < 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                                Gap (ผลต่าง):
                            </span>
                            <span className={`font-bold ${gap < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {gap > 0 ? '+' : ''}{gap.toFixed(2)}%
                            </span>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    return null;
};

export default function SCurveChart({ data, currentProgress = 0, title = "S-Curve Progress" }: SCurveChartProps) {
    // Determine max domain to keep chart looking good, typically 100, but allows for slight overflow handling if data errors
    const maxVal = 100;

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-6 gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                    <p className="text-gray-600 text-sm mt-0.5">แผนงานเทียบกับผลงานจริงสะสม (Cumulative)</p>
                </div>
                {/* Custom Legend */}
                <div className="flex items-center gap-6 text-sm bg-gray-50 px-4 py-2 rounded-lg">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full" />
                        <span className="text-gray-700 font-medium">Planned ({data[data.length - 1]?.cumulativePlanned.toFixed(0)}%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full" />
                        <span className="text-gray-700 font-medium">Actual ({currentProgress.toFixed(2)}%)</span>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                        <defs>
                            <linearGradient id="planFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />

                        <XAxis
                            dataKey="date"
                            stroke="#9ca3af"
                            tick={{ fill: '#4b5563', fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: '#e5e7eb' }}
                            interval="preserveStartEnd"
                            minTickGap={30}
                        />

                        <YAxis
                            stroke="#9ca3af"
                            tick={{ fill: '#4b5563', fontSize: 11 }}
                            tickLine={false}
                            axisLine={{ stroke: '#e5e7eb' }}
                            domain={[0, 100]}
                            ticks={[0, 20, 40, 60, 80, 100]}
                            tickFormatter={(value) => `${value}%`}
                        />

                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }} />

                        {/* Planned Area & Line */}
                        <Area
                            type="monotone"
                            dataKey="cumulativePlanned"
                            fill="url(#planFill)"
                            stroke="transparent"
                            isAnimationActive={false}
                        />
                        <Line
                            type="monotone"
                            dataKey="cumulativePlanned"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 5, fill: '#3b82f6', strokeWidth: 0 }}
                            name="Plan"
                            isAnimationActive={true}
                            animationDuration={1500}
                        />

                        {/* Actual Area & Line */}
                        {/* We use connectNulls={false} so chart implies stop if 0? No, actual is cumulative. 0 means 0. 
                            However, future weeks are 0. We don't want the line to drop to 0.
                            We should probably filter data or format it inside component.
                            Actually, passing data properly (where future Actual is null or undefined) stops the line.
                         */}
                        <Area
                            type="monotone"
                            dataKey="cumulativeActual"
                            fill="url(#actualFill)"
                            stroke="transparent"
                            connectNulls={true}
                        />
                        <Line
                            type="monotone"
                            dataKey="cumulativeActual"
                            stroke="#22c55e"
                            strokeWidth={3}
                            dot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
                            activeDot={{ r: 6, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
                            name="Actual"
                            connectNulls={true}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-4 text-center text-xs text-gray-500">
                * กราฟ Actual แสดงเฉพาะข้อมูลที่มีการบันทึกหรือถึงปัจจุบัน
            </div>
        </div>
    );
}
