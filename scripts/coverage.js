#!/usr/bin/env bun

/**
 * Test coverage script for Stellar
 * Run with: bun run scripts/coverage.js
 */

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

// Create coverage directory if it doesn't exist
const coverageDir = path.join(process.cwd(), "coverage");
if (!fs.existsSync(coverageDir)) {
  fs.mkdirSync(coverageDir);
}

// Run tests with coverage
console.log("Running tests with coverage...");
const result = spawnSync("bun", ["test", "--coverage"], {
  stdio: "inherit",
  encoding: "utf-8",
});

if (result.status !== 0) {
  console.error("Tests failed!");
  process.exit(1);
}

// Generate coverage report
console.log("\nGenerating coverage report...");
const coverageFile = path.join(coverageDir, "coverage.json");

// Read the coverage data
if (fs.existsSync(coverageFile)) {
  const coverageData = JSON.parse(fs.readFileSync(coverageFile, "utf-8"));
  
  // Calculate overall coverage
  let totalLines = 0;
  let coveredLines = 0;
  
  Object.values(coverageData.files).forEach((file) => {
    totalLines += file.lines.total;
    coveredLines += file.lines.covered;
  });
  
  const coveragePercent = (coveredLines / totalLines) * 100;
  
  // Generate summary
  console.log("\nCoverage Summary:");
  console.log("----------------");
  console.log(`Total Lines: ${totalLines}`);
  console.log(`Covered Lines: ${coveredLines}`);
  console.log(`Coverage: ${coveragePercent.toFixed(2)}%`);
  
  // Generate HTML report
  const htmlReport = `
<!DOCTYPE html>
<html>
<head>
  <title>Stellar Test Coverage</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .summary { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .progress-bar { background: #eee; height: 20px; border-radius: 10px; margin: 10px 0; }
    .progress { background: ${coveragePercent >= 80 ? '#4CAF50' : coveragePercent >= 60 ? '#FFC107' : '#F44336'}; 
                height: 100%; border-radius: 10px; width: ${coveragePercent}%; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
    th { background-color: #f2f2f2; }
    tr:hover { background-color: #f5f5f5; }
  </style>
</head>
<body>
  <h1>Stellar Test Coverage Report</h1>
  
  <div class="summary">
    <h2>Summary</h2>
    <p>Total Lines: ${totalLines}</p>
    <p>Covered Lines: ${coveredLines}</p>
    <p>Coverage: ${coveragePercent.toFixed(2)}%</p>
    <div class="progress-bar">
      <div class="progress"></div>
    </div>
  </div>
  
  <h2>File Details</h2>
  <table>
    <tr>
      <th>File</th>
      <th>Lines</th>
      <th>Coverage</th>
    </tr>
    ${Object.entries(coverageData.files)
      .map(([file, data]) => {
        const fileCoverage = (data.lines.covered / data.lines.total) * 100;
        return `
          <tr>
            <td>${file}</td>
            <td>${data.lines.covered}/${data.lines.total}</td>
            <td>${fileCoverage.toFixed(2)}%</td>
          </tr>
        `;
      })
      .join("")}
  </table>
</body>
</html>
  `;
  
  fs.writeFileSync(path.join(coverageDir, "coverage.html"), htmlReport);
  console.log(`\nHTML report generated at: ${path.join(coverageDir, "coverage.html")}`);
} else {
  console.error("No coverage data found!");
}