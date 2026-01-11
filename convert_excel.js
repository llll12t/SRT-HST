const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// Path to the Excel file (One level up from app directory)
const excelPath = path.resolve('../หห.xlsx');
const outputPath = path.resolve('../converted_data.json');

console.log(`Reading file from: ${excelPath}`);

try {
    if (!fs.existsSync(excelPath)) {
        console.error('File not found at:', excelPath);
        process.exit(1);
    }

    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(sheet);

    // Write to file
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

    console.log(`Successfully converted ${data.length} rows.`);
    console.log(`JSON saved to: ${outputPath}`);

    // Preview first few items
    console.log('Preview of data:', JSON.stringify(data.slice(0, 2), null, 2));

} catch (error) {
    console.error('Error converting file:', error);
}
