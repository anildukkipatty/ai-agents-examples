// Multi-Agent Helpdesk System using LangGraph.js

import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { Annotation, StateGraph } from '@langchain/langgraph';
import * as readline from 'readline';
import { config } from "dotenv";
// Load environment variables from .env file
config();

// Ensure your OpenAI API key is set in the environment
if (!process.env.OPENAI_API_KEY) {
  throw new Error('Please set OPENAI_API_KEY');
}

const llm = new ChatOpenAI({ temperature: 0 });

// ---- PROMPTS ---- //
const triagePrompt = PromptTemplate.fromTemplate(`
Categorize the user issue below as one of [Billing, Technical, General].

Issue: {input}
Category:
`);

const responderPrompt = PromptTemplate.fromTemplate(`
You are a helpdesk responder specialized in {category} issues.
Generate a helpful and professional response to this user complaint:

Complaint: {input}
`);

const escalationPrompt = PromptTemplate.fromTemplate(`
Review the following draft response and determine if it should be escalated to a manager.

Response:
{response}

If it sounds uncertain or controversial, say YES.
Else, say NO.
Answer:
`);

// ---- AGENTS ---- //
const triageAgent = async (state) => {
  const inputText = state.input;
  const formatted = await triagePrompt.format({ input: inputText });
  const result = await llm.invoke(formatted);
  console.log(`Triage result: ${result.content}`);
  
  return { category: result.content.trim() };
};

const responderAgent = async (state) => {
    console.log(`Responder state: ${JSON.stringify(state)}`);
    
  const inputText = state.input;
  const category = state.category;
  const formatted = await responderPrompt.format({ input: inputText, category });
  const result = await llm.invoke(formatted);
  return { response: result.content.trim() };
};

const escalationAgent = async (state) => {
    console.log(`Escalation state: ${JSON.stringify(state)}`);
  const response = state.response;
  const formatted = await escalationPrompt.format({ response });
  const result = await llm.invoke(formatted);
  const verdict = result.content.trim().toLowerCase();
  const escalate = verdict.startsWith("yes");
    console.log(`Escalation verdict: ${verdict}`);
  return {
    escalate,
    final_answer: escalate ? "Escalated to human manager." : response
  };
};

// ---- GRAPH SETUP ---- //
const StateAnnotation = {
    input: "string",
    category: "string",
    response: "string",
    escalate: "boolean",
    final_answer: "string"
}
// const rootStateAnnotation = Annotation.Root(StateAnnotation);
const rootStateAnnotation = Annotation.Root({
    input: Annotation,
    category: Annotation,
    response: Annotation,
    escalate: Annotation,
    final_answer: Annotation,
});
const graph = new StateGraph(rootStateAnnotation)
    .addNode("triage", triageAgent)
    .addNode("responder", responderAgent)
    .addNode("escalation", escalationAgent)

    // .setEntryPoint("triage")
    .addEdge("__start__", "triage")
    .addEdge("triage", "responder")
    .addEdge("responder", "escalation")

    .addConditionalEdges("escalation", (state) => state.escalate ? "__end__" : "__end__")
.compile();

// ---- RUNNER ---- //
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


console.log("\n🧠 AI Helpdesk Demo\n");
rl.question("Describe your issue: ", async (userInput) => {
  const result = await graph.invoke({ input: userInput });
  console.log("\n🤖 Final Answer:");
  console.log(result.final_answer);
  rl.close();
});
