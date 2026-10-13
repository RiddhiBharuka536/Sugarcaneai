
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD
});

function createServer() {
    const server = new McpServer({
        name: "sugarcane-farmer-server",
        version: "1.0.0"
    });

    // Register our ONE MCP tool
    server.registerTool(
        "get_farmer_data",
        {
            description:
                "Fetch all farmer records and summary totals from the " +
                "Sanjivani Sugar Factory demo database to answer questions " +
                "about farmers, villages, sugarcane supply, paid amounts " +
                "and pending payments.",
            inputSchema: z.object({
                question: z.string().describe(
                    "The farmer-related question asked by the user"
                )
            })
        },
        async ({ question }) => {
            try {
                // Read-only SQL: no INSERT, UPDATE or DELETE
                const farmers = await pool.query(`
                    SELECT farmer_id, farmer_name, village,
                           sugarcane_tons, total_amount,
                           amount_paid, payment_pending
                    FROM farmers
                    ORDER BY farmer_id
                `);

                const totals = await pool.query(`
                    SELECT COUNT(*) AS total_farmers,
                           COALESCE(SUM(sugarcane_tons), 0)
                               AS total_tonnes,
                           COALESCE(SUM(total_amount), 0)
                               AS total_amount,
                           COALESCE(SUM(amount_paid), 0)
                               AS total_paid,
                           COALESCE(SUM(payment_pending), 0)
                               AS total_pending
                    FROM farmers
                `);

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            question,
                            farmers: farmers.rows,
                            totals: totals.rows[0]
                        })
                    }]
                };
            } catch (error) {
                console.error("Database error:", error);

                return {
                    content: [{
                        type: "text",
                        text: "Could not retrieve farmer data. Check the PostgreSQL connection and table."
                    }],
                    isError: true
                };
            }
        }
    );

    return server;
}

// MCP communicates over stdin/stdout.
// Keep diagnostic logs on stderr, not stdout.
await serveStdio(createServer);
