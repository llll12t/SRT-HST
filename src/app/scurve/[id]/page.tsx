'use client';

import React, { use } from 'react';
import { redirect } from 'next/navigation';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default function ProjectSCurvePage({ params }: PageProps) {
    const { id } = use(params);

    // Redirect to scurve page with project query param
    redirect(`/scurve?project=${id}`);
}
