
import { getProjects, getAllTasks, getExpenses, getProject } from '@/lib/firestore';
import { Project, Task, Expense } from '@/types/construction';
import { startOfWeek, endOfWeek, parseISO, isValid, format, subWeeks } from 'date-fns';

interface WeeklyStats {
    totalBudget: number;
    plannedToDate: number;
    earnedToDate: number;
    actualCostToDate: number;
    costVariance: number;
    scheduleVariance: number;
    cpi: number;
    spi: number;
    eac: number;
}

export async function getWeeklyCostStats(projectId: string = 'all'): Promise<{ stats: WeeklyStats, project: Project | null }> {
    const [allProjects, allTasks, allExpenses] = await Promise.all([
        getProjects(),
        getAllTasks(),
        getExpenses()
    ]);

    let projects = allProjects;
    let tasks = allTasks;
    let expenses = allExpenses;
    let targetProject: Project | null = null;

    if (projectId !== 'all') {
        targetProject = allProjects.find(p => p.id === projectId) || null;
        projects = allProjects.filter(p => p.id === projectId);
        tasks = allTasks.filter(t => t.projectId === projectId);
        expenses = allExpenses.filter(e => e.projectId === projectId);
    } else {
        // Active projects only
        const activeIds = new Set(allProjects.filter(p => p.status !== 'completed' && (p.status as string) !== 'cancelled').map(p => p.id));
        tasks = tasks.filter(t => activeIds.has(t.projectId));
        expenses = expenses.filter(e => activeIds.has(e.projectId));
    }

    const currentDate = new Date();
    // const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    // const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

    let totalBudget = 0;
    let plannedToDate = 0;
    let earnedToDate = 0;
    let actualCostToDate = 0;

    tasks.forEach(task => {
        if (task.type === 'group') return;

        const cost = task.cost || 0;
        totalBudget += cost;

        // Earned Value (EV)
        const progress = task.progress || 0;
        earnedToDate += (cost * progress) / 100;

        // Planned Value (PV)
        if (task.planStartDate && task.planEndDate) {
            const start = parseISO(task.planStartDate);
            const end = parseISO(task.planEndDate);

            if (isValid(start) && isValid(end) && end.getTime() >= start.getTime()) {
                const now = new Date();
                const totalDuration = end.getTime() - start.getTime();
                const passedDuration = Math.min(Math.max(0, now.getTime() - start.getTime()), totalDuration);
                const percentPlanned = totalDuration === 0 ? (now >= start ? 1 : 0) : (passedDuration / totalDuration);
                plannedToDate += cost * percentPlanned;
            }
        }
    });

    expenses.forEach(exp => {
        actualCostToDate += exp.amount;
    });

    const cpi = actualCostToDate > 0 ? earnedToDate / actualCostToDate : 0;
    const spi = plannedToDate > 0 ? earnedToDate / plannedToDate : 0;
    const eac = cpi > 0 ? totalBudget / cpi : totalBudget;

    return {
        stats: {
            totalBudget,
            plannedToDate,
            earnedToDate,
            actualCostToDate,
            costVariance: earnedToDate - actualCostToDate,
            scheduleVariance: earnedToDate - plannedToDate,
            cpi,
            spi,
            eac
        },
        project: targetProject
    };
}

export function generateWeeklyReportFlexMessage(stats: WeeklyStats, project: Project | null, weekDate: Date = new Date()) {
    const weekDisplay = `Week ${format(weekDate, 'w')}, ${format(weekDate, 'MMM yyyy')}`;
    const projectName = project ? project.name : 'All Projects Summary';

    // Formatters
    const fmt = (n: number) => `฿${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const fmtDec = (n: number) => n.toFixed(2);

    // Status Logic
    const isOverBudget = stats.cpi < 1 && stats.actualCostToDate > 0;
    const isBehindSchedule = stats.spi < 1 && stats.plannedToDate > 0;

    const statusColor = isOverBudget || isBehindSchedule ? '#ef4444' : '#10b981'; // Red or Green
    const statusText = (isOverBudget ? 'Over Budget' : 'On Budget') + ' / ' + (isBehindSchedule ? 'Behind Schedule' : 'On Schedule');

    return {
        type: 'flex',
        altText: `Weekly Cost Report - ${projectName}`,
        contents: {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: 'Weekly Cost Report',
                        weight: 'bold',
                        color: '#1DB446',
                        size: 'sm'
                    },
                    {
                        type: 'text',
                        text: projectName,
                        weight: 'bold',
                        size: 'xl',
                        margin: 'md',
                        wrap: true
                    },
                    {
                        type: 'text',
                        text: weekDisplay,
                        size: 'xs',
                        color: '#aaaaaa',
                        wrap: true
                    }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'box',
                        layout: 'vertical',
                        margin: 'lg',
                        spacing: 'sm',
                        contents: [
                            {
                                type: 'box',
                                layout: 'baseline',
                                spacing: 'sm',
                                contents: [
                                    {
                                        type: 'text',
                                        text: 'Total Budget',
                                        color: '#aaaaaa',
                                        size: 'sm',
                                        flex: 4
                                    },
                                    {
                                        type: 'text',
                                        text: fmt(stats.totalBudget),
                                        wrap: true,
                                        color: '#666666',
                                        size: 'sm',
                                        flex: 5,
                                        align: 'end'
                                    }
                                ]
                            },
                            {
                                type: 'box',
                                layout: 'baseline',
                                spacing: 'sm',
                                contents: [
                                    {
                                        type: 'text',
                                        text: 'Actual Cost (AC)',
                                        color: '#aaaaaa',
                                        size: 'sm',
                                        flex: 4
                                    },
                                    {
                                        type: 'text',
                                        text: fmt(stats.actualCostToDate),
                                        wrap: true,
                                        color: '#333333',
                                        size: 'sm',
                                        flex: 5,
                                        align: 'end',
                                        weight: 'bold'
                                    }
                                ]
                            },
                            {
                                type: 'box',
                                layout: 'baseline',
                                spacing: 'sm',
                                contents: [
                                    {
                                        type: 'text',
                                        text: 'Earned Value (EV)',
                                        color: '#aaaaaa',
                                        size: 'sm',
                                        flex: 4
                                    },
                                    {
                                        type: 'text',
                                        text: fmt(stats.earnedToDate),
                                        wrap: true,
                                        color: '#333333',
                                        size: 'sm',
                                        flex: 5,
                                        align: 'end',
                                        weight: 'bold'
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        type: 'separator',
                        margin: 'lg'
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        margin: 'lg',
                        contents: [
                            {
                                type: 'box',
                                layout: 'vertical',
                                flex: 1,
                                contents: [
                                    {
                                        type: 'text',
                                        text: 'CPI',
                                        size: 'xs',
                                        color: '#aaaaaa',
                                        align: 'center'
                                    },
                                    {
                                        type: 'text',
                                        text: fmtDec(stats.cpi),
                                        size: 'xl',
                                        weight: 'bold',
                                        color: stats.cpi >= 1 ? '#10b981' : '#ef4444',
                                        align: 'center'
                                    },
                                    {
                                        type: 'text',
                                        text: 'Budget Efficiency',
                                        size: 'xxs',
                                        color: '#aaaaaa',
                                        align: 'center'
                                    }
                                ]
                            },
                            {
                                type: 'separator'
                            },
                            {
                                type: 'box',
                                layout: 'vertical',
                                flex: 1,
                                contents: [
                                    {
                                        type: 'text',
                                        text: 'SPI',
                                        size: 'xs',
                                        color: '#aaaaaa',
                                        align: 'center'
                                    },
                                    {
                                        type: 'text',
                                        text: fmtDec(stats.spi),
                                        size: 'xl',
                                        weight: 'bold',
                                        color: stats.spi >= 1 ? '#10b981' : '#f59e0b', // Amber for SPI delay
                                        align: 'center'
                                    },
                                    {
                                        type: 'text',
                                        text: 'Schedule Efficiency',
                                        size: 'xxs',
                                        color: '#aaaaaa',
                                        align: 'center'
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        type: 'box',
                        layout: 'vertical',
                        margin: 'lg',
                        contents: [
                            {
                                type: 'text',
                                text: statusText,
                                align: 'center',
                                color: statusColor,
                                size: 'xs',
                                weight: 'bold'
                            }
                        ]
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'button',
                        style: 'link',
                        height: 'sm',
                        action: {
                            type: 'uri',
                            label: 'View Full Report',
                            uri: 'https://srt-hst-app.web.app/weekly-cost'
                        }
                    }
                ]
            }
        }
    };
}

export async function sendLineFlexMessage(accessToken: string, targetId: string, flexMessage: any) {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
            to: targetId,
            messages: [flexMessage]
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LINE API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
}
