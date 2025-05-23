
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { config } from 'dotenv';
import { Annotation, StateGraph } from "@langchain/langgraph";
import { PromptTemplate } from "@langchain/core/prompts";
config();

const urls = [
	// "https://lilianweng.github.io/posts/2023-06-23-agent/",
	// "https://lilianweng.github.io/posts/2023-03-15-prompt-engineering/",
	"https://lilianweng.github.io/posts/2023-10-25-adv-attack-llm/",
];

const docs = await Promise.all(
	urls.map((url) => new CheerioWebBaseLoader(url).load()),
);

const docsList = docs.flat();


const textSplitter = new RecursiveCharacterTextSplitter({
	chunkSize: 250,
	chunkOverlap: 0,
});
const docSplits = await textSplitter.splitDocuments(docsList);

// Add to vectorDB
const vectorStore = await MemoryVectorStore.fromDocuments(
	docSplits,
	new OpenAIEmbeddings(),
);
const retriever = vectorStore.asRetriever();

const GraphState = Annotation.Root({
	documents: Annotation({
		reducer: (x, y) => y ?? x ?? [],
	}),
	question: Annotation({
		reducer: (x, y) => y ?? x ?? "",
	}),
	generation: Annotation({
		reducer: (x, y) => y ?? x,
	}),
});

const llm = new ChatOpenAI({
	modelName: "gpt-4o",
	temperature: 0,
});

async function retrieve(state) {
	console.log("---RETRIEVE in progress---");

	const documents = await retriever
		.withConfig({ runName: "FetchRelevantDocuments" })
		.invoke(state.question);

	return {
		documents,
	};
}


async function generate(state) {
	console.log("---GENERATE in progress---");

	const prompt = PromptTemplate.fromTemplate(`
	You are an assistant for question-answering tasks. Use the following pieces of retrieved context to answer the question. If you don't know the answer, just say that you don't know. Use three sentences maximum and keep the answer concise.
	Question: {question} 
	Context: {context} 
	Answer:
	`);

	// Construct the RAG chain by piping the prompt, model, and output parser
	const ragChain = prompt.pipe(llm).pipe(new StringOutputParser());

	const generation = await ragChain.invoke({
		context: state.documents.map((doc) => doc.pageContent).join("\n"),
		question: state.question,
	});

	return {
		generation,
	};
}

const workflow = new StateGraph(GraphState)
  // Define the nodes
  .addNode("retrieve", retrieve)
  .addNode("generate", generate);

// Build graph
workflow.addEdge("__start__", "retrieve");
workflow.addEdge("retrieve", "generate");
workflow.addEdge("generate", "__end__");

// Compile
const app = workflow.compile();

const inputs = {
  question: "Explain how prompting.",
};
const configObj = { recursionLimit: 50 };
let finalGeneration;
for await (const output of await app.stream(inputs, configObj)) {
  for (const [key, value] of Object.entries(output)) {
    console.log(`Node: '${key}'`);
    // Optional: log full state at each node
    // console.log(JSON.stringify(value, null, 2));
    finalGeneration = value;
  }
  console.log("\n---\n");
}

// Log the final generation.
console.log(JSON.stringify(finalGeneration, null, 2));