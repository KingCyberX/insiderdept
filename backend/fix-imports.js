// C:\Users\Raja Adil\Documents\realtime-charting-app\backend\fix-imports.js
import * as fs from 'fs';
import path from 'path';

// List of connector files to fix
const connectorFiles = [
  'binanceConnector.js',
  'okxConnector.js',
  'bybitConnector.js',
  'mexcConnector.js'
];

// Process each file
for (const filename of connectorFiles) {
  const filePath = path.join(process.cwd(), 'exchanges', filename);
  console.log(`\nProcessing file: ${filePath}`);
  
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      continue;
    }
    
    // Read file content
    let content = fs.readFileSync(filePath, 'utf8');
    console.log(`Successfully read file, size: ${content.length} bytes`);
    
    // Replace require with import
    let modified = false;
    
    // Replace simple requires: const name = require('module')
    if (content.includes('require(')) {
      const newContent = content.replace(/const\s+(\w+)\s*=\s*require\(['"]([^'"]+)['"]\);?/g, 
        'import $1 from \'$2\';');
      
      if (newContent !== content) {
        content = newContent;
        modified = true;
        console.log('Replaced CommonJS requires with ES imports');
      }
    }
    
    // Get class name (assumes class is defined as "class ClassName {")
    const classMatch = content.match(/class\s+(\w+)\s*\{/);
    
    if (!classMatch) {
      console.error(`Could not find class definition in ${filename}`);
      continue;
    }
    
    const className = classMatch[1];
    console.log(`Found class name: ${className}`);
    
    // Add export default statement at the end (or replace existing)
    if (!content.includes(`export default ${className}`)) {
      // Remove any existing module.exports if present
      if (content.includes('module.exports')) {
        content = content.replace(/module\.exports\s*=.*?;/g, '');
        console.log('Removed CommonJS module.exports');
        modified = true;
      }
      
      // Add export default statement at the end
      content += `\n\n// Added export\nexport default ${className};\n`;
      console.log(`Added "export default ${className}" to file`);
      modified = true;
    }
    
    if (modified) {
      // Write updated content back to file
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filename} with ES module syntax`);
    } else {
      console.log(`No changes needed for ${filename}`);
    }
    
  } catch (error) {
    console.error(`Error processing ${filename}:`, error);
  }
}

console.log('\nAll connector files processed');