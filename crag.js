
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { config } from 'dotenv';
import { Annotation, StateGraph } from "@langchain/langgraph";
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
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

async function gradeDocuments(state) {
	console.log("---CHECK RELEVANCE in progress---");

	const llmWithTool = llm.withStructuredOutput(
		z.object({
				binaryScore: z.enum(["yes", "no"]).describe("Relevance score 'yes' or 'no'"),
		}).describe("Grade the relevance of the retrieved documents to the question. Either 'yes' or 'no'."),{name: "grade"}
	);

	const prompt = PromptTemplate.fromTemplate(
		`You are a grader assessing relevance of a retrieved document to a user question.
  Here is the retrieved document:

  {context}

  Here is the user question: {question}

  If the document contains keyword(s) or semantic meaning related to the user question, grade it as relevant.
  Give a binary score 'yes' or 'no' score to indicate whether the document is relevant to the question.`
	);

	const chain = prompt.pipe(llmWithTool);

	const filteredDocs = [];
	for await (const doc of state.documents) {
		const grade = await chain.invoke({
			context: doc.pageContent,
			question: state.question,
		});
		
		if (grade.binaryScore === "yes") {
			console.log("---GRADE: DOCUMENT RELEVANT---");
			filteredDocs.push(doc);
		} else {
			console.log("---GRADE: DOCUMENT NOT RELEVANT---");
		}
	}

	return {
		documents: filteredDocs,
	};
}

async function transformQuery(state) {
  console.log("---TRANSFORM QUERY---");

  // Pull in the prompt
  const prompt = PromptTemplate.fromTemplate(
    `You are generating a question that is well optimized for semantic search retrieval.
  Look at the input and try to reason about the underlying sematic intent / meaning.
  Here is the initial question:
  \n ------- \n
  {question} 
  \n ------- \n
  Formulate an improved question: `
  );

  // Prompt
  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const betterQuestion = await chain.invoke({ question: state.question });

  return {
    question: betterQuestion,
  };
}

async function webSearch(state) {
  console.log("---WEB SEARCH---");

  const tool = new TavilySearchResults();
  const docs = await tool.invoke({ input: state.question });
  const webResults = new Document({ pageContent: docs });
  const newDocuments = state.documents.concat(webResults);

  return {
    documents: newDocuments,
  };
}

function decideToGenerate(state) {
  console.log("---DECIDE TO GENERATE---");

  const filteredDocs = state.documents;
  if (filteredDocs.length === 0) {
    console.log("---DECISION: TRANSFORM QUERY---");
    return "transformQuery";
  }

  console.log("---DECISION: GENERATE---");
  return "generate";
}

const workflow = new StateGraph(GraphState)
  // Define the nodes
  .addNode("retrieve", retrieve)
  .addNode("gradeDocuments", gradeDocuments)
  .addNode("generate", generate)
  .addNode("transformQuery", transformQuery)
  .addNode("webSearch", webSearch);

// Build graph
workflow.addEdge("__start__", "retrieve");
workflow.addEdge("retrieve", "gradeDocuments");
workflow.addConditionalEdges(
  "gradeDocuments",
  decideToGenerate,
);
workflow.addEdge("transformQuery", "webSearch");
workflow.addEdge("webSearch", "generate");
workflow.addEdge("generate", "__end__");

// Compile
const app = workflow.compile();

const inputs = {
  question: "Explain how the different types of agent memory work.",
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