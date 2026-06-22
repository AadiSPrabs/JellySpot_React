import fs from 'fs';

const files = [
  'src/screens/DetailScreen.tsx',
  'src/screens/LibraryScreen.tsx',
  'src/screens/HomeScreen.tsx',
  'src/screens/OnboardingScreen.tsx',
  'src/services/DownloadService.ts',
  'src/navigation/RootNavigator.tsx',
  'src/components/ImageWithFallback.tsx'
];
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  let curly = 0, paren = 0, bracket = 0;
  let inString = false, stringChar = null;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inRegex = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    const p = content[i-1];
    
    if (inBlockComment) { if (c === '/' && p === '*') inBlockComment = false; continue; }
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    
    if (!inString && !inTemplate && !inRegex) {
      if (c === '/' && content[i+1] === '/') { inLineComment = true; continue; }
      if (c === '/' && content[i+1] === '*') { inBlockComment = true; continue; }
    }
    
    if (inString) {
      if (c === '\\' && content[i+1] !== undefined) { i++; continue; }
      if (c === stringChar) inString = false;
      continue;
    }
    
    if (c === '`' && !inString) { inTemplate = !inTemplate; continue; }
    
    if ((c === '"' || c === "'") && !inTemplate) { inString = true; stringChar = c; continue; }
    
    if (c === '{') curly++;
    if (c === '}') curly--;
    if (c === '(') paren++;
    if (c === ')') paren--;
    if (c === '[') bracket++;
    if (c === ']') bracket--;
  }
  const ok = curly === 0 && paren === 0 && bracket === 0;
  console.log(f + ': ' + (ok ? 'OK' : 'FAIL curly=' + curly + ' paren=' + paren + ' bracket=' + bracket));
}
