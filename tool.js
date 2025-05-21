import { DynamicStructuredTool } from "@langchain/core/tools";
import {ToolNode} from "@langchain/langgraph/prebuilt";
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
    return "London is Cold, with a low of 13 ℃";
  },
});

// searchTool.invoke({ query: "What's the weather like?" })

const tools = [searchTool];

const toolNode = new ToolNode(tools);

const llm = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0 });

const toolLLM = llm.bindTools(tools);

toolLLM.invoke("What is the weather like in London?").then((result) => {
  console.log(result);
});

// const llmAgent = async (state) => {
    
//     const {messages} = state;
//     const res = await toolLLM.invoke(messages)
    
//     return {messages: [res]};
// }

// // Define the graph state
// const graphState = Annotation.Root({
//     messages: Annotation({
//         reducer: (x, y) => x.concat(y)
//     })
// })

// const shouldContinue = (state) => {
//     const  {messages} = state;
//     const lastMessage = messages[messages.length - 1];
//     if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
//         return "end";
//     }
//     return "continue";
// }

// const workflow = new StateGraph(graphState)
//     .addNode("agent", llmAgent)
//     .addNode("tool", toolNode)
//     .addEdge("__start__", "agent")
//     .addConditionalEdges("agent", shouldContinue, {continue: "tool", end: "__end__"})
//     .addEdge("tool", "agent");

// const app = workflow.compile();

// const inputs = [new HumanMessage("What is the weather like in London?")];


// app.invoke({messages: inputs}).then((result) => {
//     console.log(result.messages.map((msg) => msg.content));
    
// })

