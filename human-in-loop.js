import { MemorySaver, Annotation, interrupt, Command, StateGraph } from "@langchain/langgraph";

// Define the graph state
const StateAnnotation = Annotation.Root({
  some_text: Annotation
});

function humanNode(state) {
   const value = interrupt(
      {
         text_to_revise: state.some_text
      }
   );
   return {
      // Update the state with the human's input
      some_text: value
   };
}

// Build the graph
const workflow = new StateGraph(StateAnnotation)
// Add the human-node to the graph
  .addNode("human_node", humanNode)
  .addEdge("__start__", "human_node")

// A checkpointer is required for `interrupt` to work.
const checkpointer = new MemorySaver()
const graph = workflow.compile({
   checkpointer
});

// Using stream() to directly surface the `__interrupt__` information.
for await (const chunk of await graph.stream(
   { some_text: "Original text" },
   {configurable: {thread_id: "123"}}
)) {
   console.log(chunk);
}

// Resume using Command
for await (const chunk of await graph.stream(
   new Command({ resume: "Edited text" }),
   {configurable: {thread_id: "123"}}
)) {
   console.log(chunk);
}