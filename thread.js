import { MemorySaver } from "@langchain/langgraph";
import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import {config} from "dotenv";
config();


const GraphState = Annotation.Root({
    messages: Annotation({
        reducer: (x, y) => x.concat(y),
    }),
});

const model = new ChatOpenAI({ model: "gpt-4o" });
// const boundModel = model.bindTools(tools);

import { END, START, StateGraph } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
// import { RunnableConfig } from "@langchain/core/runnables";

const routeMessage = (state) => {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1];
  // If no tools are called, we can finish (respond to the user)
  if (!lastMessage.tool_calls?.length) {
    return END;
  }
  // Otherwise if there is, we continue and call the tools
  return END;
};

const callModel = async (
  state,
  config
) => {
  const { messages } = state;
  const response = await model.invoke(messages, config);
  return { messages: [response] };
};

const workflow = new StateGraph(GraphState)
  .addNode("agent", callModel)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", routeMessage)

const checkpointer = new MemorySaver()

const graph = workflow.compile({checkpointer});

let inputs = { messages: [{ role: "user", content: "Hi I'm Anil, nice to meet you." }] };
for await (
  const { messages } of await graph.stream(inputs, {
    configurable: { thread_id: "demo-123" },
    streamMode: "values",
  })
) {
  let msg = messages[messages?.length - 1];
  if (msg?.content) {
    console.log(msg.content);
  } else if (msg?.tool_calls?.length > 0) {
    console.log(msg.tool_calls);
  } else {
    console.log(msg);
  }
  console.log("-----\n");
}

inputs = { messages: [{ role: "user", content: "Remember my name?" }] };
for await (
  const { messages } of await graph.stream(inputs, {
    configurable: { thread_id: "demo-123" },
    streamMode: "values",
  })
) {
  let msg = messages[messages?.length - 1];
  if (msg?.content) {
    console.log(msg.content);
  } else if (msg?.tool_calls?.length > 0) {
    console.log(msg.tool_calls);
  } else {
    console.log(msg);
  }
  console.log("-----\n");
}