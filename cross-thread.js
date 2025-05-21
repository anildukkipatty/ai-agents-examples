import { InMemoryStore } from "@langchain/langgraph";
import {
	Annotation,
	StateGraph,
	START,
	MemorySaver,
	messagesStateReducer,
} from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import * as dot from "dotenv";
dot.config();

const inMemoryStore = new InMemoryStore();

const StateAnnotation = Annotation.Root({
	messages: Annotation({
		reducer: messagesStateReducer,
		default: () => [],
	}),
});

const model = new ChatOpenAI({ model: "gpt-4o" });
const callModel = async (state, config) => {
	const store = config.store;
	if (!store) {
		throw new Error("Store not found");
	}
	if (!config.configurable?.userId) {
		throw new Error("userId is required in the config");
	}

	const namespace = ["memories", config.configurable?.userId];
	const memories = await store.search(namespace);
	const info = memories.map((d) => d.value.data).join("\n");
	const systemMsg = `You are a helpful assistant talking to the user. User info: ${info}`;

	const lastMessage = state.messages[state.messages.length - 1];
	if (
		typeof lastMessage.content === "string" &&
		lastMessage.content.toLowerCase().includes("remember")
	) {
		await store.put(namespace, "some-id", { data: lastMessage.content });
	}

	const response = await model.invoke([
		{ type: "system", content: systemMsg },
		...state.messages,
	]);
	return { messages: response };
}

const builder = new StateGraph(StateAnnotation)
  .addNode("call_model", callModel)
  .addEdge(START, "call_model");

const graph = builder.compile({
  checkpointer: new MemorySaver(),
  store: inMemoryStore,
});

let config = { configurable: { thread_id: "1", userId: "1" } };
let inputMessage = { type: "user", content: "Hi! Remember: my name is Anil" };

for await (const chunk of await graph.stream(
  { messages: [inputMessage] },
  { ...config, streamMode: "values" }
)) {
  console.log(chunk.messages[chunk.messages.length - 1]);
}

config = { configurable: { thread_id: "2", userId: "1" } };
inputMessage = { type: "user", content: "what is my name?" };

for await (const chunk of await graph.stream(
  { messages: [inputMessage] },
  { ...config, streamMode: "values" }
)) {
  console.log(chunk.messages[chunk.messages.length - 1]);
}

const memories = await inMemoryStore.search(["memories", "1"]);
for (const memory of memories) {
    console.log(await memory.value);
}