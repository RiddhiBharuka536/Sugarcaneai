
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createInterface } from "node:readline/promises";
import "dotenv/config";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const mcp = new Client({
    name: "sugarcane-ai-client",
    version: "1.0.0"
});

// Connect to server.ts.
// The MCP client starts the server process for us.
const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "server.ts"]
});

await mcp.connect(transport);

// Discover the tool from the MCP server.
const { tools: mcpTools } = await mcp.listTools();

// Convert MCP tool definitions to OpenAI function tools.
const openAITools = mcpTools.map(tool => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description ?? "",
    parameters: tool.inputSchema as any,
    strict: false
}));

console.log("Connected to Sugarcane Farmer MCP Server");
console.log("Available tools:", mcpTools.map(t => t.name).join(", "));

const rl = createInterface({
    input: process.stdin,
    output: process.stdout
});

try {
    while (true) {
        const question = (
            await rl.question("\nAsk a farmer-related question (or type exit): ")
        ).trim();

        if (question.toLowerCase() === "exit") {
            break;
        }

        if (!question) {
            continue;
        }

        // Step 1: Ask OpenAI. It can select the MCP tool.
        const response = await openai.responses.create({
            model: "gpt-4.1-mini",
            instructions:
                "You are a farmer management assistant for a sugar factory. " +
                "Use the provided database tool to answer questions about " +
                "farmer records. Base numerical answers only on returned " +
                "database data. Clearly label money in INR. If a requested " +
                "fact is not in the data, say so.",
            input: question,
            tools: openAITools,
            tool_choice: "required"
        });

        // Step 2: Find the tool call requested by OpenAI.
        const calls = response.output.filter(
            item => item.type === "function_call"
        );

        if (calls.length === 0) {
            console.log(response.output_text);
            continue;
        }

        // Step 3: Execute each requested tool through MCP.
        const toolOutputs = [];

        for (const call of calls) {
            const args = JSON.parse(call.arguments);

            const result = await mcp.callTool({
                name: call.name,
                arguments: args
            });

            const resultText = result.content
                .filter(item => item.type === "text")
                .map(item => item.text)
                .join("\n");

            toolOutputs.push({
                type: "function_call_output" as const,
                call_id: call.call_id,
                output: resultText
            });
        }

        // Step 4: Give the MCP results back to OpenAI.
        const finalResponse = await openai.responses.create({
            model: "gpt-4.1-mini",
            instructions:
                "Answer the user's question using the tool results. " +
                "Do not invent farmer records or financial figures.",
            input: [
                ...response.output,
                ...toolOutputs
            ] as any
        });

        // Step 5: Display the final answer.
        console.log("\nAI Answer:\n", finalResponse.output_text);
    }
} finally {
    rl.close();
    await mcp.close();
}
