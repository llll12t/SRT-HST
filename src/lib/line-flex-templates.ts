import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Task, Project } from '@/types/construction';

const formatThaiDate = (dateStr: string | Date | undefined) => {
    if (!dateStr) return '-';
    try {
        const d = (typeof dateStr === 'string') ? new Date(dateStr) : dateStr;
        return format(d, 'dd MMM yy', { locale: th });
    } catch {
        return '-';
    }
};

const getProjectName = (project: Project | null) => project ? project.name : 'สรุปทุกโครงการ';

export function generateTasksFlexMessage(
    title: string,
    tasks: Task[],
    project: Project | null,
    themeColor: string = '#2563eb'
) {
    const taskItems: any[] = tasks.slice(0, 5).map(t => {
        return {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            spacing: 'sm',
            contents: [
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 1,
                    contents: [
                        {
                            type: 'text',
                            text: `${t.progress}%`,
                            size: 'xs',
                            color: t.progress === 100 ? '#10b981' : '#f59e0b',
                            weight: 'bold',
                            align: 'center'
                        }
                    ]
                },
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 4,
                    contents: [
                        {
                            type: 'text',
                            text: t.name || 'ไม่มีชื่อ',
                            size: 'sm',
                            weight: 'bold',
                            wrap: true
                        },
                        {
                            type: 'text',
                            text: `เริ่ม: ${formatThaiDate(t.planStartDate)} | จบ: ${formatThaiDate(t.planEndDate)}`,
                            size: 'xs',
                            color: '#888888'
                        }
                    ]
                }
            ]
        };
    });

    if (tasks.length > 5) {
        taskItems.push({
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
                {
                    type: 'text',
                    text: `...และอีก ${tasks.length - 5} งาน`,
                    size: 'xs',
                    color: '#aaaaaa',
                    align: 'center',
                    flex: 1
                }
            ]
        });
    }

    if (taskItems.length === 0) {
        taskItems.push({
            type: 'box',
            layout: 'horizontal',
            contents: [
                {
                    type: 'text',
                    text: 'ไม่มีงานในรายการ',
                    size: 'sm',
                    color: '#aaaaaa',
                    align: 'center'
                }
            ]
        });
    }

    return {
        type: 'flex',
        altText: `${title} - ${getProjectName(project)}`,
        contents: {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: themeColor,
                contents: [
                    {
                        type: 'text',
                        text: title,
                        weight: 'bold',
                        color: '#ffffff',
                        size: 'md'
                    },
                    {
                        type: 'text',
                        text: getProjectName(project),
                        color: '#ffffff',
                        size: 'xs'
                    }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: taskItems
            }
        }
    };
}

export function generateProjectProgressFlexMessage(project: Project) {
    const progress = project.overallProgress || 0;
    const isCompleted = progress === 100;

    return {
        type: 'flex',
        altText: `ความคืบหน้าโครงการ - ${project.name}`,
        contents: {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'text',
                        text: '🎉 ความคืบหน้าโครงการ',
                        weight: 'bold',
                        color: '#10b981',
                        size: 'sm'
                    },
                    {
                        type: 'text',
                        text: project.name,
                        weight: 'bold',
                        size: 'xl',
                        wrap: true,
                        margin: 'sm'
                    }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                    {
                        type: 'box',
                        layout: 'baseline',
                        contents: [
                            {
                                type: 'text',
                                text: 'Overall Progress',
                                color: '#aaaaaa',
                                size: 'sm',
                                flex: 4
                            },
                            {
                                type: 'text',
                                text: `${progress.toFixed(2)}%`,
                                weight: 'bold',
                                color: '#10b981',
                                size: 'lg',
                                flex: 2,
                                align: 'end'
                            }
                        ]
                    },
                    {
                        type: 'text',
                        text: `สถานะ: ${isCompleted ? 'เสร็จสิ้น' : 'กำลังดำเนินการ'}`,
                        size: 'xs',
                        color: '#888888',
                        margin: 'md'
                    }
                ]
            }
        }
    };
}

export function generateProcurementFlexMessage(tasks: Task[], project: Project | null) {
    const items: any[] = tasks.slice(0, 5).map(t => {
        return {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            contents: [
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 4,
                    contents: [
                        {
                            type: 'text',
                            text: t.name,
                            size: 'sm',
                            weight: 'bold',
                            wrap: true
                        },
                        {
                            type: 'text',
                            text: `กำหนดใช้: ${formatThaiDate(t.dateOfUse)}`,
                            size: 'xs',
                            color: '#888888'
                        }
                    ]
                },
                {
                    type: 'text',
                    text: 'ต้องสั่งซื้อด่วน',
                    size: 'xs',
                    color: '#ef4444',
                    weight: 'bold',
                    flex: 2,
                    align: 'end'
                }
            ]
        };
    });

    if (items.length === 0) {
        items.push({
            type: 'box',
            layout: 'horizontal',
            contents: [
                {
                    type: 'text',
                    text: 'ไม่มีรายการที่ต้องสั่งซื้อด่วน',
                    size: 'sm',
                    color: '#aaaaaa',
                    align: 'center'
                }
            ]
        });
    }

    return {
        type: 'flex',
        altText: `แจ้งเตือนจัดซื้อ - ${getProjectName(project)}`,
        contents: {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#ef4444',
                contents: [
                    {
                        type: 'text',
                        text: '⚠️ รายการที่ต้องเร่งสั่งซื้อ',
                        weight: 'bold',
                        color: '#ffffff',
                        size: 'md'
                    },
                    {
                        type: 'text',
                        text: getProjectName(project),
                        color: '#ffffff',
                        size: 'xs'
                    }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                contents: items
            }
        }
    };
}
