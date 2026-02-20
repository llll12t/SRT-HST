export interface CostCode {
    id: string;
    name: string;
    category?: string;
}

export const COST_CODES: CostCode[] = [
    { id: '1', name: 'เหล็กเส้น' },
    { id: '2', name: 'เหล็กรูปพรรณ' },
    { id: '3', name: 'คอนกรีต' },
    { id: '4', name: 'ไม้แบบ' },
    { id: '5', name: 'วัสดุมุง' },
    { id: '6', name: 'ฝ้าผนัง' },
    { id: '7', name: 'ปูพื้น' },
    { id: '8', name: 'กระจก' },
    { id: '9', name: 'ไฟฟ้า' },
    { id: '10', name: 'ประปา' },
    { id: '11', name: 'อื่นๆ(วัสดุ)' },
    { id: '12', name: 'สีเคมี' },
    { id: '13', name: 'สุขภัณฑ์' },
    { id: '14', name: 'บิวอิน' },
    { id: '15', name: 'แอร์' },
    { id: '16', name: 'ดิน' },
    { id: '17', name: 'หินทราย' },
    { id: '18', name: 'เตรียมงาน' },
    { id: '101', name: 'น้ำมัน' },
    { id: '102', name: 'ค่าขนส่ง' },
    { id: '103', name: 'เครื่องจักร' },
];

export const getCostCodeName = (id: string) => {
    const code = COST_CODES.find(c => c.id === id);
    return code ? code.name : '-';
};
