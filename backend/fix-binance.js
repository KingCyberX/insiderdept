// C:\Users\Raja Adil\Documents\realtime-charting-app\backend\fix-binance.js
import * as fs from 'fs';
import path from 'path';

// Full path to the binanceConnector.js file
const filePath = path.join(process.cwd(), 'exchanges', 'binanceConnector.js');
console.log(`Reading file: ${filePath}`);

try {
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  
  // Read file content
  let content = fs.readFileSync(filePath, 'utf8');
  console.log(`Successfully read file, size: ${content.length} bytes`);
  
  // Get class name (assumes class is defined as "class ClassName {")
  const classMatch = content.match(/class\s+(\w+)\s*\{/);
  
  if (!classMatch) {
    console.error('Could not find class definition in the file');
    process.exit(1);
  }
  
  const className = classMatch[1];
  console.log(`Found class name: ${className}`);
  
  // Check if export default is already present
  if (!content.includes(`export default ${className}`)) {
    // Add export default statement at the end
    content += `\n\n// Added export\nexport default ${className};\n`;
    
    // Write updated content back to file
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Added "export default ${className}" to the file`);
  } else {
    console.log(`File already has "export default ${className}" statement`);
  }
  
  console.log('Operation completed successfully');
} catch (error) {
  console.error(`Error processing file:`, error);
}