import React, { use } from 'react';
import GanttClient from '@/components/gantt/GanttClient';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default function ProjectGantt4WPage({ params }: PageProps) {
    const { id } = use(params);
    return <GanttClient preSelectedProjectId={id} windowMode="4w" />;
}

