
import { END, START, StateGraph, Annotation } from "@langchain/langgraph";
import fs from "fs";

const StateAnnotation = Annotation.Root({
  aggregate: Annotation({
    reducer: (x, y) => x.concat(y),
  })
});

// Create the graph
const nodeA = (state) => {
  console.log(`Adding I'm A to ${state.aggregate}`);
  return { aggregate: [`I'm A`] };
};
const nodeB = (state) => {
  console.log(`Adding I'm B to ${state.aggregate}`);
  return { aggregate: [`I'm B`] };
};
const nodeC = (state) => {
  console.log(`Adding I'm C to ${state.aggregate}`);
  return { aggregate: [`I'm C`] };
};
const nodeD = (state) => {
  console.log(`Adding I'm D to ${state.aggregate}`);
  return { aggregate: [`I'm D`] };
};

const builder = new StateGraph(StateAnnotation)
  .addNode("a", nodeA)
  .addEdge(START, "a")
  .addNode("b", nodeB)
  .addNode("c", nodeC)
  .addNode("d", nodeD)
  .addEdge("a", "b")
  .addEdge("a", "c")
  .addEdge("b", "d")
  .addEdge("c", "d")
  .addEdge("d", END);

const graph = builder.compile();

const run = async () => {
    const representation = await graph.getGraphAsync()
    const image = await representation.drawMermaidPng();
    const arrayBuffer = await image.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync('graph.png', buffer);
}

run().then(() => {});