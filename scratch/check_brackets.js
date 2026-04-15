
import fs from 'fs';

const content = fs.readFileSync('c:\\Users\\zaliz\\Downloads\\CryptoRSI\\components\\screener-dashboard.tsx', 'utf-8');
const lines = content.split('\n');

let balance = 0;
let inHeader = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('<header')) {
        inHeader = true;
        console.log(`Header starts at line ${i + 1}`);
    }
    
    // Simple regex for matching tags - this is crude but might help
    const openings = (line.match(/<div|<Link|<button|<Image|<motion\.button|<motion\.div|<UserProfileDropdown|<AnimatePresence/g) || []).length;
    const closings = (line.match(/<\/div>|<\/Link>|<\/button>|<\/Image>|<\/motion\.button>|<\/motion\.div>|<\/UserProfileDropdown>|<\/AnimatePresence>|\/>/g) || []).length;
    
    if (inHeader) {
        balance += (openings - closings);
        // console.log(`Line ${i + 1}: bal=${balance} (+${openings} -${closings}) content: ${line.trim()}`);
    }

    if (line.includes('</header>')) {
        console.log(`Header ends at line ${i + 1}. Balance: ${balance}`);
        inHeader = false;
    }
}
