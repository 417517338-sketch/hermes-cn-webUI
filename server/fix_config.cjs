
const jsyaml = require("js-yaml");
const fs = require("fs");

const content = fs.readFileSync("/Users/macbook/.hermes/config.yaml", "utf-8");
const parsed = jsyaml.load(content);

// Inspect corrupted fields
const corruptedFields = ['docker_image', 'singularity_image', 'modal_image', 'daytona_image'];
console.log("=== BEFORE CLEANING ===");
for (const field of corruptedFields) {
  const val = parsed.terminal[field];
  console.log(`${field}: length=${val.length}, startsWithQuote=${val.startsWith('"')}, endsWithQuote=${val.endsWith('"')}`);
  console.log(`  first 80 chars: ${JSON.stringify(val.substring(0, 80))}`);
}

// Try to extract the true value from the corrupted strings
// The corruption pattern: string contains nested escaped quotes like \" and \\
// We need to unescape until we get the actual intended value
function deepUnescape(str) {
  let prev = null;
  let curr = str;
  let iterations = 0;
  while (curr !== prev && iterations < 20) {
    prev = curr;
    // First, try to strip outer quotes
    if ((curr.startsWith('"') && curr.endsWith('"')) || (curr.startsWith("'") && curr.endsWith("'"))) {
      curr = curr.slice(1, -1);
    }
    // Then try to unescape common escape sequences
    curr = curr
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    iterations++;
  }
  return curr;
}

console.log("\n=== ATTEMPTING DEEP UNESCAPE ===");
for (const field of corruptedFields) {
  const val = parsed.terminal[field];
  const cleaned = deepUnescape(val);
  console.log(`${field}: cleaned length=${cleaned.length}, value=${cleaned}`);
}

// Also check base_url and other URL fields for corruption
console.log("\n=== CHECKING OTHER FIELDS ===");
const urlFields = ['base_url'];
for (const field of urlFields) {
  if (parsed.model && parsed.model[field]) {
    const val = parsed.model[field];
    console.log(`model.${field}: length=${val.length}, value=${JSON.stringify(val)}`);
    const cleaned = deepUnescape(val);
    console.log(`  cleaned: ${cleaned}`);
  }
}

// Check if base_url looks like a simple unescaped URL (no nested patterns)
const baseUrl = parsed.model?.base_url;
if (baseUrl && baseUrl.includes('://') && !baseUrl.startsWith('"')) {
  console.log("base_url looks clean");
} else if (baseUrl) {
  console.log("base_url may be corrupted");
}

// Now build a cleaned config object by deep-unescaping all string fields
function cleanConfig(obj, depth = 0) {
  if (depth > 20) return obj; // safety
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    // Only clean strings that look corrupted (contain nested escape patterns)
    if (obj.includes('\\"') || (obj.startsWith('"') && obj.endsWith('"') && obj.length > 50)) {
      return deepUnescape(obj);
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => cleanConfig(item, depth + 1));
  }
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = cleanConfig(value, depth + 1);
    }
    return result;
  }
  return obj;
}

const cleanedConfig = cleanConfig(parsed);

console.log("\n=== AFTER CLEANING ===");
for (const field of corruptedFields) {
  const val = cleanedConfig.terminal[field];
  console.log(`${field}: length=${val.length}, value=${val}`);
}

// Re-dump
const redumped = jsyaml.dump(cleanedConfig, {
  quotingType: '"',
  lineWidth: -1,
  noRefs: true,
  sortKeys: false,
  schema: jsyaml.JSON_SCHEMA,
});

console.log("\n=== RE-DUMPED SIZE ===");
console.log(`Original: ${content.length} bytes`);
console.log(`Re-dumped: ${redumped.length} bytes`);

// Write to /tmp/test_fixed.yaml for inspection
fs.writeFileSync("/tmp/test_fixed.yaml", redumped, "utf-8");
console.log("\nWritten to /tmp/test_fixed.yaml for inspection");

// Verify round-trip
const verify = jsyaml.load(redumped);
console.log("\n=== VERIFICATION ===");
for (const field of corruptedFields) {
  console.log(`${field}: ${verify.terminal[field]}`);
}
