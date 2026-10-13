
import cors from "cors";
import "dotenv/config";
import express from "express";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const app = express();
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
const mcp = new Client({
    name: "sugarcane-ai-api",
    version: "1.0.0"
});

app.use(cors());
app.use(express.json());

app.post("/api/chat", async (req, res) => {
    const question: unknown = req.body?.question;

    if (typeof question !== "string" || !question.trim()) {
        res.status(400).json({ error: "A question is required." });
        return;
    }

    try {
        const result = await mcp.callTool({
            name: "get_farmer_data",
            arguments: { question: question.trim() }
        });

        if (result.isError) {
            throw new Error("Could not retrieve farmer data.");
        }

        const resultText = result.content
            .filter(item => item.type === "text")
            .map(item => item.text)
            .join("\n");

        const responseStream = await openai.responses.create({
            model: "gpt-4.1-mini",
            instructions:
                "You are a sugar factory farmer management assistant. " +
                "Answer the current user question using the supplied " +
                "database results. Do not invent farmer records or " +
                "financial figures. Label money in INR. " +
                "If the requested information is unavailable, say so.",
            input:
                "Current user question:\n" + question.trim() +
                "\n\nDatabase results from MCP:\n" + resultText,
            stream: true
        });

        res.set({
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform"
        });

        for await (const event of responseStream) {
            if (event.type === "response.output_text.delta") {
                res.write(event.delta);
            }
        }

        res.end();
    } catch (error) {
        console.error("Chat API error:", error);
        if (res.headersSent) {
            res.end("\n\nSorry, something went wrong while generating the answer.");
        } else {
            res.status(500).json({ error: "Could not answer the question." });
        }
    }
});

const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "server.ts"]
});

await mcp.connect(transport);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
    console.log(`Sugarcane AI API listening on http://localhost:${port}`);
});

process.on("SIGINT", async () => {
    await mcp.close();
    process.exit(0);
});
