import { DynamicStructuredTool } from "@langchain/core/tools";
import {createReactAgent, ToolNode} from "@langchain/langgraph/prebuilt";
import {ChatOpenAI} from "@langchain/openai";
import {Annotation, StateGraph} from "@langchain/langgraph";
import { z } from "zod";
import { config } from "dotenv";
import { HumanMessage } from "@langchain/core/messages";
config();

const searchTool = new DynamicStructuredTool({
    name: "search",
    description:
      "Use to surf the web, fetch current information, check the weather, and retrieve other information.",
    schema: z.object({
      query: z.string().describe("The query to use in your search."),
    }),
    func: async ({}) => {
      return "Mumbai is Cold, with a low of 13 ℃";
    },
  });

const tools = [searchTool];

const llm = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0 });

const toolAgent = createReactAgent({
    llm,
    tools,
})

toolAgent.invoke(
    {messages: [new HumanMessage("What is the weather like in mumbai?")]},
).then((result) => {
    console.log(result.messages.map(m => m.content));
}
);