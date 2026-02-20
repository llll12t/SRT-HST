const fs = require('fs');
const files = {
    'src/features/gantt/domain/summaries.ts': [
        ['const start = parseDate()!;', 'const start = parseDate(t.planStartDate)!;'],
        ['const end = parseDate()!;', 'const end = parseDate(t.planEndDate)!;'],
        ['const d = parseDate()!;\n      if (!minDate', 'const d = parseDate(task.planStartDate)!;\n      if (!minDate'],
        ['const d = parseDate()!;\n      if (!maxDate', 'const d = parseDate(task.planEndDate)!;\n      if (!maxDate'],
        ['const d = parseDate()!;\n      if (!minActualDate', 'const d = parseDate(task.actualStartDate)!;\n      if (!minActualDate'],
        ['effectiveEnd = parseDate()!;', 'effectiveEnd = parseDate(task.actualEndDate)!;'],
        ['const pStart = parseDate()!;', 'const pStart = parseDate(task.planStartDate)!;'],
        ['const pEnd = parseDate()!;', 'const pEnd = parseDate(task.planEndDate)!;']
    ],
    'src/features/scurve/domain/weighting.ts': [
        ['const duration = differenceInDays(parseDate()!, parseDate()!) + 1;', 'const duration = differenceInDays(parseDate(task.planEndDate)!, parseDate(task.planStartDate)!) + 1;']
    ],
    'src/features/gantt/presentation/components/TaskRow.tsx': [
        ['const planEnd = parseDate()!;\n        const actualEnd = parseDate()!;', 'const planEnd = parseDate(t.planEndDate)!;\n        const actualEnd = parseDate(t.actualEndDate)!;']
    ],
    'src/features/gantt/presentation/hooks/useGanttTimeline.ts': [
        ['let pStart = startDate ? parseDate()! :', 'let pStart = startDate ? parseDate(startDate)! :'],
        ['let pEnd = endDate ? parseDate()! :', 'let pEnd = endDate ? parseDate(endDate)! :']
    ],
    'src/features/scurve/domain/accumulation.ts': [
        ['const pStart = parseDate()!;\n    const pEnd = parseDate()!;', 'const pStart = parseDate(task.planStartDate)!;\n    const pEnd = parseDate(task.planEndDate)!;'],
        ['let aStart = task.actualStartDate ? parseDate()! :', 'let aStart = task.actualStartDate ? parseDate(task.actualStartDate)! :'],
        ['isValid(parseDate()!)', 'isValid(parseDate(task.actualEndDate)!)'],
        ['aEnd = parseDate()!;\n    } else {', 'aEnd = parseDate(task.actualEndDate)!;\n    } else {'],
        ['if (task.actualEndDate) {\n      const d = parseDate()!;\n      if (isValid(d)', 'if (task.actualEndDate) {\n      const d = parseDate(task.actualEndDate)!;\n      if (isValid(d)'],
        ['const d = parseDate()!;\n      if (isValid(d) && isAfter(d, maxActualDate', 'const d = parseDate(task.actualStartDate)!;\n      if (isValid(d) && isAfter(d, maxActualDate']
    ],
    'src/features/scurve/presentation/components/SCurveChart.tsx': [
        ['totalDuration: leafTasks.reduce((sum, t) => sum + Math.max(0, differenceInDays(parseDate()!, parseDate()!) + 1), 0)', 'totalDuration: leafTasks.reduce((sum, t) => sum + Math.max(0, differenceInDays(parseDate(t.planEndDate)!, parseDate(t.planStartDate)!) + 1), 0)'],
        ['weight = Math.max(0, differenceInDays(parseDate()!, parseDate()!) + 1);', 'weight = Math.max(0, differenceInDays(parseDate(task.planEndDate)!, parseDate(task.planStartDate)!) + 1);'],
        ['return saved ? parseDate()! : null;', 'return saved ? parseDate(saved)! : null;'],
        ['const planStart = parseDate()!;\n            const planEnd = parseDate()!;', 'const planStart = parseDate(t.planStartDate)!;\n            const planEnd = parseDate(t.planEndDate)!;'],
        ['differenceInDays(parseDate()!, parseDate()!) + 1}d</div>}', 'differenceInDays(parseDate(task.planEndDate)!, parseDate(task.planStartDate)!) + 1}d</div>}'],
        ["task.actualStartDate && task.actualEndDate ? differenceInDays(parseDate()!, parseDate()!) + 1 : '-'", "task.actualStartDate && task.actualEndDate ? differenceInDays(parseDate(task.actualEndDate)!, parseDate(task.actualStartDate)!) + 1 : '-'"],
        ["{isValid(parseDate()!) ? `${format(parseDate()!, 'dd/MM')} - ${format(parseDate()!, 'dd/MM')}` : '-'}", "{isValid(parseDate(task.planStartDate)!) ? `${format(parseDate(task.planStartDate)!, 'dd/MM')} - ${format(parseDate(task.planEndDate)!, 'dd/MM')}` : '-'}"]
    ]
};

for (const [file, replacements] of Object.entries(files)) {
    let content = fs.readFileSync(file, 'utf8');
    for (const [target, replacement] of replacements) {
        content = content.replace(target, replacement);
    }
    fs.writeFileSync(file, content);
}
console.log('Fixed exactly!');
