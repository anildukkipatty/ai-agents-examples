import { ChatOpenAI } from "@langchain/openai";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph-checkpoint"
import { HumanMessage } from "@langchain/core/messages";
import { config } from "dotenv";
// Load environment variables from .env file
config();

// (Assume process.env.OPENAI_API_KEY and TAVILY_API_KEY are set)

const llm = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0 });
const tools = [ new TavilySearchResults({ maxResults: 3 }) ];
const memory = new MemorySaver();  // checkpointing memory across runs

// Create a ReAct agent graph with the LLM and the web search tool
const agent = createReactAgent({ llm, tools, checkpointSaver: memory });

// Invoke the agent on a user query (state includes a message list, etc.)
const resultState = await agent.invoke(
  { messages: [ new HumanMessage("What is the current weather in San Francisco?") ] },
  { configurable: { thread_id: "demo-123" } }  // thread_id links runs for memory
);
const finalAnswer = resultState.messages.at(-1);
console.log(finalAnswer?.content);