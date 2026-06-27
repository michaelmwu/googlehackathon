/**
 * Welcome to your Hackathon project entrypoint!
 * Running this file with Bun verifies that TypeScript and Bun are configured correctly.
 */

// biome-ignore-start lint/suspicious/noConsole: This bootstrap entrypoint intentionally reports runtime details.
console.log("🚀 Hackathon project bootstrapped successfully with Bun and TypeScript!");
console.log("Current Environment:");
console.log(`- Bun Version: ${Bun.version}`);
console.log(`- Platform: ${process.platform}`);
console.log(`- Node Env: ${process.env.NODE_ENV ?? "development"}`);
// biome-ignore-end lint/suspicious/noConsole: Restore the rule for application code.
