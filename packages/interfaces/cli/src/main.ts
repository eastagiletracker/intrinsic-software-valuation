#!/usr/bin/env node

/**
 * ISV Engine CLI — entry point.
 *
 * Usage:
 *   isv calculate <ticketId>  — Calculate ISV for a single ticket
 *   isv calibrate             — Run historical calibration
 */

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "calculate": {
    const ticketId = args[1];
    if (!ticketId) {
      console.error("Usage: isv calculate <ticketId>");
      process.exit(1);
    }
    console.log(`ISV calculation for ticket: ${ticketId}`);
    console.log(
      "Note: Full CLI integration requires configured client adapters (Git, Jira, LLM).",
    );
    console.log(
      "See packages/interfaces/cli/README.md for configuration instructions.",
    );
    break;
  }

  case "calibrate": {
    console.log("ISV historical calibration");
    console.log(
      "Note: Full CLI integration requires configured client adapters (Git, Jira, LLM, Time-Tracking).",
    );
    console.log(
      "See packages/interfaces/cli/README.md for configuration instructions.",
    );
    break;
  }

  default:
    console.log("ISV Engine CLI v0.0.1");
    console.log("");
    console.log("Commands:");
    console.log("  isv calculate <ticketId>  Calculate ISV for a single ticket");
    console.log("  isv calibrate             Run historical calibration");
    console.log("");
    console.log("Options:");
    console.log("  --help                    Show this help message");
    break;
}
