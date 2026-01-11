import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    Timestamp,
    serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { Project, Task, WeeklyLog } from '@/types/construction';

// ==================== PROJECTS ====================

export async function getProjects(): Promise<Project[]> {
    const projectsRef = collection(db, 'projects');
    const q = query(projectsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as Project[];
}

export async function getProject(projectId: string): Promise<Project | null> {
    const docRef = doc(db, 'projects', projectId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) return null;

    return {
        id: snapshot.id,
        ...snapshot.data()
    } as Project;
}

export async function createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const projectsRef = collection(db, 'projects');
    const docRef = await addDoc(projectsRef, {
        ...project,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return docRef.id;
}

export async function updateProject(projectId: string, data: Partial<Project>): Promise<void> {
    const docRef = doc(db, 'projects', projectId);
    await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

export async function deleteProject(projectId: string): Promise<void> {
    const docRef = doc(db, 'projects', projectId);
    await deleteDoc(docRef);
}

// ==================== TASKS ====================

export async function getTasks(projectId: string): Promise<Task[]> {
    const tasksRef = collection(db, 'tasks');
    const q = query(
        tasksRef,
        where('projectId', '==', projectId)
    );
    const snapshot = await getDocs(q);

    const tasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as Task[];

    // Sort by order client-side to avoid composite index requirement
    return tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function getAllTasks(): Promise<Task[]> {
    const tasksRef = collection(db, 'tasks');
    const q = query(tasksRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as Task[];
}

export async function getTask(taskId: string): Promise<Task | null> {
    const docRef = doc(db, 'tasks', taskId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) return null;

    return {
        id: snapshot.id,
        ...snapshot.data()
    } as Task;
}

export async function createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const tasksRef = collection(db, 'tasks');
    const docRef = await addDoc(tasksRef, {
        ...task,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    // Auto-sync project progress
    await syncProjectProgress(task.projectId);

    return docRef.id;
}

export async function updateTask(taskId: string, data: Partial<Task>): Promise<void> {
    // Get task first to know projectId
    const task = await getTask(taskId);

    const docRef = doc(db, 'tasks', taskId);
    await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
    });

    // Auto-sync project progress
    if (task) {
        await syncProjectProgress(data.projectId || task.projectId);
    }
}

export async function updateTaskProgress(taskId: string, progress: number): Promise<void> {
    // Get task first to know projectId
    const task = await getTask(taskId);
    if (!task) return;

    const docRef = doc(db, 'tasks', taskId);

    let status: Task['status'] = 'not-started';
    if (progress === 100) status = 'completed';
    else if (progress > 0) status = 'in-progress';

    await updateDoc(docRef, {
        progress,
        status,
        updatedAt: serverTimestamp()
    });

    // Auto-sync project progress
    await syncProjectProgress(task.projectId);
}

export async function deleteTask(taskId: string): Promise<void> {
    // Get task first to know projectId
    const task = await getTask(taskId);

    const docRef = doc(db, 'tasks', taskId);
    await deleteDoc(docRef);

    // Auto-sync project progress
    if (task) {
        await syncProjectProgress(task.projectId);
    }
}

// ==================== WEEKLY LOGS ====================

export async function getWeeklyLogs(projectId: string): Promise<WeeklyLog[]> {
    const logsRef = collection(db, 'weeklyLogs');
    const q = query(
        logsRef,
        where('projectId', '==', projectId),
        orderBy('weekNumber', 'asc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as WeeklyLog[];
}

export async function createWeeklyLog(log: Omit<WeeklyLog, 'id'>): Promise<string> {
    const logsRef = collection(db, 'weeklyLogs');
    const docRef = await addDoc(logsRef, {
        ...log,
        createdAt: serverTimestamp()
    });
    return docRef.id;
}

export async function updateWeeklyLog(logId: string, data: Partial<WeeklyLog>): Promise<void> {
    const docRef = doc(db, 'weeklyLogs', logId);
    await updateDoc(docRef, data);
}

// ==================== UTILITY FUNCTIONS ====================

export async function calculateProjectProgress(projectId: string): Promise<number> {
    const tasks = await getTasks(projectId);

    if (tasks.length === 0) return 0;

    const totalWeight = tasks.reduce((sum, task) => sum + (Number(task.weight) || 0), 0);
    const weightedProgress = tasks.reduce((sum, task) => sum + ((Number(task.weight) || 0) * (Number(task.progress) || 0) / 100), 0);

    return totalWeight > 0 ? (weightedProgress / totalWeight) * 100 : 0;
}

export async function syncProjectProgress(projectId: string): Promise<void> {
    const progress = await calculateProjectProgress(projectId);
    await updateProject(projectId, { overallProgress: Math.round(progress * 100) / 100 });
}

// ==================== SEED DATA ====================

export async function seedSampleData(): Promise<void> {
    // Check if data already exists
    const projects = await getProjects();
    if (projects.length > 0) {
        console.log('Data already exists, skipping seed');
        return;
    }

    // Create sample project
    const projectId = await createProject({
        name: 'Entrance 1 Construction',
        owner: 'SCCC',
        description: 'งานก่อสร้าง Entrance 1 และงานรั้ว Area 1-2',
        startDate: '2024-09-01',
        endDate: '2025-04-30',
        overallProgress: 78.17,
        status: 'in-progress'
    });

    // Create sample tasks
    const sampleTasks = [
        { category: 'งานเตรียมการ', name: 'งานเขียนแบบและตรวจสร้าง', weight: 1.80, progress: 100 },
        { category: 'งานเตรียมการ', name: 'งานเตรียมการในการก่อสร้าง', weight: 2.24, progress: 100 },
        { category: 'งานรั้ว Area 1', name: 'Fence type "F" (No.123-144) ไม่เสียพื้น', weight: 1.93, progress: 100 },
        { category: 'งานรั้ว Area 1', name: 'Fence type "F" (No.137-122)', weight: 0.91, progress: 98 },
        { category: 'งานรั้ว Area 1', name: 'Fence type "F" (No.108-119)', weight: 1.12, progress: 98 },
        { category: 'งานรั้ว Area 2', name: 'Concrete road entrance ซอย 3, A2', weight: 2.24, progress: 0 },
        { category: 'งานรั้ว Area 2', name: 'Concrete road entrance ซอย 4, A2', weight: 4.04, progress: 0 },
    ];

    for (let i = 0; i < sampleTasks.length; i++) {
        const task = sampleTasks[i];
        await createTask({
            projectId,
            category: task.category,
            name: task.name,
            weight: task.weight,
            planStartDate: '2024-09-01',
            planEndDate: '2025-04-30',
            planDuration: 240,
            progress: task.progress,
            status: task.progress === 100 ? 'completed' : task.progress > 0 ? 'in-progress' : 'not-started',
            order: i + 1
        });
    }

    console.log('Sample data seeded successfully');
}
