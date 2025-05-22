// Multi-Agent Helpdesk System using LangGraph.js

import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { Annotation, MemorySaver, StateGraph } from '@langchain/langgraph';
import * as readline from 'readline';
import { config } from "dotenv";
import * as util from "util"
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
// Load environment variables from .env file
config();

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
let question = util.promisify(rl.question).bind(rl);